// ステップ単位の回答保存（11-1 §3.4.2、04 §4.4）。ほかのステップの回答は触らない（フィールドパス指定の部分更新。リポジトリが行う）
import { TOTAL_QUESTION_COUNT, type AnswersSavedDto } from "./dto/respondent";
import { ApiError } from "./errors";
import type { SaveAnswersInput } from "./schemas/respondent";
import { assertDraft, translateSessionGone } from "./session-progress";
import type { RespondentSessionContext } from "@/lib/auth/respondent-session";
import { extendRespondentToken } from "@/lib/auth/respondent-token";
import { saveAnswers as saveAnswersDocs } from "@/lib/db/repositories/assessment-sessions-repository";
import { questionNosOfStep } from "@/lib/masters/exam-steps";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

/** 設問が stepNo のステップに属することを確認する（isActive の確認も兼ねる。11-1 §3.4.2） */
function assertQuestionsInStep(input: SaveAnswersInput): void {
  const inStep = questionNosOfStep(input.stepNo);
  const issues = input.answers.flatMap((a, i) =>
    inStep.has(a.questionNo)
      ? []
      : [{ path: `answers[${i}].questionNo`, message: "このステップの設問ではありません" }],
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
  assertQuestionsInStep(input);
  const answers: Partial<Record<QuestionNo, ChoiceCode>> = {};
  for (const a of input.answers) answers[a.questionNo] = a.choiceCode;
  const tokenExpiresAt = extendRespondentToken(now);
  let answeredCount: number;
  try {
    ({ answeredCount } = await saveAnswersDocs({
      sessionId: ctx.sessionId,
      answers,
      lastSavedStepNo: input.stepNo,
      tokenExpiresAt,
    }));
  } catch (error) {
    throw translateSessionGone(error);
  }
  return {
    dto: {
      sessionId: ctx.sessionId,
      stepNo: input.stepNo,
      savedCount: input.answers.length,
      answeredCount,
      totalCount: TOTAL_QUESTION_COUNT,
      lastSavedStepNo: input.stepNo,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
    },
    tokenExpiresAt,
  };
}
