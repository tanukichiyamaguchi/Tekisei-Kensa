// 監査ログ（04 §2.6）。02 の appendAuditLog / addAuditLogToBatch を呼び、RequestMeta を平坦なフィールドに写す
import type { RequestMeta } from "@/lib/auth/request-meta";
import {
  addAuditLogToBatch,
  appendAuditLog,
  type AuditWriter,
} from "@/lib/db/repositories/audit-logs-repository";
import type { AdminRole, AuditDetails } from "@/lib/db/types";
import { errorFields, logger } from "@/lib/utils/logger";

export type AuditAction =
  | "respondent.register"
  | "session.start"
  | "session.submit"
  | "admin.signup"
  | "admin.login"
  | "admin.claims_mismatch"
  | "result.list"
  | "result.view"
  | "result.comparison"
  | "result.ai_generate"
  | "result.pdf_export"
  | "respondent.update_team"
  | "respondent.update_exclusion"
  | "respondent.delete"
  | "usage_log.view"
  | "classification.view"
  | "account.update"
  | "organization.rotate_invite_token"
  // 以下はリポジトリ・スクリプト（02 §9.6、§9.9）が書く。AuditAction の全集合は 02 §11 の表と一致させる
  | "organization.create"
  | "admin.create"
  | "admin.role_change"
  | "admin.suspend"
  | "admin.unsuspend"
  | "admin.delete";

export interface AuditEntry {
  readonly organizationId: string;
  readonly actorKind: "admin" | "respondent" | "system";
  readonly actorUid: string | null;
  readonly actorRole: AdminRole | null;
  readonly action: AuditAction;
  readonly targetCollection: string | null;
  readonly targetId: string | null;
  readonly details: AuditDetails;
  readonly request: RequestMeta | null;
}

export type { AuditDetails, AuditWriter };

function flatten(entry: AuditEntry) {
  return {
    organizationId: entry.organizationId,
    actorKind: entry.actorKind,
    actorUid: entry.actorUid,
    actorRole: entry.actorRole,
    action: entry.action,
    targetCollection: entry.targetCollection,
    targetId: entry.targetId,
    details: entry.details,
    ipAddress: entry.request?.ipAddress ?? null,
    userAgent: entry.request?.userAgent ?? null,
  };
}

/** 単独で追記する（閲覧系）。失敗しても業務処理は成功させ、warn を出す（D04-11） */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await appendAuditLog(flatten(entry));
  } catch (error) {
    logger.warn("audit.write_failed", {
      requestId: entry.request?.requestId ?? null,
      action: entry.action,
      ...errorFields(error),
    });
  }
}

/** 更新系: 本処理と同じ WriteBatch / Transaction に積む。失敗すれば本処理も失敗する */
export function enqueueAuditLog(writer: AuditWriter, entry: AuditEntry): void {
  addAuditLogToBatch(writer, flatten(entry));
}

/** 失敗を呼び出し元に返す追記（admin.login など、記録そのものが API の目的のもの） */
export async function appendAuditLogStrict(entry: AuditEntry): Promise<void> {
  await appendAuditLog(flatten(entry));
}
