// 受検者（02 §3.3、§8.4）。複製フィールド（results / usageLogs）は同一バッチで更新する（I-3）
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import { canViewExecutives } from "@/lib/auth/claims";
import type { RequestMeta, Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, db, rawCollection, respondentsRef } from "@/lib/db/collections";
import type { Respondent } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toRespondent } from "@/lib/db/mappers/documents";
import { toTimestamp } from "@/lib/db/mappers/timestamp";
import { assessmentSessionCreateSchema } from "@/lib/db/schemas/assessment-session";
import { respondentCreateSchema } from "@/lib/db/schemas/respondent";
import { usageLogCreateSchema } from "@/lib/db/schemas/usage-log";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { docIdSchema, teamCodeSchema } from "@/lib/db/schemas/values";
import type { DiagnosisExperience, RespondentKind, TeamCode } from "@/lib/db/types";
import { getOrganization } from "./organizations-repository";

export interface RegisterRespondentInput {
  readonly organizationId: string;
  readonly kind: RespondentKind;
  readonly name: string; // 前後空白除去済み
  readonly phoneNumber: string; // 正規化済み（lib/utils/phone-number.ts）
  readonly occupationCode: number;
  readonly diagnosisExperience: DiagnosisExperience;
  readonly sessionTokenHash: string;
  readonly tokenExpiresAt: Date;
  readonly meta: RequestMeta;
}
export interface RegisteredRespondent {
  readonly respondentId: string;
  readonly sessionId: string;
  readonly usageLogId: string;
  readonly registeredAt: Date;
}

/**
 * 受検者登録。respondents / assessmentSessions / usageLogs / auditLogs（respondent.register）を 1 バッチで作成する。
 * 3 文書の ID は事前に採番し相互参照フィールドに入れる（I-1）
 */
