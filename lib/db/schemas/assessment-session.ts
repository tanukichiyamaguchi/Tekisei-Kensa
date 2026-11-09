import { z } from "zod";

import {
  answerKeySchema,
  choiceCodeSchema,
  docIdSchema,
  scoredQuestionNoSchema,
  sha256HexSchema,
  stepNoSchema,
  timestampSchema,
} from "./values";

/**
 * assessmentSessions の作成データ（02 §3.4、11-1 §3.2.2）。answers は空 map で始める。
 * lastSavedPageNo は書かない（M7 より前の文書に残っていても読まない）
 */
export const assessmentSessionCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  respondentId: docIdSchema,
  status: z.literal("draft"),
  sessionTokenHash: sha256HexSchema,
  tokenExpiresAt: timestampSchema,
  answers: z.strictObject({}),
  lastSavedStepNo: z.null(),
  lastAnsweredAt: z.null(),
  startedAt: z.null(),
  submittedAt: z.null(),
  resultId: z.null(),
  deletedAt: z.null(),
});

/** 1 ステップ分の回答（キー 1〜144、値 1〜5。02 §8.4 saveAnswers、§10 I-5、11-1 §3.2.2） */
export const answersPatchSchema = z
  .record(answerKeySchema, choiceCodeSchema)
  .refine((v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 41, {
    message: "1 回の保存の回答は 1〜41 問です",
  });

export const saveAnswersInputSchema = z.strictObject({
  lastSavedStepNo: stepNoSchema,
});

export { scoredQuestionNoSchema };
