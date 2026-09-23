// 受検セッション（02 §3.4、§8.4）。status を検査する書き込みはトランザクションで行う（I-2、I-4）
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import type { RequestMeta } from "@/lib/auth/claims";
import {
  assessmentSessionsRef,
  COLLECTIONS,
  db,
  rawCollection,
  respondentsRef,
  usageLogsRef,
} from "@/lib/db/collections";
import type { AssessmentSession } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { toAnswerMap } from "@/lib/db/mappers/answers";
import {
  fromSnapshot,
  toAssessmentSession,
  toRespondent,
  toUsageLog,
} from "@/lib/db/mappers/documents";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { toTimestamp } from "@/lib/db/mappers/timestamp";
import { answersPatchSchema, saveAnswersInputSchema } from "@/lib/db/schemas/assessment-session";
import { resultCreateSchema } from "@/lib/db/schemas/result";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { AssessmentSessionDoc } from "@/lib/db/types";
import { InvalidAnswerMapError } from "@/lib/scoring/errors";
import { scoreAnswers as defaultScoreAnswers } from "@/lib/scoring/score";
import type { AnswerMap, ChoiceCode, QuestionNo, ScoreResult } from "@/lib/scoring/types";
import { assertAnswerMap as defaultAssertAnswerMap } from "@/lib/scoring/validate-answers";

function sessionRef(sessionId: string): DocumentReference<AssessmentSessionDoc> {
  return assessmentSessionsRef().doc(sessionId);
}

/** deletedAt == null のセッション。無ければ null。トークン照合は呼び出し元（lib/auth）が行う */
export async function getSession(sessionId: string): Promise<AssessmentSession | null> {
  if (!docIdSchema.safeParse(sessionId).success) return null;
  const s = fromSnapshot(await sessionRef(sessionId).get(), toAssessmentSession);
  return s && s.deletedAt === null ? s : null;
}

/** Cookie のトークンのハッシュで検索（Q10、limit 1）。削除済み・期限切れ・組織不一致は null */
export async function getSessionByTokenHash(input: {
  readonly organizationId: string;
  readonly sessionTokenHash: string;
  readonly now: Date;
}): Promise<AssessmentSession | null> {
  const snapshot = await assessmentSessionsRef()
    .where("sessionTokenHash", "==", input.sessionTokenHash)
    .limit(1)
    .get();
  const doc = snapshot.docs[0];
  if (!doc) return null;
  const s = toAssessmentSession(doc.id, doc.data());
  if (s.deletedAt !== null || s.organizationId !== input.organizationId) return null;
  if (s.tokenExpiresAt.getTime() <= input.now.getTime()) return null;
  return s;
}

/**
 * 「開始する」の記録。status == draft を検査し、startedAt が null のときだけ設定する（冪等）。
 * tokenExpiresAt を延長し、初回のみ auditLogs（session.start）を追記する
 */
export async function markSessionStarted(input: {
  readonly sessionId: string;
  readonly tokenExpiresAt: Date;
  readonly meta: RequestMeta;
}): Promise<{ readonly startedAt: Date; readonly isFirstStart: boolean }> {
  return db().runTransaction(async (tx) => {
    const snapshot = await tx.get(sessionRef(input.sessionId));
    const s = fromSnapshot(snapshot, toAssessmentSession);
    if (!s || s.deletedAt !== null)
      throw new RepositoryError("SESSION_NOT_FOUND", "セッションが見つかりません");
    if (s.status !== "draft") {
      throw new RepositoryError("SESSION_ALREADY_SUBMITTED", "この受検はすでに送信済みです");
    }
    const ref = rawCollection(COLLECTIONS.assessmentSessions).doc(s.id);
    const expires = toTimestamp(input.tokenExpiresAt);
    if (s.startedAt !== null) {
      tx.update(ref, { tokenExpiresAt: expires, updatedAt: FieldValue.serverTimestamp() });
      return { startedAt: s.startedAt, isFirstStart: false };
    }
    const startedAt = Timestamp.now();
    tx.update(ref, { startedAt, tokenExpiresAt: expires, updatedAt: FieldValue.serverTimestamp() });
    addAuditLogToBatch(tx, {
      organizationId: s.organizationId,
      actorKind: "respondent",
      actorUid: s.respondentId,
      actorRole: null,
      action: "session.start",
      targetCollection: COLLECTIONS.assessmentSessions,
      targetId: s.id,
      details: {},
      ipAddress: input.meta.ipAddress,
      userAgent: input.meta.userAgent,
    });
    return { startedAt: startedAt.toDate(), isFirstStart: true };
  });
}

