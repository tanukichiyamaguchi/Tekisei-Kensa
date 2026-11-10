// 受検者（02 §3.3、§8.4）。複製フィールド（results / usageLogs）は同一バッチで更新する（I-3）
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, DocumentSnapshot, WriteBatch } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import { canViewExecutives } from "@/lib/auth/claims";
import type { RequestMeta, Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, db, rawCollection, respondentsRef } from "@/lib/db/collections";
import type { Respondent, Result } from "@/lib/db/domain";
import { initialEmploymentStatus, respondentKindForStaffRole } from "@/lib/db/employment-status";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toRespondent } from "@/lib/db/mappers/documents";
import { toResult } from "@/lib/db/mappers/result";
import { toTimestamp } from "@/lib/db/mappers/timestamp";
import { assessmentSessionCreateSchema } from "@/lib/db/schemas/assessment-session";
import { respondentCreateSchema } from "@/lib/db/schemas/respondent";
import { employmentFieldsSchema, staffRoleSchema } from "@/lib/db/schemas/result";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { docIdSchema, teamCodeSchema } from "@/lib/db/schemas/values";
import type {
  AuditDetails,
  DiagnosisExperience,
  EmploymentStatus,
  RespondentKind,
  ResultDoc,
  StaffRole,
  TeamCode,
} from "@/lib/db/types";
import { logger } from "@/lib/utils/logger";
import { getOrganization } from "./organizations-repository";

export interface RegisterRespondentInput {
  readonly organizationId: string;
  readonly kind: RespondentKind;
  readonly name: string; // 前後空白除去済み
  readonly phoneNumber: string; // 前後の空白を除いた入力のまま（正規化しない。11-1 §2.2.5）
  readonly occupationCode: number;
  readonly diagnosisExperience: DiagnosisExperience;
  readonly previousResultId: string | null; // 前回の候補（service が判定済み。11-1 §2.2.8）
  readonly sessionTokenHash: string;
  readonly tokenExpiresAt: Date;
  readonly meta: RequestMeta;
}
export interface RegisteredRespondent {
  readonly respondentId: string;
  readonly sessionId: string;
  readonly registeredAt: Date;
}

/**
 * 受検者登録。respondents / assessmentSessions / auditLogs（respondent.register）を 1 バッチで作成する（11-1 §3.4.1）。
 * 利用履歴（usageLogs）は作らず、送信のときに作る（respondents.usageLogId は null。11-1 §2.7.4）。
 * kind と前回の候補 previousResultId は service が判定した値をそのまま書く（候補を受け付けたら kind は executive。11-1 §2.2.8）。
 * チーム未設定・集計に含むで登録し、前回の値は引き継がない（K-39 Q-34）。2 文書の ID は事前に採番し相互参照フィールドに入れる（I-1）
 */
