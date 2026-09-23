// Auth + adminUsers の組み合わせ操作（02 §9.6、§9.7、§9.9）。scripts/ と POST /auth/invite が使う
import { randomBytes } from "node:crypto";

import { parseAdminClaims, toCustomClaims } from "./claims";
import type { RequestMeta } from "./claims";
import { revokeAdminSessions } from "./session-cookie";
import { COLLECTIONS } from "@/lib/db/collections";
import {
  createAdminUser,
  getAdminUser,
  isAlreadyExistsError,
  setAdminUserRole,
  setAdminUserSuspended,
  softDeleteAdminUser,
  syncAdminUserFields,
} from "@/lib/db/repositories/admin-users-repository";
import { appendAuditLog } from "@/lib/db/repositories/audit-logs-repository";
import type { AdminRole } from "@/lib/db/types";
import { adminAuth } from "@/lib/firebase/admin";

export interface CreateAdminAccountInput {
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly role: AdminRole; // create-owner は "owner"、/auth/invite は "admin"
  readonly actorKind: "system" | "admin"; // 監査ログ（admin.create / admin.signup）
  readonly meta?: RequestMeta | null;
}

/** パスワードプロバイダを持たせるための乱数パスワード。誰にも開示しない（02 D02-39） */
function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

/** 手順 2〜4（クレーム → adminUsers 文書 → 監査ログ）。各手順は冪等（02 §9.6 の 5） */
export async function completeAdminAccount(
  input: Omit<CreateAdminAccountInput, "email"> & { readonly uid: string },
): Promise<void> {
  await adminAuth().setCustomUserClaims(
    input.uid,
    toCustomClaims({ organizationId: input.organizationId, role: input.role }),
  );
  try {
    await createAdminUser({
      uid: input.uid,
      organizationId: input.organizationId,
      role: input.role,
      displayName: input.displayName,
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error; // 既存なら成功扱い（再実行）
  }
  await appendAuditLog({
    organizationId: input.organizationId,
    actorKind: input.actorKind,
    actorUid: input.actorKind === "admin" ? input.uid : null,
    actorRole: input.actorKind === "admin" ? input.role : null,
    action: input.actorKind === "admin" ? "admin.signup" : "admin.create",
    targetCollection: COLLECTIONS.adminUsers,
    targetId: input.uid,
    details: { role: input.role },
    ipAddress: input.meta?.ipAddress ?? null,
    userAgent: input.meta?.userAgent ?? null,
  });
}

/**
 * createUser（emailVerified: true、乱数パスワード）→ setCustomUserClaims → createAdminUser → auditLogs。
 * メールアドレスが既に登録済みなら Firebase の auth/email-already-exists をそのまま投げる（呼び出し元が判断する）
 */
export async function createAdminAccount(
  input: CreateAdminAccountInput,
): Promise<{ readonly uid: string }> {
  const user = await adminAuth().createUser({
    email: input.email,
    ...(input.displayName.length > 0 ? { displayName: input.displayName } : {}),
    emailVerified: true,
    password: randomPassword(),
  });
  await completeAdminAccount({ ...input, uid: user.uid });
  return { uid: user.uid };
}

/**
 * 途中失敗の回復（02 D02-40）: クレームが未設定かつ adminUsers 文書が無い既存ユーザーなら uid を返す。
 * それ以外（クレームまたは文書がある、ユーザーがいない）は null
 */
export async function findRecoverableUidByEmail(email: string): Promise<string | null> {
  let user;
  try {
    user = await adminAuth().getUserByEmail(email);
  } catch {
    return null;
  }
  if (Object.keys(user.customClaims ?? {}).length > 0) return null;
  if (await getAdminUser(user.uid)) return null;
  return user.uid;
}

async function audit(
  uid: string,
  organizationId: string,
  action: string,
  details: Record<string, string | boolean>,
) {
  await appendAuditLog({
    organizationId,
    actorKind: "system",
    actorUid: null,
    actorRole: null,
    action,
    targetCollection: COLLECTIONS.adminUsers,
    targetId: uid,
    details,
    ipAddress: null,
    userAgent: null,
  });
}

async function requireExisting(uid: string) {
  const doc = await getAdminUser(uid);
  if (!doc) throw new Error("adminUsers 文書が見つかりません");
  return doc;
}

/** setCustomUserClaims（role 差し替え）→ revokeRefreshTokens → setAdminUserRole → auditLogs（admin.role_change） */
export async function changeAdminRole(input: {
  readonly uid: string;
  readonly role: AdminRole;
}): Promise<void> {
  const doc = await requireExisting(input.uid);
  await adminAuth().setCustomUserClaims(
    input.uid,
    toCustomClaims({ organizationId: doc.organizationId, role: input.role }),
  );
  await revokeAdminSessions(input.uid);
  await setAdminUserRole({ uid: input.uid, role: input.role });
  await audit(input.uid, doc.organizationId, "admin.role_change", {
    role: input.role,
    previousRole: doc.role,
  });
}

/** updateUser({ disabled }) → revokeRefreshTokens（停止時のみ）→ setAdminUserSuspended → auditLogs */
export async function setAdminSuspended(input: {
  readonly uid: string;
  readonly isSuspended: boolean;
}): Promise<void> {
  const doc = await requireExisting(input.uid);
  await adminAuth().updateUser(input.uid, { disabled: input.isSuspended });
  if (input.isSuspended) await revokeAdminSessions(input.uid);
  await setAdminUserSuspended({ uid: input.uid, isSuspended: input.isSuspended });
  await audit(
    input.uid,
    doc.organizationId,
    input.isSuspended ? "admin.suspend" : "admin.unsuspend",
    {},
  );
}

/** updateUser({ disabled: true }) → revokeRefreshTokens → softDeleteAdminUser → auditLogs（admin.delete）。Auth ユーザーは削除しない */
export async function deleteAdminAccount(input: { readonly uid: string }): Promise<void> {
  const doc = await requireExisting(input.uid);
  await adminAuth().updateUser(input.uid, { disabled: true });
  await revokeAdminSessions(input.uid);
  await softDeleteAdminUser({ uid: input.uid });
  await audit(input.uid, doc.organizationId, "admin.delete", {});
}

/** クレームと adminUsers 文書の organizationId / role を照合し、文書をクレームに合わせる（--sync） */
export async function syncAdminUserFromClaims(input: {
  readonly uid: string;
}): Promise<{ readonly changed: boolean }> {
  const doc = await requireExisting(input.uid);
  const user = await adminAuth().getUser(input.uid);
  const claims = parseAdminClaims(user.customClaims ?? {});
  if (!claims) throw new Error("カスタムクレームが未設定または不正です");
  if (claims.organizationId === doc.organizationId && claims.role === doc.role)
    return { changed: false };
  await syncAdminUserFields({
    uid: input.uid,
    organizationId: claims.organizationId,
    role: claims.role,
  });
  await audit(input.uid, claims.organizationId, "admin.role_change", {
    role: claims.role,
    synced: true,
  });
  return { changed: true };
}