export interface SaveAnswersInput {
  readonly sessionId: string;
  readonly answers: Readonly<Partial<Record<QuestionNo, ChoiceCode>>>; // 1 ページ分（7〜8 問）
  readonly lastSavedPageNo: number; // 1〜20
  readonly tokenExpiresAt: Date;
}

/**
 * ページ単位の回答保存。status == draft を検査し、answers.{questionNo} をフィールドパス指定で部分更新する
 * （他のページの回答は触らない。書き込みは 1 文書 1 回）。戻り値は保存後の回答済み数
 */
export async function saveAnswers(
  input: SaveAnswersInput,
): Promise<{ readonly answeredCount: number }> {
  const patch = validateForWrite(
    answersPatchSchema,
    Object.fromEntries(Object.entries(input.answers).map(([k, v]) => [String(Number(k)), v])),
    "assessmentSessions.answers",
  );
  validateForWrite(
    saveAnswersInputSchema,
    { lastSavedPageNo: input.lastSavedPageNo },
    "assessmentSessions",
  );

  return db().runTransaction(async (tx) => {
    const s = fromSnapshot(await tx.get(sessionRef(input.sessionId)), toAssessmentSession);
    if (!s || s.deletedAt !== null)
      throw new RepositoryError("SESSION_NOT_FOUND", "セッションが見つかりません");
    if (s.status !== "draft") {
      throw new RepositoryError("SESSION_ALREADY_SUBMITTED", "この受検はすでに送信済みです");
    }
    const ref = rawCollection(COLLECTIONS.assessmentSessions).doc(s.id);
    const now = Timestamp.now();
    const fieldPathArgs: unknown[] = [];
    for (const [key, value] of Object.entries(patch))
      fieldPathArgs.push(new FieldPath("answers", key), value);
    fieldPathArgs.push(
      "lastSavedPageNo",
      input.lastSavedPageNo,
      "lastAnsweredAt",
      now,
      "tokenExpiresAt",
      toTimestamp(input.tokenExpiresAt),
      "updatedAt",
      FieldValue.serverTimestamp(),
    );
    const [first, firstValue, ...rest] = fieldPathArgs;
    tx.update(ref, first as FieldPath, firstValue, ...rest);
    const answeredCount = new Set([...Object.keys(s.answers), ...Object.keys(patch)]).size;
    return { answeredCount };
  });
}

export interface SubmitSessionInput {
  readonly sessionId: string;
  readonly meta: RequestMeta;
}
export interface SubmitSessionDeps {
  /** 03 の scoreAnswers。テストで差し替えられるよう注入する */
  readonly scoreAnswers: (answers: AnswerMap) => ScoreResult;
  /** 03 の assertAnswerMap（Q1〜Q144 が揃っていることの検証。欠落は例外） */
  readonly assertAnswerMap: (answers: Readonly<Record<number, number>>) => AnswerMap;
}
export interface SubmittedSession {
  readonly resultId: string;
  readonly submittedAt: Date;
  readonly scoringVersion: string;
}

const DEFAULT_DEPS: SubmitSessionDeps = {
  scoreAnswers: defaultScoreAnswers,
  assertAnswerMap: defaultAssertAnswerMap,
};

/**
 * 送信の確定（1 トランザクション。02 §8.4）。読み取り 3（session・respondent・usageLog）→ 検査 → 採点（永続化済みの回答）→
 * results 作成 + session・respondent・usageLog 更新 + auditLogs（session.submit）。
 * 同時に 2 回呼ばれても、再実行された側が status == "submitted" を読み SESSION_ALREADY_SUBMITTED になる
 */
