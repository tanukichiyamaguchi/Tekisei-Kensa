import { z } from "zod";

import { calendarDateSchema, docIdSchema, teamCodeSchema, timestampSchema } from "./values";
import { AI_GENERATION_STATUSES } from "@/lib/ai/types";
import { EMPLOYMENT_STATUSES, RESPONDENT_KINDS, STAFF_ROLES } from "@/lib/db/types";
import type { EmploymentStatus } from "@/lib/db/types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";

const finite = z.number().refine(Number.isFinite, { message: "有限の数値ではありません" });

/** キー集合が keys と完全に一致し、値が value を満たす map */
function exactMap<K extends string>(keys: readonly K[], value: z.ZodType<number>) {
  return z.strictObject(
    Object.fromEntries(keys.map((k) => [k, value])) as Record<K, z.ZodType<number>>,
  );
}

/**
 * results の指標部分（ScoreResult）。値の範囲は付録B で理論上保証される範囲にだけ付ける
 * （負値が発生し得るものには付けない。02 §3.5、D02-15）
 */
export const scoreFieldsSchema = z
  .strictObject({
    scoringVersion: z.string().min(1).max(20),
    traits: exactMap(TRAIT_KEYS, finite.pipe(z.number().min(0).max(30))),
    compatibility: exactMap(COMPATIBILITY_KEYS, z.number().int().min(-100).max(100)),
    aptitudes: exactMap(APTITUDE_KEYS, finite.pipe(z.number().min(0))),
    aptitudeFirst: z.enum(APTITUDE_KEYS),
    aptitudeSecond: z.enum(APTITUDE_KEYS),
    risks: exactMap(RISK_KEYS, finite),
    aptitudeTypeScores: exactMap(APTITUDE_TYPE_KEYS, finite),
    aptitudeType: z.enum(APTITUDE_TYPE_KEYS),
    socialStyles: exactMap(SOCIAL_STYLE_KEYS, finite),
    socialStyle: z.enum(SOCIAL_STYLE_KEYS),
    reliability: finite.pipe(z.number().min(0).max(100)),
  })
  .refine((v) => v.aptitudeFirst !== v.aptitudeSecond, {
    message: "資質の第一候補と第二候補が同じです",
    path: ["aptitudeSecond"],
  });

/**
 * 区分・入社日・退職日の規則（11-2 §3.1）: 退職日は区分が退職のときだけ持てる。入社日と両方あるときは入社日 ≤ 退職日。
 * results の作成（resultCreateSchema）と、受検者の更新の書き込み（employmentFieldsSchema）で共有する
 */
function refineEmployment(
  v: {
    readonly employmentStatus: EmploymentStatus;
    readonly hiredOn: string | null;
    readonly leftOn: string | null;
  },
  ctx: z.core.$RefinementCtx,
): void {
  if (v.leftOn !== null && v.employmentStatus !== "left") {
    ctx.addIssue({
      code: "custom",
      path: ["leftOn"],
      message: "退職日は区分が退職のときだけ持てます",
    });
  }
  if (v.hiredOn !== null && v.leftOn !== null && v.leftOn < v.hiredOn) {
    ctx.addIssue({ code: "custom", path: ["leftOn"], message: "退職日が入社日より前です" });
  }
}

/** 役職（11-2 §3.1）。未設定は null（作成のときは null） */
export const staffRoleSchema = z.enum(STAFF_ROLES);

/** 区分・入社日・退職日の 3 つ組の書き込み（updatePersonAttributes。11-2 §3.11）。作成と同じ規則 */
export const employmentFieldsSchema = z
  .strictObject({
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    hiredOn: calendarDateSchema.nullable(),
    leftOn: calendarDateSchema.nullable(),
  })
  .superRefine(refineEmployment);

/** AI 解説の状態の作成時の値（今の採用向けと同じ書き方） */
const notGeneratedSchema = z.enum(AI_GENERATION_STATUSES).pipe(z.literal("not_generated"));

/** results の作成データ（02 §3.5）。submitSession() だけが作る */
export const resultCreateSchema = z
  .strictObject({
    organizationId: docIdSchema,
    respondentId: docIdSchema,
    sessionId: docIdSchema,
    respondentKind: z.enum(RESPONDENT_KINDS),
    teamCode: teamCodeSchema.nullable(),
    isExcluded: z.boolean(),
    submittedAt: timestampSchema,
    aiGenerationStatus: notGeneratedSchema,
    aiGenerationStartedAt: z.null(),
    aiGenerationError: z.null(),
    latestAiAnalysisId: z.null(),
    // 区分・入社日・退職日・役職（11-2 §3.1）
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    hiredOn: calendarDateSchema.nullable(),
    leftOn: calendarDateSchema.nullable(),
    staffRole: staffRoleSchema.nullable(),
    // 前回の結果（11-7 §3.1）
    previousResultId: docIdSchema.nullable(),
    // 育成・定着と経年比較の AI 解説（11-6 §3.1）。作成時の値だけを許す
    trainingAiStatus: notGeneratedSchema,
    trainingAiStartedAt: z.null(),
    trainingAiError: z.null(),
    latestTrainingAiAnalysisId: z.null(),
    trainingContext: z.null(),
    longitudinalAiStatus: notGeneratedSchema,
    longitudinalAiStartedAt: z.null(),
    longitudinalAiError: z.null(),
    latestLongitudinalAiAnalysisId: z.null(),
    deletedAt: z.null(),
  })
  .superRefine(refineEmployment)
  .and(scoreFieldsSchema);
