// 管理者（02 §3.2、§8.3）。文書 ID = Firebase Auth の uid
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminUsersRef, COLLECTIONS, db, rawCollection } from "@/lib/db/collections";
import type { AdminUser } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toAdminUser } from "@/lib/db/mappers/documents";
import {
  adminUserCreateSchema,
  announcementKeySchema,
  displayNameSchema,
} from "@/lib/db/schemas/admin-user";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { AdminRole, AnnouncementKey } from "@/lib/db/types";

export interface CreateAdminUserInput {
  readonly uid: string;
  readonly organizationId: string;
  readonly role: AdminRole;
  readonly displayName: string;
}

/** gRPC の ALREADY_EXISTS（create() が既存文書を拒否したとき） */
export function isAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/**
 * adminUsers 文書を作成する（create()。既に存在すれば RepositoryError ではなく Firestore の ALREADY_EXISTS で失敗する）。
 * お知らせの既読は空の map で作る（11-8 §3.3）
 */
export async function createAdminUser(input: CreateAdminUserInput): Promise<void> {
  validateForWrite(docIdSchema, input.uid, "adminUsers.uid");
  const data = validateForWrite(
    adminUserCreateSchema,
    {
      organizationId: input.organizationId,
      role: input.role,
      displayName: input.displayName,
      isSuspended: false,
      dismissedAnnouncements: {},
      deletedAt: null,
    },
    "adminUsers",
  );
  await rawCollection(COLLECTIONS.adminUsers)
    .doc(input.uid)
    .create({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/** 文書を返す（isSuspended / deletedAt の判定は呼び出し元（requireAdmin）が行う）。無ければ null */
export async function getAdminUser(uid: string): Promise<AdminUser | null> {
  if (!docIdSchema.safeParse(uid).success) return null;
  return fromSnapshot(await adminUsersRef().doc(uid).get(), toAdminUser);
}

/** 同一組織の deletedAt == null の管理者を createdAt 昇順で返す（Q8） */
export async function listAdminUsers(organizationId: string): Promise<readonly AdminUser[]> {
  const snapshot = await adminUsersRef()
    .where("organizationId", "==", organizationId)
    .where("deletedAt", "==", null)
    .orderBy("createdAt", "asc")
    .get();
  return snapshot.docs.map((d) => toAdminUser(d.id, d.data()));
}

/**
 * 組織の有効な責任者（Q-M7-2。11-8 §3.4）: organizationId ==、role == "owner"、deletedAt == null。
 * 停止中（isSuspended）の責任者も返す（停止の判定は呼び出し元）。結果は保存しない（停止と解除をすぐ反映する）
 */
export async function listActiveOwners(organizationId: string): Promise<readonly AdminUser[]> {
  const snapshot = await adminUsersRef()
    .where("organizationId", "==", organizationId)
    .where("role", "==", "owner")
    .where("deletedAt", "==", null)
    .get();
  return snapshot.docs.map((d) => toAdminUser(d.id, d.data()));
}

/**
 * お知らせの既読を保存する（11-8 §3.3）。トランザクションで文書を読み、文書が無い・削除済み・そのキーが既読なら
 * 書かない（最初の日時を保つので、何度呼んでも同じ）。キーが無ければ dismissedAnnouncements.{key} と updatedAt に
 * サーバの時刻を書く（項目の無い M7 より前の文書でも map ができる）。監査ログは書かない
 */
export async function markAnnouncementDismissed(uid: string, key: AnnouncementKey): Promise<void> {
  if (!docIdSchema.safeParse(uid).success) return;
  const announcementKey = validateForWrite(
    announcementKeySchema,
    key,
    "adminUsers.dismissedAnnouncements",
  );
  await db().runTransaction(async (tx) => {
    const user = fromSnapshot(await tx.get(adminUsersRef().doc(uid)), toAdminUser);
    if (!user || user.deletedAt !== null || user.dismissedAnnouncements.has(announcementKey)) {
      return;
    }
    tx.update(
      rawCollection(COLLECTIONS.adminUsers).doc(uid),
      new FieldPath("dismissedAnnouncements", announcementKey),
      FieldValue.serverTimestamp(),
      "updatedAt",
      FieldValue.serverTimestamp(),
    );
  });
}

async function requireAdminUser(uid: string): Promise<AdminUser> {
  const user = await getAdminUser(uid);
  if (!user) throw new RepositoryError("ADMIN_USER_NOT_FOUND", "管理者が見つかりません");
  return user;
}

export async function updateAdminUserDisplayName(input: {
  readonly uid: string;
  readonly organizationId: string;
  readonly displayName: string;
}): Promise<void> {
  const displayName = validateForWrite(
    displayNameSchema,
    input.displayName,
    "adminUsers.displayName",
  );
  const user = await requireAdminUser(input.uid);
  if (user.organizationId !== input.organizationId || user.deletedAt !== null) {
    throw new RepositoryError("ADMIN_USER_NOT_FOUND", "管理者が見つかりません");
  }
  await rawCollection(COLLECTIONS.adminUsers)
    .doc(input.uid)
    .update({ displayName, updatedAt: FieldValue.serverTimestamp() });
}

/** 以下は scripts/set-admin-role 専用（Auth 側の操作と組み合わせるのは lib/auth/admin-accounts.ts。02 §9.9） */
export async function setAdminUserRole(input: {
  readonly uid: string;
  readonly role: AdminRole;
}): Promise<void> {
  await requireAdminUser(input.uid);
  await rawCollection(COLLECTIONS.adminUsers)
    .doc(input.uid)
    .update({ role: input.role, updatedAt: FieldValue.serverTimestamp() });
}

/** クレームに合わせて organizationId と role を書き換える（--sync。02 §9.9） */
export async function syncAdminUserFields(input: {
  readonly uid: string;
  readonly organizationId: string;
  readonly role: AdminRole;
}): Promise<void> {
  await requireAdminUser(input.uid);
  await rawCollection(COLLECTIONS.adminUsers).doc(input.uid).update({
    organizationId: input.organizationId,
    role: input.role,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function setAdminUserSuspended(input: {
  readonly uid: string;
  readonly isSuspended: boolean;
}): Promise<void> {
  await requireAdminUser(input.uid);
  await rawCollection(COLLECTIONS.adminUsers)
    .doc(input.uid)
    .update({ isSuspended: input.isSuspended, updatedAt: FieldValue.serverTimestamp() });
}

export async function softDeleteAdminUser(input: { readonly uid: string }): Promise<void> {
  await requireAdminUser(input.uid);
  await rawCollection(COLLECTIONS.adminUsers)
    .doc(input.uid)
    .update({ deletedAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() });
}