export async function registerRespondent(
  input: RegisterRespondentInput,
): Promise<RegisteredRespondent> {
  const org = await getOrganization(input.organizationId);
  if (!org) throw new RepositoryError("ORGANIZATION_NOT_FOUND", "組織が見つかりません");

  const respondentRef = rawCollection(COLLECTIONS.respondents).doc();
  const sessionRef = rawCollection(COLLECTIONS.assessmentSessions).doc();
  const usageLogRef = rawCollection(COLLECTIONS.usageLogs).doc();
  const registeredAt = Timestamp.now();
  const stamps = {
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const respondent = validateForWrite(
    respondentCreateSchema,
    {
      organizationId: org.id,
      kind: input.kind,
      name: input.name,
      phoneNumber: input.phoneNumber,
      occupationCode: input.occupationCode,
      diagnosisExperience: input.diagnosisExperience,
      teamCode: null,
      isExcluded: false,
      sessionId: sessionRef.id,
      usageLogId: usageLogRef.id,
      resultId: null,
      deletedAt: null,
    },
    "respondents",
  );
  const session = validateForWrite(
    assessmentSessionCreateSchema,
    {
      organizationId: org.id,
      respondentId: respondentRef.id,
      status: "draft",
      sessionTokenHash: input.sessionTokenHash,
      tokenExpiresAt: toTimestamp(input.tokenExpiresAt),
      answers: {},
      lastSavedPageNo: null,
      lastAnsweredAt: null,
      startedAt: null,
      submittedAt: null,
      resultId: null,
      deletedAt: null,
    },
    "assessmentSessions",
  );
  const usageLog = validateForWrite(
    usageLogCreateSchema,
    {
      organizationId: org.id,
      respondentId: respondentRef.id,
      resultId: null,
      respondentKind: input.kind,
      name: input.name,
      phoneNumber: input.phoneNumber,
      diagnosisExperience: input.diagnosisExperience,
      registeredAt,
      submittedAt: null,
    },
    "usageLogs",
  );

  const batch = db().batch();
  batch.create(respondentRef, { ...respondent, ...stamps });
  batch.create(sessionRef, { ...session, ...stamps });
  batch.create(usageLogRef, { ...usageLog, ...stamps });
  addAuditLogToBatch(batch, {
    organizationId: org.id,
    actorKind: "respondent",
    actorUid: respondentRef.id,
    actorRole: null,
    action: "respondent.register",
    targetCollection: COLLECTIONS.respondents,
    targetId: respondentRef.id,
    details: { kind: input.kind },
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
  return {
    respondentId: respondentRef.id,
    sessionId: sessionRef.id,
    usageLogId: usageLogRef.id,
    registeredAt: registeredAt.toDate(),
  };
}

async function loadRespondent(respondentId: string): Promise<Respondent | null> {
  if (!docIdSchema.safeParse(respondentId).success) return null;
  return fromSnapshot(await respondentsRef().doc(respondentId).get(), toRespondent);
}

function isVisibleTo(respondent: Respondent, viewer: Viewer): boolean {
  return (
    respondent.organizationId === viewer.organizationId &&
    respondent.deletedAt === null &&
    (respondent.kind === "applicant" || canViewExecutives(viewer.role))
  );
}

/** 組織一致・deletedAt == null・幹部の可視性（viewer.role）を満たす受検者。満たさなければ null */
export async function getRespondent(input: {
  readonly respondentId: string;
  readonly viewer: Viewer;
}): Promise<Respondent | null> {
  const r = await loadRespondent(input.respondentId);
  return r && isVisibleTo(r, input.viewer) ? r : null;
}

/** 受検者 API 用。組織一致・deletedAt == null のみ確認し、幹部の可視性は判定しない */
export async function getRespondentById(input: {
  readonly respondentId: string;
  readonly organizationId: string;
}): Promise<Respondent | null> {
  const r = await loadRespondent(input.respondentId);
  return r && r.organizationId === input.organizationId && r.deletedAt === null ? r : null;
}

const GET_ALL_CHUNK = 100;

/**
 * ID の集合で受検者をまとめて取得する（getAll() を 100 件ずつ）。
 * 存在しない・組織不一致の ID は含まれない。論理削除済みの文書も返す（呼び出し元は results 側で絞っている）
 */
export async function getRespondentsByIds(input: {
  readonly organizationId: string;
  readonly respondentIds: readonly string[];
}): Promise<ReadonlyMap<string, Respondent>> {
  const ids = [...new Set(input.respondentIds)].filter((id) => docIdSchema.safeParse(id).success);
  const out = new Map<string, Respondent>();
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((id) => respondentsRef().doc(id));
    if (refs.length === 0) continue;
    const snapshots = await db().getAll(...refs);
    for (const snapshot of snapshots) {
      const data = snapshot.data();
      if (!snapshot.exists || data === undefined) continue;
      const r = toRespondent(snapshot.id, data as never);
      if (r.organizationId === input.organizationId) out.set(r.id, r);
    }
  }
  return out;
}

export interface UpdateRespondentFlagsInput {
  readonly respondentId: string;
  readonly viewer: Viewer;
  readonly patch: { readonly teamCode?: TeamCode | null; readonly isExcluded?: boolean };
  readonly meta: RequestMeta;
}
export interface UpdatedRespondentFlags {
  readonly before: { readonly teamCode: TeamCode | null; readonly isExcluded: boolean };
  readonly after: { readonly teamCode: TeamCode | null; readonly isExcluded: boolean };
}

/**
 * チーム・除外フラグの更新。respondents（正）と results（複製）を同一バッチで更新し、変更があった項目ごとに
 * auditLogs（respondent.update_team / respondent.update_exclusion）を同じバッチに追加する。変更が無ければ何も書かない
 */
export async function updateRespondentFlags(
  input: UpdateRespondentFlagsInput,
): Promise<UpdatedRespondentFlags> {
  if (input.patch.teamCode !== undefined && input.patch.teamCode !== null) {
    validateForWrite(teamCodeSchema, input.patch.teamCode, "respondents.teamCode");
  }
  const r = await getRespondent({ respondentId: input.respondentId, viewer: input.viewer });
  if (!r) throw new RepositoryError("RESPONDENT_NOT_FOUND", "受検者が見つかりません");
  const before = { teamCode: r.teamCode, isExcluded: r.isExcluded };
  const after = {
    teamCode: input.patch.teamCode === undefined ? r.teamCode : input.patch.teamCode,
    isExcluded: input.patch.isExcluded === undefined ? r.isExcluded : input.patch.isExcluded,
  };
  const teamChanged = before.teamCode !== after.teamCode;
  const exclusionChanged = before.isExcluded !== after.isExcluded;
  if (!teamChanged && !exclusionChanged) return { before, after };

  const updatedAt = Timestamp.now(); // 両文書で同じ時刻にする（I-36）
  const fields = { teamCode: after.teamCode, isExcluded: after.isExcluded, updatedAt };
  const batch = db().batch();
  batch.update(rawCollection(COLLECTIONS.respondents).doc(r.id), fields);
  if (r.resultId !== null) batch.update(rawCollection(COLLECTIONS.results).doc(r.resultId), fields);
  const common = {
    organizationId: r.organizationId,
    actorKind: "admin" as const,
    actorUid: input.viewer.uid,
    actorRole: input.viewer.role,
    targetCollection: COLLECTIONS.respondents,
    targetId: r.id,
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  };
  if (teamChanged) {
    addAuditLogToBatch(batch, {
      ...common,
      action: "respondent.update_team",
      details: { before: before.teamCode, after: after.teamCode },
    });
  }
  if (exclusionChanged) {
    addAuditLogToBatch(batch, {
      ...common,
      action: "respondent.update_exclusion",
      details: { before: before.isExcluded, after: after.isExcluded },
    });
  }
  await batch.commit();
  return { before, after };
}

/**
 * 論理削除。respondents / assessmentSessions / results の deletedAt を同じ Timestamp で設定し、
 * auditLogs（respondent.delete）を同一バッチで追記する（I-11）。usageLogs / aiAnalyses は変更しない。物理削除は行わない
 */
export async function softDeleteRespondent(input: {
  readonly respondentId: string;
  readonly viewer: Viewer;
  readonly meta: RequestMeta;
}): Promise<{ readonly deletedAt: Date }> {
  const r = await getRespondent({ respondentId: input.respondentId, viewer: input.viewer });
  if (!r) throw new RepositoryError("RESPONDENT_NOT_FOUND", "受検者が見つかりません");
  const deletedAt = Timestamp.now();
  const fields = { deletedAt, updatedAt: FieldValue.serverTimestamp() };
  const batch = db().batch();
  batch.update(rawCollection(COLLECTIONS.respondents).doc(r.id), fields);
  batch.update(rawCollection(COLLECTIONS.assessmentSessions).doc(r.sessionId), fields);
  if (r.resultId !== null) batch.update(rawCollection(COLLECTIONS.results).doc(r.resultId), fields);
  addAuditLogToBatch(batch, {
    organizationId: r.organizationId,
    actorKind: "admin",
    actorUid: input.viewer.uid,
    actorRole: input.viewer.role,
    action: "respondent.delete",
    targetCollection: COLLECTIONS.respondents,
    targetId: r.id,
    details: {},
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
  return { deletedAt: deletedAt.toDate() };
}