export async function submitSession(
  input: SubmitSessionInput,
  deps: SubmitSessionDeps = DEFAULT_DEPS,
): Promise<SubmittedSession> {
  const resultRef = rawCollection(COLLECTIONS.results).doc();
  return db().runTransaction(async (tx) => {
    // 読み取りはすべて書き込みより先に行う（Admin SDK の制約。02 §8.1）
    const s = fromSnapshot(await tx.get(sessionRef(input.sessionId)), toAssessmentSession);
    if (!s || s.deletedAt !== null)
      throw new RepositoryError("SESSION_NOT_FOUND", "セッションが見つかりません");
    if (s.status !== "draft") {
      throw new RepositoryError("SESSION_ALREADY_SUBMITTED", "この受検はすでに送信済みです");
    }
    const respondent = fromSnapshot(
      await tx.get(respondentsRef().doc(s.respondentId)),
      toRespondent,
    );
    if (
      !respondent ||
      respondent.deletedAt !== null ||
      respondent.organizationId !== s.organizationId
    ) {
      throw new RepositoryError("SESSION_NOT_FOUND", "セッションが見つかりません");
    }
    const usageLog = fromSnapshot(
      await tx.get(usageLogsRef().doc(respondent.usageLogId)),
      toUsageLog,
    );
    if (!usageLog) throw new RepositoryError("SESSION_NOT_FOUND", "利用履歴が見つかりません");

    let answers: AnswerMap;
    try {
      answers = deps.assertAnswerMap(toAnswerMap(s.answers));
    } catch (error) {
      if (error instanceof InvalidAnswerMapError) {
        // 値は入れず設問番号だけを渡す（04 §4.5 手順 3）
        throw new RepositoryError("ANSWERS_INCOMPLETE", "未回答の設問があります", {
          missing: [...error.missing],
          invalid: error.invalid.map((i) => i.questionNo),
        });
      }
      throw error;
    }
    const score = deps.scoreAnswers(answers);
    const submittedAt = Timestamp.now(); // 3 文書で同じ値にする（02 §8.1）

    const result = validateForWrite(
      resultCreateSchema,
      {
        ...toResultDocFields(score),
        organizationId: s.organizationId,
        respondentId: respondent.id,
        sessionId: s.id,
        respondentKind: respondent.kind,
        teamCode: respondent.teamCode,
        isExcluded: respondent.isExcluded,
        submittedAt,
        aiGenerationStatus: "not_generated",
        aiGenerationStartedAt: null,
        aiGenerationError: null,
        latestAiAnalysisId: null,
        deletedAt: null,
      },
      "results",
    );
    const updatedAt = FieldValue.serverTimestamp();
    tx.create(resultRef, { ...result, createdAt: updatedAt, updatedAt });
    tx.update(rawCollection(COLLECTIONS.assessmentSessions).doc(s.id), {
      status: "submitted",
      submittedAt,
      resultId: resultRef.id,
      updatedAt,
    });
    tx.update(rawCollection(COLLECTIONS.respondents).doc(respondent.id), {
      resultId: resultRef.id,
      updatedAt,
    });
    tx.update(rawCollection(COLLECTIONS.usageLogs).doc(usageLog.id), {
      resultId: resultRef.id,
      submittedAt,
      updatedAt,
    });
    addAuditLogToBatch(tx, {
      organizationId: s.organizationId,
      actorKind: "respondent",
      actorUid: respondent.id,
      actorRole: null,
      action: "session.submit",
      targetCollection: COLLECTIONS.results,
      targetId: resultRef.id,
      details: { scoringVersion: score.scoringVersion },
      ipAddress: input.meta.ipAddress,
      userAgent: input.meta.userAgent,
    });
    return {
      resultId: resultRef.id,
      submittedAt: submittedAt.toDate(),
      scoringVersion: score.scoringVersion,
    };
  });
}
