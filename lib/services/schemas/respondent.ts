// 受検者 API の入力（04 §4.1、§4.2、§4.4）。電話番号の規則は lib/utils/phone-number.ts を 05 と共有する（D05-16）
import { z } from "zod";

import { choiceCodeSchema, docIdSchema, requiredText, scoredQuestionNoSchema } from "./common";
import { occupationCodeSchema } from "@/lib/db/schemas/values";
import { DIAGNOSIS_EXPERIENCES, RESPONDENT_KINDS } from "@/lib/db/types";
import { EXAM_PAGE_COUNT } from "@/lib/masters/exam-pages";
import { normalizePhoneNumber, PHONE_PATTERN } from "@/lib/utils/phone-number";

export const respondentKindSchema = z.enum(RESPONDENT_KINDS, {
  error: "区分は applicant / executive です",
});

/** GET /api/v1/respondent/organizations/{organizationId} のクエリ（kind 省略時は applicant） */
export const assessmentLinkQuerySchema = z.object({
  kind: respondentKindSchema.default("applicant"),
});

export const registerRespondentInputSchema = z.object({
  organizationId: docIdSchema,
  kind: respondentKindSchema,
  name: requiredText(100),
  phoneNumber: z
    .string({ error: "電話番号を入力してください" })
    .transform(normalizePhoneNumber)
    .refine((s) => PHONE_PATTERN.test(s), { message: "電話番号の形式が正しくありません" }),
  occupationCode: occupationCodeSchema,
  diagnosisExperience: z.enum(DIAGNOSIS_EXPERIENCES, { error: "過去の診断経験を選択してください" }),
});
export type RegisterRespondentInput = z.infer<typeof registerRespondentInputSchema>;

/** 通しページ番号（05 §5.3.1）。4 ステップ × 5 ページ = 20 */
export const examPageNoSchema = z.number().int().min(1).max(EXAM_PAGE_COUNT);

export const saveAnswersInputSchema = z
  .object({
    pageNo: examPageNoSchema,
    answers: z
      .array(z.object({ questionNo: scoredQuestionNoSchema, choiceCode: choiceCodeSchema }))
      .min(1)
      .max(8),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<number>();
    v.answers.forEach((a, i) => {
      if (seen.has(a.questionNo)) {
        ctx.addIssue({
          code: "custom",
          path: ["answers", i, "questionNo"],
          message: "設問番号が重複しています",
        });
      }
      seen.add(a.questionNo);
    });
  });
export type SaveAnswersInput = z.infer<typeof saveAnswersInputSchema>;
