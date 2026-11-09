// 受験者側の画面（Server Component）の判定ヘルパー（11-1 §2.1.2・§2.4.8・§3.5、05 D05-37）。
// Cookie を検証し、セッションの状態に応じて表示・リダイレクト・エラーを返す。components/ とブラウザ用の API 口には依存しない
import { cache } from "react";

import {
  requireRespondentSessionFromCookies,
  type RespondentSessionContext,
} from "@/lib/auth/respondent-session";
import { resolveCurrentStepNo, type ExamStepNo } from "@/lib/presentation/exam-steps";
import type { ExamErrorKind } from "@/lib/presentation/exam-types";
import type { SessionProgressDto } from "@/lib/services/dto/respondent";
import { ApiError } from "@/lib/services/errors";
import { getSessionProgress } from "@/lib/services/session-progress";
import type { QuestionNo } from "@/lib/scoring/types";

export type RespondentPageGuardResult =
  | {
      readonly kind: "ok";
      readonly session: SessionProgressDto;
      /** 受験画面で表示するステップ（未回答の設問がある最初のステップ。11-1 §2.4.8、K-41） */
      readonly currentStepNo: ExamStepNo;
    }
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "error"; readonly error: ExamErrorKind };

/** 開いた画面: start = 診断開始（R-02）、questions = 受験画面（R-03）、complete = 完了（R-05） */
export type RespondentPageExpectation = "start" | "questions" | "complete";

/** 受検セッションを確認できない（Cookie なし・不一致・期限切れ・削除済み・文書 ID の形式不正）ことを表すコード */
const UNAVAILABLE_CODES = new Set([
  "RESPONDENT_TOKEN_INVALID",
  "RESPONDENT_TOKEN_EXPIRED",
  "NOT_FOUND",
]);

function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && UNAVAILABLE_CODES.has(error.code);
}

/**
 * Cookie と {sessionId} の検証（04 §2.5.2）。確認できなければ null、それ以外の例外はそのまま投げる（error.tsx → unexpected）。
 * 同じリクエスト内の layout と page で結果を共有する（React の cache）
 */
export const loadRespondentSession = cache(
  async (sessionId: string): Promise<RespondentSessionContext | null> => {
    try {
      return await requireRespondentSessionFromCookies(sessionId);
    } catch (error) {
      if (isUnavailable(error)) return null;
      throw error;
    }
  },
);

/** 受験者側の画面の URL（11-1 §2.1.1。ステップ番号は URL に入れない） */
export const examPaths = {
  start: (sessionId: string) => `/exam/${sessionId}`,
  questions: (sessionId: string) => `/exam/${sessionId}/questions`,
  complete: (sessionId: string) => `/exam/${sessionId}/complete`,
} as const;

/** 11-1 §2.1.2 の表（サーバが返す画面） */
export async function guardRespondentPage(
  sessionId: string,
  expect: RespondentPageExpectation,
): Promise<RespondentPageGuardResult> {
  const ctx = await loadRespondentSession(sessionId);
  if (!ctx) return { kind: "error", error: "session_unavailable" };
  let session: SessionProgressDto;
  try {
    session = await getSessionProgress(ctx);
  } catch (error) {
    // 組織の論理削除（受付停止）も受検を続けられない状態として扱う
    if (isUnavailable(error)) return { kind: "error", error: "session_unavailable" };
    throw error;
  }
  const currentStepNo = resolveCurrentStepNo(
    new Set<QuestionNo>(session.answers.map((a) => a.questionNo)),
  );
  const ok = { kind: "ok", session, currentStepNo } as const;

  if (session.status === "submitted") {
    return expect === "complete" ? ok : { kind: "redirect", to: examPaths.complete(sessionId) };
  }
  if (expect === "complete") return { kind: "redirect", to: examPaths.start(sessionId) };
  if (session.startedAt === null) {
    return expect === "start" ? ok : { kind: "redirect", to: examPaths.start(sessionId) };
  }
  // 開始済み: 診断開始を開いたら受験画面へ（受験画面のステップは currentStepNo）
  return expect === "start" ? { kind: "redirect", to: examPaths.questions(sessionId) } : ok;
}
