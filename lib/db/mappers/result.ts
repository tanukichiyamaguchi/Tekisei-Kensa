// results 文書 ↔ ScoreResult / PopulationMember（02 §5.5、03 §5.9）。値を変換・丸めしない
import { MappingError, toDate, toNullableDate } from "./timestamp";
import type { Result } from "@/lib/db/domain";
import { initialEmploymentStatus } from "@/lib/db/employment-status";
import { trainingContextSchema } from "@/lib/db/schemas/training-context";
import type { ResultDoc } from "@/lib/db/types";
import type { TrainingContext } from "@/lib/masters/training-context";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";
import type { PopulationMember, ScoreResult } from "@/lib/scoring/types";
import { logger } from "@/lib/utils/logger";

type ScoreFields = Pick<ResultDoc, keyof ScoreResult>;

function numberMap<K extends string>(
  value: unknown,
  keys: readonly K[],
  field: string,
): Readonly<Record<K, number>> {
  if (typeof value !== "object" || value === null) throw new MappingError(`${field} がありません`);
  const src = value as Record<string, unknown>;
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new MappingError(`${field}.${k} が数値ではありません`);
    out[k] = v;
  }
  return out;
}

function oneOf<K extends string>(value: unknown, keys: readonly K[], field: string): K {
  if (typeof value !== "string" || !(keys as readonly string[]).includes(value)) {
    throw new MappingError(`${field} が不正です`);
  }
  return value as K;
}

/** 指標 map 6 つ + 単値 6 つを取り出す。全キーの存在と number 型を検証する */
export function toScoreResult(doc: ScoreFields): ScoreResult {
  if (typeof doc.scoringVersion !== "string") throw new MappingError("scoringVersion がありません");
  if (typeof doc.reliability !== "number") throw new MappingError("reliability がありません");
  return {
    scoringVersion: doc.scoringVersion,
    traits: numberMap(doc.traits, TRAIT_KEYS, "traits"),
    compatibility: numberMap(doc.compatibility, COMPATIBILITY_KEYS, "compatibility"),
    aptitudes: numberMap(doc.aptitudes, APTITUDE_KEYS, "aptitudes"),
    aptitudeFirst: oneOf(doc.aptitudeFirst, APTITUDE_KEYS, "aptitudeFirst"),
    aptitudeSecond: oneOf(doc.aptitudeSecond, APTITUDE_KEYS, "aptitudeSecond"),
    risks: numberMap(doc.risks, RISK_KEYS, "risks"),
    aptitudeTypeScores: numberMap(doc.aptitudeTypeScores, APTITUDE_TYPE_KEYS, "aptitudeTypeScores"),
    aptitudeType: oneOf(doc.aptitudeType, APTITUDE_TYPE_KEYS, "aptitudeType"),
    socialStyles: numberMap(doc.socialStyles, SOCIAL_STYLE_KEYS, "socialStyles"),
    socialStyle: oneOf(doc.socialStyle, SOCIAL_STYLE_KEYS, "socialStyle"),
    reliability: doc.reliability,
  };
}

/** select("traits", "compatibility") の結果から変換する。16 キー・5 キーが揃っていることを検証する */
export function toPopulationMember(
  data: Pick<ResultDoc, "traits" | "compatibility">,
): PopulationMember {
  return {
    traits: numberMap(data.traits, TRAIT_KEYS, "traits"),
    compatibility: numberMap(data.compatibility, COMPATIBILITY_KEYS, "compatibility"),
  };
}

/** ScoreResult → results の作成データ（キー名の変換なし。Object.freeze を外す以外の変換をしない） */
export function toResultDocFields(score: ScoreResult): ScoreFields {
  return {
    scoringVersion: score.scoringVersion,
    traits: { ...score.traits },
    compatibility: { ...score.compatibility },
    aptitudes: { ...score.aptitudes },
    aptitudeFirst: score.aptitudeFirst,
    aptitudeSecond: score.aptitudeSecond,
    risks: { ...score.risks },
    aptitudeTypeScores: { ...score.aptitudeTypeScores },
    aptitudeType: score.aptitudeType,
    socialStyles: { ...score.socialStyles },
    socialStyle: score.socialStyle,
    reliability: score.reliability,
  };
}

/**
 * results.trainingContext（11-6 §3.1）。無い・null は null。8 項目の形（trainingContextSchema）に合わなければ
 * null とみなし、warn のログに resultId だけを出す（8 項目の値は出さない）
 */
function storedTrainingContext(resultId: string, value: unknown): TrainingContext | null {
  if (value === undefined || value === null) return null;
  const parsed = trainingContextSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  logger.warn("results.training_context_invalid", { resultId });
  return null;
}

export function toResult(id: string, doc: ResultDoc): Result {
  const score = toScoreResult(doc);
  if (typeof doc.organizationId !== "string")
    throw new MappingError("results.organizationId がありません");
  // M7 で足した項目は M7 より前の文書には無い。無ければ作成時の値で補い、ある値は検証しない
  // （trainingContext だけは形を確かめる。02 §2・§5.5）
  const m7: Partial<ResultDoc> = doc;
  return {
    id,
    ...score,
    organizationId: doc.organizationId,
    respondentId: doc.respondentId,
    sessionId: doc.sessionId,
    respondentKind: doc.respondentKind,
    teamCode: doc.teamCode,
    isExcluded: doc.isExcluded,
    submittedAt: toDate(doc.submittedAt, "submittedAt"),
    aiGenerationStatus: doc.aiGenerationStatus,
    aiGenerationStartedAt: toNullableDate(doc.aiGenerationStartedAt, "aiGenerationStartedAt"),
    aiGenerationError: doc.aiGenerationError,
    latestAiAnalysisId: doc.latestAiAnalysisId,
    employmentStatus: m7.employmentStatus ?? initialEmploymentStatus(doc.respondentKind),
    hiredOn: m7.hiredOn ?? null,
    leftOn: m7.leftOn ?? null,
    staffRole: m7.staffRole ?? null,
    previousResultId: m7.previousResultId ?? null,
    trainingAiStatus: m7.trainingAiStatus ?? "not_generated",
    trainingAiStartedAt: toNullableDate(m7.trainingAiStartedAt ?? null, "trainingAiStartedAt"),
    trainingAiError: m7.trainingAiError ?? null,
    latestTrainingAiAnalysisId: m7.latestTrainingAiAnalysisId ?? null,
    trainingContext: storedTrainingContext(id, m7.trainingContext),
    longitudinalAiStatus: m7.longitudinalAiStatus ?? "not_generated",
    longitudinalAiStartedAt: toNullableDate(
      m7.longitudinalAiStartedAt ?? null,
      "longitudinalAiStartedAt",
    ),
    longitudinalAiError: m7.longitudinalAiError ?? null,
    latestLongitudinalAiAnalysisId: m7.latestLongitudinalAiAnalysisId ?? null,
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}
