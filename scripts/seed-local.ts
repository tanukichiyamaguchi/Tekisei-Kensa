// Emulator 用のシード（02 §13.2）。pnpm seed:local（Emulator 起動後。冪等ではないため、再投入は Emulator を再起動してから）
//
//   SEED_OWNER_PASSWORD=... pnpm seed:local [--owner-email owner@example.com] [--admin-email admin@example.com]
//
// 本番・検証プロジェクトには投入しない（Emulator の環境変数が無ければ拒否する）。
// 投入はリポジトリ関数・lib/auth の関数だけで行い、Firestore に直接書かない（シード自体がリポジトリの結合テストを兼ねる）。
import { parseArgs } from "node:util";

import { createAdminAccount } from "../lib/auth/admin-accounts";
import type { Viewer } from "../lib/auth/claims";
import { inviteLink } from "../lib/auth/invite-token";
import { issueRespondentToken } from "../lib/auth/respondent-token";
import { saveAnswers, submitSession } from "../lib/db/repositories/assessment-sessions-repository";
import { createOrganization } from "../lib/db/repositories/organizations-repository";
import {
  registerRespondent,
  updateRespondentFlags,
} from "../lib/db/repositories/respondents-repository";
import type { RespondentKind, TeamCode } from "../lib/db/types";
import { adminAuth } from "../lib/firebase/admin";
import { getExamPage } from "../lib/presentation/exam-pages";
import type { AnswerMap } from "../lib/scoring/types";
import { appBaseUrl, firebaseAdminEnv } from "../lib/utils/env";
import { isEntryPoint, runMain, UsageError } from "./lib/cli";
import { loadDotEnvLocal } from "./lib/load-env";
import { cyclicAnswers, randomAnswers, uniformAnswers } from "./lib/synthetic-answers";

export interface SeedOptions {
  readonly ownerEmail: string;
  readonly adminEmail: string;
  /** Emulator では再設定メールが届かないため、Admin SDK で直接設定する（ローカル専用） */
  readonly password: string;
}

export interface SeedSummary {
  readonly organizationId: string;
  readonly inviteLink: string;
  readonly ownerUid: string;
  readonly adminUid: string;
  /** 送信済みの受検者（求職者 8 人・幹部 2 人） */
  readonly submitted: ReadonlyArray<{
    readonly respondentId: string;
    readonly resultId: string;
    readonly kind: RespondentKind;
  }>;
  /** 送信前の下書き 1 人 */
  readonly draftSessionId: string;
}

interface SeedRespondent {
  readonly kind: RespondentKind;
  readonly answers: AnswerMap;
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
}

/** 求職者 8 人・幹部 2 人（幹部の 1 人は比較から除外）。チーム A・B を混在させる（02 §13.2） */
const RESPONDENTS: readonly SeedRespondent[] = [
  { kind: "applicant", answers: uniformAnswers(1), teamCode: "A", isExcluded: false },
  { kind: "applicant", answers: uniformAnswers(3), teamCode: "A", isExcluded: false },
  { kind: "applicant", answers: cyclicAnswers(), teamCode: "B", isExcluded: false },
  { kind: "applicant", answers: randomAnswers(101), teamCode: "B", isExcluded: false },
  { kind: "applicant", answers: randomAnswers(102), teamCode: "A", isExcluded: false },
  { kind: "applicant", answers: randomAnswers(103), teamCode: null, isExcluded: false },
  { kind: "applicant", answers: randomAnswers(104), teamCode: "B", isExcluded: false },
  { kind: "applicant", answers: randomAnswers(105), teamCode: null, isExcluded: false },
  { kind: "executive", answers: randomAnswers(201), teamCode: "A", isExcluded: false },
  { kind: "executive", answers: randomAnswers(202), teamCode: null, isExcluded: true },
];

const meta = { ipAddress: "127.0.0.1", userAgent: "seed-local" } as const;

/** Emulator 以外への接続を拒否する */
export function assertEmulator(): void {
  const env = firebaseAdminEnv();
  if (!env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new UsageError(
      "seed:local は Firebase Emulator 専用です。FIRESTORE_EMULATOR_HOST と FIREBASE_AUTH_EMULATOR_HOST を設定してください",
    );
  }
}

