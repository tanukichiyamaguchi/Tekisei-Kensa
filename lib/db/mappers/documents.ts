// Doc → ドメイン型（02 §5.5）。Timestamp を Date に変換し、必須フィールドの欠落は例外にする。
import type { DocumentSnapshot } from "firebase-admin/firestore";

import { MappingError, toDate, toNullableDate } from "./timestamp";
import type {
  AdminUser,
  AiAnalysis,
  AssessmentSession,
  AuditLog,
  Organization,
  Respondent,
  UsageLog,
} from "@/lib/db/domain";
import type {
  AdminUserDoc,
  AiAnalysisDoc,
  AssessmentSessionDoc,
  AuditLogDoc,
  OrganizationDoc,
  RespondentDoc,
  UsageLogDoc,
} from "@/lib/db/types";

function requireFields(doc: object, fields: readonly string[], where: string): void {
  for (const f of fields) {
    if (!(f in doc) || (doc as Record<string, unknown>)[f] === undefined) {
      throw new MappingError(`${where}.${f} がありません`);
    }
  }
}

export function toOrganization(id: string, doc: OrganizationDoc): Organization {
  requireFields(doc, ["name", "code", "customerNumber", "inviteTokenHash"], "organizations");
  return {
    id,
    name: doc.name,
    code: doc.code,
    customerNumber: doc.customerNumber,
    inviteTokenHash: doc.inviteTokenHash,
    inviteTokenIssuedAt: toDate(doc.inviteTokenIssuedAt, "inviteTokenIssuedAt"),
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}

export function toAdminUser(id: string, doc: AdminUserDoc): AdminUser {
  requireFields(doc, ["organizationId", "role", "displayName", "isSuspended"], "adminUsers");
  return {
    id,
    organizationId: doc.organizationId,
    role: doc.role,
    displayName: doc.displayName,
    isSuspended: doc.isSuspended,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}

export function toRespondent(id: string, doc: RespondentDoc): Respondent {
  requireFields(
    doc,
    [
      "organizationId",
      "kind",
      "name",
      "phoneNumber",
      "occupationCode",
      "diagnosisExperience",
      "teamCode",
      "isExcluded",
      "sessionId",
      "usageLogId",
      "resultId",
    ],
    "respondents",
  );
  return {
    id,
    organizationId: doc.organizationId,
    kind: doc.kind,
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    occupationCode: doc.occupationCode,
    diagnosisExperience: doc.diagnosisExperience,
    teamCode: doc.teamCode,
    isExcluded: doc.isExcluded,
    sessionId: doc.sessionId,
    usageLogId: doc.usageLogId,
    resultId: doc.resultId,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}

export function toAssessmentSession(id: string, doc: AssessmentSessionDoc): AssessmentSession {
  requireFields(
    doc,
    [
      "organizationId",
      "respondentId",
      "status",
      "sessionTokenHash",
      "answers",
      "lastSavedPageNo",
      "resultId",
    ],
    "assessmentSessions",
  );
  return {
    id,
    organizationId: doc.organizationId,
    respondentId: doc.respondentId,
    status: doc.status,
    sessionTokenHash: doc.sessionTokenHash,
    tokenExpiresAt: toDate(doc.tokenExpiresAt, "tokenExpiresAt"),
    answers: { ...doc.answers },
    lastSavedPageNo: doc.lastSavedPageNo,
    lastAnsweredAt: toNullableDate(doc.lastAnsweredAt, "lastAnsweredAt"),
    startedAt: toNullableDate(doc.startedAt, "startedAt"),
    submittedAt: toNullableDate(doc.submittedAt, "submittedAt"),
    resultId: doc.resultId,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}

export function toAiAnalysis(id: string, doc: AiAnalysisDoc): AiAnalysis {
  requireFields(
    doc,
    [
      "organizationId",
      "resultId",
      "respondentId",
      "analysisKind",
      "provider",
      "model",
      "promptVersion",
      "output",
      "rawText",
      "status",
      "reliability",
      "generatedBy",
    ],
    "aiAnalyses",
  );
  return {
    id,
    organizationId: doc.organizationId,
    resultId: doc.resultId,
    respondentId: doc.respondentId,
    analysisKind: doc.analysisKind,
    provider: doc.provider,
    model: doc.model,
    promptVersion: doc.promptVersion,
    output: doc.output,
    rawText: doc.rawText,
    usage: doc.usage ?? null,
    stopReason: doc.stopReason ?? null,
    requestId: doc.requestId ?? null,
    status: doc.status,
    reliability: doc.reliability,
    generatedBy: doc.generatedBy,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
  };
}

export function toUsageLog(id: string, doc: UsageLogDoc): UsageLog {
  requireFields(
    doc,
    [
      "organizationId",
      "respondentId",
      "resultId",
      "respondentKind",
      "name",
      "phoneNumber",
      "diagnosisExperience",
    ],
    "usageLogs",
  );
  return {
    id,
    organizationId: doc.organizationId,
    respondentId: doc.respondentId,
    resultId: doc.resultId,
    respondentKind: doc.respondentKind,
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    diagnosisExperience: doc.diagnosisExperience,
    registeredAt: toDate(doc.registeredAt, "registeredAt"),
    submittedAt: toNullableDate(doc.submittedAt, "submittedAt"),
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
  };
}

export function toAuditLog(id: string, doc: AuditLogDoc): AuditLog {
  requireFields(doc, ["organizationId", "actorKind", "action", "details"], "auditLogs");
  return {
    id,
    organizationId: doc.organizationId,
    actorKind: doc.actorKind,
    actorUid: doc.actorUid,
    actorRole: doc.actorRole,
    action: doc.action,
    targetCollection: doc.targetCollection,
    targetId: doc.targetId,
    details: doc.details,
    ipAddress: doc.ipAddress,
    userAgent: doc.userAgent,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
  };
}

/** DocumentSnapshot から変換する。存在しなければ null（02 §5.5） */
export function fromSnapshot<D, T>(
  snapshot: DocumentSnapshot<D>,
  map: (id: string, doc: D) => T,
): T | null {
  const data = snapshot.data();
  return snapshot.exists && data !== undefined ? map(snapshot.id, data) : null;
}
