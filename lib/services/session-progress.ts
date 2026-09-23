// 進行状態の取得と「開始する」の記録（04 §4.3）
import {
  TOTAL_QUESTION_COUNT,
  type SessionProgressDto,
  type SessionStartedDto,
} from "./dto/respondent";
import { API_ERRORS, ApiError } from "./errors";
import type { RespondentSessionContext } from "@/lib/auth/respondent-session";
import { extendRespondentToken } from "@/lib/auth/respondent-token";
import { RepositoryError } from "@/lib/db/errors";
import { toAnswerMap } from "@/lib/db/mappers/answers";
import { markSessionStarted } from "@/lib/db/repositories/assessment-sessions-repository";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

export function sessionAlreadySubmitted(): ApiError {
  return new ApiError(409, "SESSION_ALREADY_SUBMITTED", "この受検はすでに送信済みです");
}

/** draft 以外は 409（トランザクション前の早期判定。最終判定はリポジトリのトランザクション内） */
export function assertDraft(ctx: RespondentSessionContext): void {
  if (ctx.status !== "draft") throw sessionAlreadySubmitted();
}

/**
 * 認可（04 §2.5.2）の直後に文書が削除された場合、開始・保存では 401 RESPONDENT_TOKEN_INVALID に揃える
 * （SESSION_NOT_FOUND を返すのは送信 API だけ。04 §2.4）
 */
export function translateSessionGone(error: unknown): unknown {
  if (error instanceof RepositoryError && error.code === "SESSION_NOT_FOUND") {
    return API_ERRORS.respondentTokenInvalid();
  }
  return error;
}

/** submitted でも返す（完了画面が状態を確認する）。回答は questionNo 昇順の配列 */
export async function getSessionProgress(
  ctx: RespondentSessionContext,
): Promise<SessionProgressDto> {
  const org = await getOrganization(ctx.organizationId);
  // 組織の論理削除は受付停止（04 D04-15）。受検リンクと同じく無効として扱う
  if (!org) throw API_ERRORS.respondentTokenInvalid();
  const session = ctx.session;
  const answers = Object.entries(toAnswerMap(session.answers))
    .map(([questionNo, choiceCode]) => ({
      questionNo: Number(questionNo) as QuestionNo,
      choiceCode: choiceCode as ChoiceCode,
    }))
    .sort((a, b) => a.questionNo - b.questionNo);
  return {
    sessionId: session.id,
    organizationName: org.name,
    kind: ctx.kind,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    lastSavedPageNo: session.lastSavedPageNo,
    answeredCount: answers.length,
    totalCount: TOTAL_QUESTION_COUNT,
    answers,
    tokenExpiresAt: session.tokenExpiresAt.toISOString(),
  };
}

/** startedAt は初回だけ設定（冪等）し、期限を now + 7 日に延長する。session.start の監査ログは初回のみ */
export async function startSession(
  ctx: RespondentSessionContext,
  now: Date = new Date(),
): Promise<{ readonly dto: SessionStartedDto; readonly tokenExpiresAt: Date }> {
  assertDraft(ctx);
  const tokenExpiresAt = extendRespondentToken(now);
  let startedAt: Date;
  try {
    ({ startedAt } = await markSessionStarted({
      sessionId: ctx.sessionId,
      tokenExpiresAt,
      meta: ctx.request,
    }));
  } catch (error) {
    throw translateSessionGone(error);
  }
  return {
    dto: {
      sessionId: ctx.sessionId,
      startedAt: startedAt.toISOString(),
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    },
    tokenExpiresAt,
  };
}
