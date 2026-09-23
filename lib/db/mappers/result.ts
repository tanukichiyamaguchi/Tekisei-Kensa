// results 文書 ↔ ScoreResult / PopulationMember（02 §5.5、03 §5.9）。値を変換・丸めしない
import { MappingError, toDate, toNullableDate } from "./timestamp";
import type { Result } from "@/lib/db/domain";
import type { ResultDoc } from "@/lib/db/types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";
import type { PopulationMember, ScoreResult } from "@/lib/scoring/types";

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

export function toResult(id: string, doc: ResultDoc): Result {
  const score = toScoreResult(doc);
  if (typeof doc.organizationId !== "string")
    throw new MappingError("results.organizationId がありません");
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
    createdAt: toDate(doc.createdAt, "createdAt"),
    updatedAt: toDate(doc.updatedAt, "updatedAt"),
    deletedAt: toNullableDate(doc.deletedAt, "deletedAt"),
  };
}
