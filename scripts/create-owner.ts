// 組織と初期オーナーの作成（02 §9.6、01 §7.6）。pnpm owner:create
//
//   pnpm owner:create --org-name "〇〇歯科医院" [--org-code "..."] [--customer-number "..."] \
//     --email owner@example.com --display-name "院長"
//   既存組織にオーナーを追加する / 途中で失敗した作成をやり直す: --organization-id <ID> を付ける
//   GitHub Actions（.github/workflows/firebase-ops.yml）から実行する場合は --hide-invite-link を付ける（招待リンクをログに残さない）
//
// メールは送らない。オーナーはログイン画面の「パスワードをお忘れの方」から再設定メールで初期パスワードを設定する。
// 本番・検証プロジェクトに対する実行は依頼主または運用責任者が行う（実装者は Emulator に対してのみ実行する。01）。
import { parseArgs } from "node:util";

import { z } from "zod";

import {
  completeAdminAccount,
  createAdminAccount,
  findRecoverableUidByEmail,
} from "../lib/auth/admin-accounts";
import { inviteLink } from "../lib/auth/invite-token";
import { displayNameSchema } from "../lib/db/schemas/admin-user";
import {
  createOrganization,
  getOrganization,
} from "../lib/db/repositories/organizations-repository";
import { adminAuth } from "../lib/firebase/admin";
import { appBaseUrl, firebaseAdminEnv } from "../lib/utils/env";
import { isEntryPoint, runMain, UsageError } from "./lib/cli";
import { loadDotEnvLocal } from "./lib/load-env";

export interface CreateOwnerOptions {
  /** 既存組織に追加する場合（または途中失敗のやり直し）。無ければ orgName で新規作成する */
  readonly organizationId?: string | undefined;
  readonly orgName?: string | undefined;
  readonly orgCode?: string | null | undefined;
  readonly customerNumber?: string | null | undefined;
  readonly email: string;
  readonly displayName: string;
}

export interface CreateOwnerResult {
  readonly organizationId: string;
  readonly uid: string;
  /** 新規作成した組織の管理者追加用リンク（平文）。既存組織なら null */
  readonly inviteLink: string | null;
  /** 途中失敗のやり直しでクレーム・文書を補完した場合 true */
  readonly recovered: boolean;
}

const optionsSchema = z.object({
  organizationId: z
    .string()
    .regex(/^[A-Za-z0-9]{1,128}$/, { message: "--organization-id の形式が不正です" })
    .optional(),
  orgName: z.string().trim().min(1).max(200).optional(),
  orgCode: z.string().trim().min(1).max(100).nullable().optional(),
  customerNumber: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.email({ message: "--email の形式が不正です" }).max(254),
  displayName: displayNameSchema,
});

function alreadyExists(message: string): Error {
  return Object.assign(new Error(message), { code: "auth/email-already-exists" });
}

async function existingUid(email: string): Promise<string | null> {
  try {
    return (await adminAuth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

/**
 * 組織（無ければ）とオーナーを作る。print には標準出力への 1 行出力を渡す（招待リンクはここに 1 回だけ出る）。
 * メールアドレスが登録済みなら、組織を作る前に auth/email-already-exists で失敗する（文書を増やさない）。
 * ただし --organization-id 指定時に、クレーム未設定かつ adminUsers 文書が無いユーザーなら手順 2〜4 をやり直す（02 §9.6 の 5）
 */
export async function createOwner(
  input: CreateOwnerOptions,
  deps: {
    readonly baseUrl: string;
    readonly print: (line: string) => void;
    /** 招待リンクを出力しない（GitHub Actions など、出力がログに残る場所で実行する場合。10 K-12） */
    readonly hideInviteLink?: boolean;
  },
): Promise<CreateOwnerResult> {
  const parsed = optionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new UsageError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  const opts = parsed.data;
  if (!opts.organizationId && !opts.orgName)
    throw new UsageError("--org-name か --organization-id を指定してください");
  if (opts.organizationId && opts.orgName) {
    throw new UsageError("--org-name と --organization-id は同時に指定できません");
  }

  const uidInUse = await existingUid(opts.email);
  if (uidInUse && !opts.organizationId) {
    throw alreadyExists(
      "このメールアドレスは登録済みです。途中で失敗した作成をやり直す場合は --organization-id を付けて実行してください",
    );
  }

  let organizationId: string;
  let link: string | null = null;
  if (opts.organizationId) {
    const org = await getOrganization(opts.organizationId);
    if (!org) throw new UsageError("指定した組織が見つかりません（論理削除済みを含む）");
    organizationId = org.id;
  } else {
    const created = await createOrganization({
      name: opts.orgName ?? "",
      code: opts.orgCode ?? null,
      customerNumber: opts.customerNumber ?? null,
    });
    organizationId = created.organizationId;
    link = inviteLink(deps.baseUrl, created.inviteToken);
    deps.print(`組織を作成しました: organizationId = ${organizationId}`);
    if (deps.hideInviteLink) {
      deps.print(
        "管理者追加用リンクはログに残さないため表示しません。必要になったらオーナーが管理画面で発行し直してください（旧リンクは無効になります）",
      );
    } else {
      deps.print(
        `管理者追加用リンク（この 1 回だけ表示します。安全な経路でオーナーに渡してください）: ${link}`,
      );
    }
  }

  const account = {
    email: opts.email,
    displayName: opts.displayName,
    organizationId,
    role: "owner" as const,
    actorKind: "system" as const,
  };
  let uid: string;
  let recovered = false;
  if (uidInUse) {
    const recoverable = await findRecoverableUidByEmail(opts.email);
    if (!recoverable)
      throw alreadyExists(
        "このメールアドレスは登録済みです（クレームまたは adminUsers 文書があります）",
      );
    await completeAdminAccount({ ...account, uid: recoverable });
    uid = recoverable;
    recovered = true;
  } else {
    uid = (await createAdminAccount(account)).uid;
  }
  deps.print(`オーナーを${recovered ? "補完" : "作成"}しました: uid = ${uid}`);
  deps.print(
    "オーナーには、ログイン画面の「パスワードをお忘れの方」から同じメールアドレスで再設定メールを受け取り、初期パスワードを設定するよう案内してください。",
  );
  return { organizationId, uid, inviteLink: link, recovered };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: {
      "organization-id": { type: "string" },
      "org-name": { type: "string" },
      "org-code": { type: "string" },
      "customer-number": { type: "string" },
      email: { type: "string" },
      "display-name": { type: "string" },
      "hide-invite-link": { type: "boolean" },
    },
    strict: true,
  });
  if (!values.email) throw new UsageError("--email を指定してください");
  const env = firebaseAdminEnv();
  console.log(
    `接続先: ${env.FIRESTORE_EMULATOR_HOST ? "Firebase Emulator" : "Firebase プロジェクト"} ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`,
  );
  await createOwner(
    {
      organizationId: values["organization-id"],
      orgName: values["org-name"],
      orgCode: values["org-code"] ?? null,
      customerNumber: values["customer-number"] ?? null,
      email: values.email,
      displayName: values["display-name"] ?? "",
    },
    {
      baseUrl: appBaseUrl({
        NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL || undefined,
        VERCEL_URL: undefined,
      }),
      print: (line) => console.log(line),
      hideInviteLink: values["hide-invite-link"] === true,
    },
  );
}

if (isEntryPoint(import.meta.url)) void runMain(main);
