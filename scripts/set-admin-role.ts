// 役割変更・利用停止・管理者削除・クレームとの同期（02 §9.9、04 D04-50）。pnpm admin:set-role
//
//   pnpm admin:set-role --email admin@example.com --role owner
//   pnpm admin:set-role --uid <uid> --suspend      （利用停止。Auth の無効化 + 全セッション失効）
//   pnpm admin:set-role --uid <uid> --unsuspend    （停止解除。本人は再ログインが必要）
//   pnpm admin:set-role --uid <uid> --delete       （論理削除。Auth ユーザーは無効化のみで削除しない）
//   pnpm admin:set-role --uid <uid> --sync         （adminUsers 文書をカスタムクレームに合わせる）
import { parseArgs } from "node:util";

import {
  changeAdminRole,
  deleteAdminAccount,
  setAdminSuspended,
  syncAdminUserFromClaims,
} from "../lib/auth/admin-accounts";
import { ADMIN_ROLES, type AdminRole } from "../lib/db/types";
import { adminAuth } from "../lib/firebase/admin";
import { firebaseAdminEnv } from "../lib/utils/env";
import { isEntryPoint, runMain, UsageError } from "./lib/cli";
import { loadDotEnvLocal } from "./lib/load-env";

export type AdminRoleAction =
  | { readonly kind: "role"; readonly role: AdminRole }
  | { readonly kind: "suspend" }
  | { readonly kind: "unsuspend" }
  | { readonly kind: "delete" }
  | { readonly kind: "sync" };

export interface SetAdminRoleOptions {
  readonly uid?: string | undefined;
  readonly email?: string | undefined;
  readonly action: AdminRoleAction;
}

/** 引数（--role / --suspend / --unsuspend / --delete / --sync）から操作を 1 つだけ決める */
export function parseAction(values: {
  readonly role?: string | undefined;
  readonly suspend?: boolean | undefined;
  readonly unsuspend?: boolean | undefined;
  readonly delete?: boolean | undefined;
  readonly sync?: boolean | undefined;
}): AdminRoleAction {
  const actions: AdminRoleAction[] = [];
  if (values.role !== undefined) {
    if (!(ADMIN_ROLES as readonly string[]).includes(values.role)) {
      throw new UsageError(`--role は ${ADMIN_ROLES.join(" / ")} のいずれかです`);
    }
    actions.push({ kind: "role", role: values.role as AdminRole });
  }
  if (values.suspend) actions.push({ kind: "suspend" });
  if (values.unsuspend) actions.push({ kind: "unsuspend" });
  if (values.delete) actions.push({ kind: "delete" });
  if (values.sync) actions.push({ kind: "sync" });
  if (actions.length !== 1) {
    throw new UsageError(
      "--role / --suspend / --unsuspend / --delete / --sync のいずれか 1 つを指定してください",
    );
  }
  return actions[0]!;
}

async function resolveUid(opts: SetAdminRoleOptions): Promise<string> {
  if (opts.uid && opts.email) throw new UsageError("--uid と --email は同時に指定できません");
  if (opts.uid) return opts.uid;
  if (!opts.email) throw new UsageError("--uid か --email を指定してください");
  try {
    return (await adminAuth().getUserByEmail(opts.email)).uid;
  } catch {
    throw new UsageError("指定したメールアドレスのユーザーが見つかりません");
  }
}

/** 操作を実行し、結果の説明文を返す */
export async function setAdminRole(
  opts: SetAdminRoleOptions,
): Promise<{ readonly uid: string; readonly message: string }> {
  const uid = await resolveUid(opts);
  const action = opts.action;
  switch (action.kind) {
    case "role":
      await changeAdminRole({ uid, role: action.role });
      return {
        uid,
        message: `役割を ${action.role} に変更しました（全セッションを失効。本人は再ログインが必要）`,
      };
    case "suspend":
      await setAdminSuspended({ uid, isSuspended: true });
      return { uid, message: "利用停止にしました（全セッションを失効）" };
    case "unsuspend":
      await setAdminSuspended({ uid, isSuspended: false });
      return { uid, message: "利用停止を解除しました" };
    case "delete":
      await deleteAdminAccount({ uid });
      return { uid, message: "管理者を削除しました（論理削除。Auth ユーザーは無効化）" };
    case "sync": {
      const { changed } = await syncAdminUserFromClaims({ uid });
      return {
        uid,
        message: changed
          ? "adminUsers 文書をクレームに合わせました"
          : "クレームと文書は一致しています（変更なし）",
      };
    }
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: {
      uid: { type: "string" },
      email: { type: "string" },
      role: { type: "string" },
      suspend: { type: "boolean" },
      unsuspend: { type: "boolean" },
      delete: { type: "boolean" },
      sync: { type: "boolean" },
    },
    strict: true,
  });
  const action = parseAction(values);
  const env = firebaseAdminEnv();
  console.log(
    `接続先: ${env.FIRESTORE_EMULATOR_HOST ? "Firebase Emulator" : "Firebase プロジェクト"} ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`,
  );
  const result = await setAdminRole({ uid: values.uid, email: values.email, action });
  console.log(`${result.message}: uid = ${result.uid}`);
}

if (isEntryPoint(import.meta.url)) void runMain(main);
