// Doc → ドメイン型（02 §5.5）。Timestamp を Date に変換し、必須フィールドの欠落は例外にする。
// M7 で足した項目は、項目の無い文書（M7 より前）を既定値で補う（02 §5.5 の補いの表）
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { MappingError, toDate, toNullableDate } from "./timestamp";
import { isInviteTokenFormat } from "@/lib/auth/invite-token";
import type {
  AdminUser,
  AiAnalysis,
  AssessmentSession,
  AuditLog,
  Organization,
  Respondent,
  UsageLog,
} from "@/lib/db/domain";
import {
  ANNOUNCEMENT_KEYS,
  type AdminUserDoc,
  type AiAnalysisDoc,
  type AnnouncementKey,
  type AssessmentSessionDoc,
  type AuditLogDoc,
  type OrganizationDoc,
  type RespondentDoc,
  type UsageLogDoc,
} from "@/lib/db/types";

function requireFields(doc: object, fields: readonly string[], where: string): void {
  for (const f of fields) {
    if (!(f in doc) || (doc as Record<string, unknown>)[f] === undefined) {
      throw new MappingError(`${where}.${f} がありません`);
    }
  }
}

/** 招待トークンの平文（11-8 §3.2）。無い・文字でない・形が違う（M7 より前の文書など）は null */
function storedInviteToken(value: unknown): string | null {
  return typeof value === "string" && isInviteTokenFormat(value) ? value : null;
}

export function toOrganization(id: string, doc: OrganizationDoc): Organization {
  requireFields(doc, ["name", "code", "customerNumber", "inviteTokenHash"], "organizations");
  return {
    id,
    name: doc.name,
    code: doc.code,
    customerNumber: doc.customerNumber,
    inviteToken: storedInviteToken((doc as Partial<OrganizationDoc>).inviteToken),
    inviteTokenHash: doc.inviteTokenHash,
    inviteTokenIssuedAt: toDate(doc.inviteTokenIssuedAt, "inviteTokenIssuedAt"),
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}

/**
 * お知らせの既読（11-8 §3.3）。項目が無い（M7 より前の文書）・map でないときは空。
 * キーが ANNOUNCEMENT_KEYS に無いもの、値が Timestamp でないものは無視する
 */
function dismissedAnnouncementsOf(value: unknown): ReadonlyMap<AnnouncementKey, Date> {
  const out = new Map<AnnouncementKey, Date>();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const key of ANNOUNCEMENT_KEYS) {
    const at = (value as Record<string, unknown>)[key];
    if (at instanceof Timestamp) out.set(key, at.toDate());
  }
  return out;
}

export function toAdminUser(id: string, doc: AdminUserDoc): AdminUser {
  requireFields(doc, ["organizationId", "role", "displayName", "isSuspended"], "adminUsers");
  return {
    id,
    organizationId: doc.organizationId,
    role: doc.role,
    displayName: doc.displayName,
    isSuspended: doc.isSuspended,
    dismissedAnnouncements: dismissedAnnouncementsOf(
      (doc as Partial<AdminUserDoc>).dismissedAnnouncements,
    ),
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
    previousResultId: (doc as Partial<RespondentDoc>).previousResultId ?? null,
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
    lastSavedStepNo: (doc as Partial<AssessmentSessionDoc>).lastSavedStepNo ?? null,
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
  const legacyAi: Partial<AiAnalysisDoc> = doc; // M7 の 3 項目は M7 より前の文書には無い（11-6 §3.2）
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
    trainingContext: legacyAi.trainingContext ?? null,
    previousResultId: legacyAi.previousResultId ?? null,
    usedTrainingAction: legacyAi.usedTrainingAction ?? null,
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
