// 監査ログ（02 §3.8、§8.6、§11）。追記のみ（更新・削除する関数を作らない。I-14）
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Transaction, WriteBatch } from "firebase-admin/firestore";

import { COLLECTIONS, rawCollection } from "@/lib/db/collections";
import { auditLogCreateSchema } from "@/lib/db/schemas/audit-log";
import { validateForWrite } from "@/lib/db/schemas/validate";
import type { AdminRole, AuditActorKind, AuditDetails } from "@/lib/db/types";

export interface AuditEntry {
  readonly organizationId: string;
  readonly actorKind: AuditActorKind;
  readonly actorUid: string | null;
  readonly actorRole: AdminRole | null;
  readonly action: string; // 04 の AuditAction ∪ 02 §11 の一覧
  readonly targetCollection: string | null;
  readonly targetId: string | null;
  readonly details: AuditDetails;
  readonly ipAddress: string | null;
  readonly userAgent: string | null; // 500 文字に切り詰める
}

/** 監査ログを同じ書き込み単位に含めるための型（04 §2.6 と共有） */
export type AuditWriter = WriteBatch | Transaction;

function toAuditData(entry: AuditEntry) {
  const data = validateForWrite(
    auditLogCreateSchema,
    {
      organizationId: entry.organizationId,
      actorKind: entry.actorKind,
      actorUid: entry.actorUid,
      actorRole: entry.actorRole,
      action: entry.action,
      targetCollection: entry.targetCollection,
      targetId: entry.targetId,
      details: { ...entry.details },
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent === null ? null : entry.userAgent.slice(0, 500),
    },
    "auditLogs",
  );
  const now = FieldValue.serverTimestamp();
  return { ...data, createdAt: now, updatedAt: now };
}

/** 他のリポジトリ・04 の service がバッチ／トランザクションに監査ログを含める。戻り値は採番した auditLogId */
export function addAuditLogToBatch(writer: AuditWriter, entry: AuditEntry): string {
  const ref = rawCollection(COLLECTIONS.auditLogs).doc();
  const data = toAuditData(entry);
  if ("getAll" in writer) (writer as Transaction).create(ref, data);
  else (writer as WriteBatch).create(ref, data);
  return ref.id;
}

/** 単独の追記（閲覧系の記録。04 の service が呼ぶ） */
export async function appendAuditLog(entry: AuditEntry): Promise<{ readonly auditLogId: string }> {
  const ref = rawCollection(COLLECTIONS.auditLogs).doc();
  await ref.create(toAuditData(entry));
  return { auditLogId: ref.id };
}

/** レート制限用（Q11、count() 集計）。organizationId・action・ipAddress が一致し createdAt >= since の件数 */
export async function countRecentAuditLogs(input: {
  readonly organizationId: string;
  readonly action: string;
  readonly ipAddress: string;
  readonly since: Date;
}): Promise<number> {
  const snapshot = await rawCollection(COLLECTIONS.auditLogs)
    .where("organizationId", "==", input.organizationId)
    .where("action", "==", input.action)
    .where("ipAddress", "==", input.ipAddress)
    .where("createdAt", ">=", Timestamp.fromDate(input.since))
    .count()
    .get();
  return snapshot.data().count;
}