export async function registerRespondent(
  input: RegisterRespondentInput,
): Promise<RegisteredRespondent> {
  const org = await getOrganization(input.organizationId);
  if (!org) throw new RepositoryError("ORGANIZATION_NOT_FOUND", "組織が見つかりません");

  const respondentRef = rawCollection(COLLECTIONS.respondents).doc();
  const sessionRef = rawCollection(COLLECTIONS.assessmentSessions).doc();
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
      usageLogId: null, // 利用履歴は送信のときに作る（11-1 §2.7.4）
      resultId: null,
      previousResultId: input.previousResultId, // 前回の候補（11-1 §3.2.1）。送信のあとも変えない（I-M7-3）
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
      lastSavedStepNo: null, // lastSavedPageNo は書かない（11-1 §3.2.2）
      lastAnsweredAt: null,
      startedAt: null,
      submittedAt: null,
      resultId: null,
      deletedAt: null,
    },
    "assessmentSessions",
  );

  const batch = db().batch();
  batch.create(respondentRef, { ...respondent, ...stamps });
  batch.create(sessionRef, { ...session, ...stamps });
  addAuditLogToBatch(batch, {
    organizationId: org.id,
    actorKind: "respondent",
    actorUid: respondentRef.id,
    actorRole: null,
    action: "respondent.register",
    targetCollection: COLLECTIONS.respondents,
    targetId: respondentRef.id,
    // kind は保存した受検者区分。previousCandidate は前回の候補を受け付けたら true（11-1 §2.7.5）。前回の結果の ID は書かない
    details: { kind: input.kind, previousCandidate: input.previousResultId !== null },
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
  return {
    respondentId: respondentRef.id,
    sessionId: sessionRef.id,
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

/** 受検者の更新で書く範囲の 1 件（つながりの受験と、その受検者。11-2 §3.11）。送信前の受検者は resultId が null */
export interface PersonMember {
  readonly respondentId: string;
  readonly resultId: string | null;
}

/** 変える項目（11-2 §3.6 の本文。送られた項目だけを持つ） */
export interface PersonAttributesPatch {
  readonly teamCode?: TeamCode | null;
  readonly isExcluded?: boolean;
  readonly employment?: {
    readonly status: EmploymentStatus;
    readonly hiredOn: string | null;
    readonly leftOn: string | null;
  };
  readonly staffRole?: StaffRole;
}

export interface UpdatePersonAttributesInput {
  readonly members: readonly PersonMember[];
  readonly viewer: Viewer;
  readonly patch: PersonAttributesPatch;
  readonly meta: RequestMeta;
}
export interface UpdatedPersonAttributes {
  /** 書く範囲の受験（読み取りで除かれなかったもの。値が同じで書かなかった受験も含む）。members の順（つながりの順） */
  readonly writtenResultIds: readonly string[];
  /** staffRole を送ったときの受検者区分（責任者・幹部 → executive、スタッフ → applicant）。送らなければ null */
  readonly kindAfter: RespondentKind | null;
}

/** 1 回のバッチに積む文書の上限（Firestore の 1 回の上限 500 件より小さく抑える。11-2 §3.6） */
const PERSON_BATCH_LIMIT = 450;

type BatchOp = (batch: WriteBatch) => void;

interface LoadedMember {
  readonly respondent: Respondent;
  readonly result: Result | null; // 読み取りの補いを含む（toResult）
  readonly hasEmploymentStatus: boolean; // 生の results 文書に employmentStatus があるか（M7 より前の文書には無い）
}

/** getAll() を 100 件ずつ */
async function getAllInChunks(refs: readonly DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const chunk = refs.slice(i, i + GET_ALL_CHUNK);
    if (chunk.length > 0) out.push(...(await db().getAll(...chunk)));
  }
  return out;
}

/**
 * 受検者の更新（11-2 §3.11。updateRespondentFlags を置き換えた）。members（同じ人のつながりの受験と受検者。閲覧範囲の中）に、
 * チーム・除外・区分と日付・役職のうち変わる項目だけを書く。読み取りで除いた受検者・受験は書かず（warn に resultId だけを出す）、
 * 書く範囲が残らなければ RESPONDENT_NOT_FOUND。役職で受検者区分が変われば、正の respondents.kind と複製の
 * results.respondentKind・usageLogs.respondentKind を同じバッチで書く（I-3、K-39 Q-02）。書く文書の updatedAt はすべて同じ
 * Timestamp（I-36）で、監査ログは変わった項目ごとに同じバッチに積む。書く文書が 450 件を超えるときは、受験ごとの書き込みを
 * 分けずに 450 件までのバッチに分けて順に書く。読み取りとバッチの間にトランザクションは使わない（同時の更新は後勝ち）
 */
export async function updatePersonAttributes(
  input: UpdatePersonAttributesInput,
): Promise<UpdatedPersonAttributes> {
  const { patch, viewer } = input;
  // 書き込み前の検証（02 §2。違反は VALIDATION_ERROR）
  if (patch.teamCode !== undefined && patch.teamCode !== null) {
    validateForWrite(teamCodeSchema, patch.teamCode, "respondents.teamCode");
  }
  if (patch.employment !== undefined) {
    validateForWrite(
      employmentFieldsSchema,
      {
        employmentStatus: patch.employment.status,
        hiredOn: patch.employment.hiredOn,
        leftOn: patch.employment.leftOn,
      },
      "results.employmentStatus",
    );
  }
  if (patch.staffRole !== undefined) {
    validateForWrite(staffRoleSchema, patch.staffRole, "results.staffRole");
  }
  const kindAfter =
    patch.staffRole === undefined ? null : respondentKindForStaffRole(patch.staffRole);
  const skip = (member: PersonMember) =>
    logger.warn("person_attributes.member_skipped", { resultId: member.resultId });

  // 1. 受検者
  const respondents = await getRespondentsByIds({
    organizationId: viewer.organizationId,
    respondentIds: input.members.map((m) => m.respondentId),
  });
  const visible: Array<{ readonly member: PersonMember; readonly respondent: Respondent }> = [];
  for (const member of input.members) {
    const respondent = respondents.get(member.respondentId);
    if (respondent && isVisibleTo(respondent, viewer)) visible.push({ member, respondent });
    else skip(member);
  }

  // 2. 受験（と、役職で受検者区分が変わるときの利用履歴）
  const resultIds = visible
    .map((v) => v.member.resultId)
    .filter((id): id is string => id !== null && docIdSchema.safeParse(id).success);
  const results = new Map<string, { readonly result: Result; readonly hasStatus: boolean }>();
  const resultSnapshots = await getAllInChunks(
    resultIds.map((id) => rawCollection(COLLECTIONS.results).doc(id)),
  );
  for (const snapshot of resultSnapshots) {
    const data = snapshot.data();
    if (!snapshot.exists || data === undefined) continue;
    const result = toResult(snapshot.id, data as ResultDoc);
    if (result.organizationId !== viewer.organizationId || result.deletedAt !== null) continue;
    results.set(result.id, { result, hasStatus: data.employmentStatus !== undefined });
  }
  const loaded: LoadedMember[] = [];
  for (const { member, respondent } of visible) {
    if (member.resultId === null) {
      loaded.push({ respondent, result: null, hasEmploymentStatus: false });
      continue;
    }
    const found = results.get(member.resultId);
    if (!found) {
      skip(member);
      continue;
    }
    loaded.push({ respondent, result: found.result, hasEmploymentStatus: found.hasStatus });
  }
  if (loaded.length === 0) {
    throw new RepositoryError("RESPONDENT_NOT_FOUND", "受検者が見つかりません");
  }
  const usageLogIds = new Set<string>();
  if (kindAfter !== null) {
    const ids = loaded
      .filter((m) => m.result !== null && m.respondent.kind !== kindAfter)
      .map((m) => m.respondent.usageLogId)
      .filter((id): id is string => id !== null && docIdSchema.safeParse(id).success);
    const usageSnapshots = await getAllInChunks(
      ids.map((id) => rawCollection(COLLECTIONS.usageLogs).doc(id)),
    );
    for (const snapshot of usageSnapshots) {
      if (snapshot.exists && snapshot.get("organizationId") === viewer.organizationId) {
        usageLogIds.add(snapshot.id);
      }
    }
  }

  // 3. 受験ごとに、変わる項目だけを書く
  const updatedAt = Timestamp.now(); // 書く文書の updatedAt をすべて同じ時刻にする（I-36）
  const audit =
    (action: string, targetCollection: string, targetId: string, details: AuditDetails): BatchOp =>
    (batch) =>
      addAuditLogToBatch(batch, {
        organizationId: viewer.organizationId,
        actorKind: "admin",
        actorUid: viewer.uid,
        actorRole: viewer.role,
        action,
        targetCollection,
        targetId,
        details,
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });
  const groups: BatchOp[][] = [];
  for (const { respondent: r, result, hasEmploymentStatus } of loaded) {
    const respondentFields: Record<string, unknown> = {};
    const resultFields: Record<string, unknown> = {};
    let usageLogKind: RespondentKind | null = null;
    const audits: BatchOp[] = [];
    if (patch.teamCode !== undefined && patch.teamCode !== r.teamCode) {
      respondentFields.teamCode = patch.teamCode;
      resultFields.teamCode = patch.teamCode;
      audits.push(
        audit("respondent.update_team", COLLECTIONS.respondents, r.id, {
          before: r.teamCode,
          after: patch.teamCode,
        }),
      );
    }
    if (patch.isExcluded !== undefined && patch.isExcluded !== r.isExcluded) {
      respondentFields.isExcluded = patch.isExcluded;
      resultFields.isExcluded = patch.isExcluded;
      audits.push(
        audit("respondent.update_exclusion", COLLECTIONS.respondents, r.id, {
          before: r.isExcluded,
          after: patch.isExcluded,
        }),
      );
    }
    if (result !== null && patch.staffRole !== undefined && kindAfter !== null) {
      const roleChanged = result.staffRole !== patch.staffRole;
      const kindChanged = r.kind !== kindAfter;
      if (roleChanged || kindChanged) {
        // M7 より前の受験（employmentStatus が無い）は、変える前の受検者区分から求めた区分を書く（11-2 §3.1）
        if (!hasEmploymentStatus) resultFields.employmentStatus = initialEmploymentStatus(r.kind);
        if (roleChanged) resultFields.staffRole = patch.staffRole;
        if (kindChanged) {
          respondentFields.kind = kindAfter;
          resultFields.respondentKind = kindAfter;
          if (r.usageLogId !== null && usageLogIds.has(r.usageLogId)) usageLogKind = kindAfter;
        }
        audits.push(
          audit("result.update_staff_role", COLLECTIONS.results, result.id, {
            before: result.staffRole,
            after: patch.staffRole,
            kindBefore: r.kind,
            kindAfter,
          }),
        );
      }
    }
    if (result !== null && patch.employment !== undefined) {
      const next = patch.employment;
      if (
        next.status !== result.employmentStatus ||
        next.hiredOn !== result.hiredOn ||
        next.leftOn !== result.leftOn
      ) {
        resultFields.employmentStatus = next.status;
        resultFields.hiredOn = next.hiredOn;
        resultFields.leftOn = next.leftOn;
        audits.push(
          audit("result.update_employment", COLLECTIONS.results, result.id, {
            before: result.employmentStatus,
            after: next.status,
            hiredOnBefore: result.hiredOn,
            hiredOnAfter: next.hiredOn,
            leftOnBefore: result.leftOn,
            leftOnAfter: next.leftOn,
          }),
        );
      }
    }
    const ops: BatchOp[] = [];
    if (Object.keys(respondentFields).length > 0) {
      const ref = rawCollection(COLLECTIONS.respondents).doc(r.id);
      ops.push((batch) => batch.update(ref, { ...respondentFields, updatedAt }));
    }
    if (result !== null && Object.keys(resultFields).length > 0) {
      const ref = rawCollection(COLLECTIONS.results).doc(result.id);
      ops.push((batch) => batch.update(ref, { ...resultFields, updatedAt }));
    }
    if (usageLogKind !== null && r.usageLogId !== null) {
      const ref = rawCollection(COLLECTIONS.usageLogs).doc(r.usageLogId);
      const kind = usageLogKind;
      ops.push((batch) => batch.update(ref, { respondentKind: kind, updatedAt }));
    }
    if (ops.length > 0) groups.push([...ops, ...audits]);
  }

  // 4〜5. 変わる項目があれば、受験ごとの書き込みを分けずに 450 件までのバッチに積んで順にコミットする
  let batch = db().batch();
  let count = 0;
  for (const ops of groups) {
    if (count > 0 && count + ops.length > PERSON_BATCH_LIMIT) {
      await batch.commit();
      batch = db().batch();
      count = 0;
    }
    for (const op of ops) op(batch);
    count += ops.length;
  }
  if (count > 0) await batch.commit();

  return {
    writtenResultIds: loaded.flatMap((m) => (m.result === null ? [] : [m.result.id])),
    kindAfter,
  };
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
