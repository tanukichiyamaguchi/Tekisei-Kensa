import { z } from "zod";

import { docIdSchema, teamCodeSchema, timestampSchema } from "./values";
import { AI_GENERATION_STATUSES } from "@/lib/ai/types";
import { RESPONDENT_KINDS } from "@/lib/db/types";
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
    aiGenerationStatus: z.enum(AI_GENERATION_STATUSES).pipe(z.literal("not_generated")),
    aiGenerationStartedAt: z.null(),
    aiGenerationError: z.null(),
    latestAiAnalysisId: z.null(),
    deletedAt: z.null(),
  })
  .and(scoreFieldsSchema);
