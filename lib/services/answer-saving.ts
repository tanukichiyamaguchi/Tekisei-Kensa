// ページ単位の回答保存（04 §4.4）。他のページの回答は触らない（フィールドパス指定の部分更新。リポジトリが行う）
import { TOTAL_QUESTION_COUNT, type AnswersSavedDto } from "./dto/respondent";
import { ApiError } from "./errors";
import type { SaveAnswersInput } from "./schemas/respondent";
import { assertDraft, translateSessionGone } from "./session-progress";
import type { RespondentSessionContext } from "@/lib/auth/respondent-session";
import { extendRespondentToken } from "@/lib/auth/respondent-token";
import { saveAnswers as saveAnswersDocs } from "@/lib/db/repositories/assessment-sessions-repository";
import { questionNosOfPage } from "@/lib/masters/exam-pages";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

/** 設問が pageNo のページに属することを確認する（05 §7.1 の前提。isActive の確認も兼ねる） */
function assertQuestionsOnPage(input: SaveAnswersInput): void {
  const onPage = questionNosOfPage(input.pageNo);
  const issues = input.answers.flatMap((a, i) =>
    onPage.has(a.questionNo)
      ? []
      : [{ path: `answers[${i}].questionNo`, message: "このページの設問ではありません" }],
  );
  if (issues.length > 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "入力内容に誤りがあります", { issues });
  }
}

export async function saveAnswers(
  ctx: RespondentSessionContext,
  input: SaveAnswersInput,
  now: Date = new Date(),
): Promise<{ readonly dto: AnswersSavedDto; readonly tokenExpiresAt: Date }> {
  assertDraft(ctx);
  assertQuestionsOnPage(input);
  const answers: Partial<Record<QuestionNo, ChoiceCode>> = {};
  for (const a of input.answers) answers[a.questionNo] = a.choiceCode;
  const tokenExpiresAt = extendRespondentToken(now);
  let answeredCount: number;
  try {
    ({ answeredCount } = await saveAnswersDocs({
      sessionId: ctx.sessionId,
      answers,
      lastSavedPageNo: input.pageNo,
      tokenExpiresAt,
    }));
  } catch (error) {
    throw translateSessionGone(error);
  }
  return {
    dto: {
      sessionId: ctx.sessionId,
      pageNo: input.pageNo,
      savedCount: input.answers.length,
      answeredCount,
      totalCount: TOTAL_QUESTION_COUNT,
      lastSavedPageNo: input.pageNo,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    },
    tokenExpiresAt,
  };
}