/** 登録して lastPage まで回答を保存する（E2E の tests/e2e/support/emulator-task.ts も使う） */
export async function registerAndSave(
  organizationId: string,
  index: number,
  kind: RespondentKind,
  answers: AnswerMap,
  lastPage: number,
) {
  const token = issueRespondentToken(new Date());
  const registered = await registerRespondent({
    organizationId,
    kind,
    name: `テストテスト ${String(index).padStart(2, "0")}`,
    phoneNumber: `090-0000-${String(index).padStart(4, "0")}`,
    occupationCode: (index % 9) + 1,
    diagnosisExperience: index % 3 === 0 ? "experienced" : "first_time",
    sessionTokenHash: token.tokenHash,
    tokenExpiresAt: token.expiresAt,
    meta,
  });
  for (let pageNo = 1; pageNo <= lastPage; pageNo += 1) {
    const page: Record<number, AnswerMap[number]> = {};
    for (const q of getExamPage(pageNo).questions) {
      const v = answers[q.questionNo];
      if (v !== undefined) page[q.questionNo] = v;
    }
    if (Object.keys(page).length === 0) continue;
    await saveAnswers({
      sessionId: registered.sessionId,
      answers: page,
      lastSavedPageNo: pageNo,
      tokenExpiresAt: token.expiresAt,
    });
  }
  return registered;
}

export async function seedLocal(
  options: SeedOptions,
  deps: { readonly baseUrl: string; readonly print: (line: string) => void },
): Promise<SeedSummary> {
  assertEmulator();
  if (options.password.length < 8) throw new UsageError("パスワードは 8 文字以上にしてください");

  const org = await createOrganization({
    name: "ローカル歯科医院",
    code: "LOCAL-001",
    customerNumber: "C-LOCAL",
  });
  const link = inviteLink(deps.baseUrl, org.inviteToken);
  const accounts: Record<"owner" | "admin", string> = { owner: "", admin: "" };
  for (const [role, email, displayName] of [
    ["owner", options.ownerEmail, "テストテスト 院長"],
    ["admin", options.adminEmail, "テストテスト 管理者"],
  ] as const) {
    const { uid } = await createAdminAccount({
      email,
      displayName,
      organizationId: org.organizationId,
      role,
      actorKind: "system",
    });
    await adminAuth().updateUser(uid, { password: options.password }); // ローカル専用の分岐（02 §13.2）
    accounts[role] = uid;
  }
  const ownerViewer: Viewer = {
    uid: accounts.owner,
    organizationId: org.organizationId,
    role: "owner",
  };

  const submitted: Array<{ respondentId: string; resultId: string; kind: RespondentKind }> = [];
  let index = 1;
  for (const r of RESPONDENTS) {
    const registered = await registerAndSave(org.organizationId, index, r.kind, r.answers, 20);
    const { resultId } = await submitSession({ sessionId: registered.sessionId, meta });
    if (r.teamCode !== null || r.isExcluded) {
      await updateRespondentFlags({
        respondentId: registered.respondentId,
        viewer: ownerViewer,
        patch: { teamCode: r.teamCode, isExcluded: r.isExcluded },
        meta,
      });
    }
    submitted.push({ respondentId: registered.respondentId, resultId, kind: r.kind });
    index += 1;
  }
  // 送信前の下書き 1 人（5 ページまで回答）
  const draft = await registerAndSave(
    org.organizationId,
    index,
    "applicant",
    randomAnswers(301),
    5,
  );

  deps.print(`組織: ${org.organizationId}（ローカル歯科医院）`);
  deps.print(`管理者追加用リンク: ${link}`);
  deps.print(`オーナー: ${options.ownerEmail}（uid ${accounts.owner}）`);
  deps.print(`管理者: ${options.adminEmail}（uid ${accounts.admin}）`);
  deps.print(`送信済みの受検者: 求職者 8 人・幹部 2 人。送信前の下書き: 1 人`);
  return {
    organizationId: org.organizationId,
    inviteLink: link,
    ownerUid: accounts.owner,
    adminUid: accounts.admin,
    submitted,
    draftSessionId: draft.sessionId,
  };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: {
      "owner-email": { type: "string" },
      "admin-email": { type: "string" },
      password: { type: "string" },
    },
    strict: true,
  });
  // .env.local の「KEY=」（空文字）は未設定として扱う
  const password = values.password || process.env.SEED_OWNER_PASSWORD;
  if (!password) {
    throw new UsageError(
      "ログイン用のパスワードを --password か環境変数 SEED_OWNER_PASSWORD で指定してください（8 文字以上）",
    );
  }
  await seedLocal(
    {
      ownerEmail: values["owner-email"] || process.env.SEED_OWNER_EMAIL || "owner@example.com",
      adminEmail: values["admin-email"] || process.env.SEED_ADMIN_EMAIL || "admin@example.com",
      password,
    },
    {
      baseUrl: appBaseUrl({
        NEXT_PUBLIC_APP_BASE_URL: process.env.NEXT_PUBLIC_APP_BASE_URL || undefined,
        VERCEL_URL: undefined,
      }),
      print: (line) => console.log(line),
    },
  );
}

if (isEntryPoint(import.meta.url)) void runMain(main);
