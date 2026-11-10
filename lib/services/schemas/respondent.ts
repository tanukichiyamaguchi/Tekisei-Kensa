// 受検者 API の入力（04 §4.1、11-1 §3.4.1・§3.4.2）。お名前・電話番号の上限は画面の検査と同じ定数
// （lib/presentation/registration-rules.ts）を使う。電話番号は前後の空白を除くだけで、書式を検査せず正規化しない（K-39 Q-17、K-42）
import { z } from "zod";

import { choiceCodeSchema, docIdSchema, requiredText, scoredQuestionNoSchema } from "./common";
import { occupationCodeSchema } from "@/lib/db/schemas/values";
import { DIAGNOSIS_EXPERIENCES, RESPONDENT_KINDS } from "@/lib/db/types";
import { EXAM_STEP_COUNT } from "@/lib/masters/exam-steps";
import { NAME_MAX_LENGTH, PHONE_MAX_LENGTH } from "@/lib/presentation/registration-rules";

export const respondentKindSchema = z.enum(RESPONDENT_KINDS, {
  error: "区分は applicant / executive です",
});

/** GET /api/v1/respondent/organizations/{organizationId} のクエリ（kind 省略時は applicant） */
export const assessmentLinkQuerySchema = z.object({
  kind: respondentKindSchema.default("applicant"),
});

export const registerRespondentInputSchema = z.object({
  organizationId: docIdSchema,
  kind: respondentKindSchema, // applicant | executive（画面が p から決める。11-1 §2.2.1）
  name: requiredText(NAME_MAX_LENGTH), // 前後の空白を除いて 1〜100 文字（K-42）
  phoneNumber: requiredText(PHONE_MAX_LENGTH), // 前後の空白を除いて 1〜30 文字（K-42）。書式は検査しない（K-39 Q-17）
  occupationCode: occupationCodeSchema, // 1〜8、10（K-21）
  diagnosisExperience: z.enum(DIAGNOSIS_EXPERIENCES, { error: "過去の診断経験を選択してください" }),
  previousResultId: z.string().max(200).optional(), // 再受験リンクの prev。文書 ID の形でなければ service が無視する（422 にしない。11-1 §3.4.1）
});
export type RegisterRespondentInput = z.infer<typeof registerRespondentInputSchema>;

/** ステップ番号 1〜4（11-1 §2.4.1） */
export const examStepNoSchema = z.number().int().min(1).max(EXAM_STEP_COUNT);

/** 1 ステップ分の回答（1〜41 問）。設問がそのステップに属するかは service が確かめる（11-1 §3.4.2） */
export const saveAnswersInputSchema = z
  .object({
    stepNo: examStepNoSchema,
    answers: z
      .array(z.object({ questionNo: scoredQuestionNoSchema, choiceCode: choiceCodeSchema }))
      .min(1)
      .max(41),
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
