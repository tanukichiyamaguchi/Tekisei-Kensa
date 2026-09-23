import { z } from "zod";

import {
  answerKeySchema,
  choiceCodeSchema,
  docIdSchema,
  pageNoSchema,
  scoredQuestionNoSchema,
  sha256HexSchema,
  timestampSchema,
} from "./values";

/** assessmentSessions の作成データ（02 §3.4）。answers は空 map で始める */
export const assessmentSessionCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  respondentId: docIdSchema,
  status: z.literal("draft"),
  sessionTokenHash: sha256HexSchema,
  tokenExpiresAt: timestampSchema,
  answers: z.strictObject({}),
  lastSavedPageNo: z.null(),
  lastAnsweredAt: z.null(),
  startedAt: z.null(),
  submittedAt: z.null(),
  resultId: z.null(),
  deletedAt: z.null(),
});

/** 1 ページ分の回答（キー 1〜144、値 1〜5。02 §8.4 saveAnswers、§10 I-5） */
export const answersPatchSchema = z
  .record(answerKeySchema, choiceCodeSchema)
  .refine((v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 8, {
    message: "1 ページの回答は 1〜8 問です",
  });

export const saveAnswersInputSchema = z.strictObject({
  lastSavedPageNo: pageNoSchema,
});

export { scoredQuestionNoSchema };
