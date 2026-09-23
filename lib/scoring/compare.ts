// 比較計算（付録B §9〜§10、03 §7）。結果は保存しない（要件定義書 §11 の 6 番）。
import { EmptyPopulationError } from "./errors";
import { COMPATIBILITY_KEYS, TRAIT_KEYS } from "./types";
import type {
  CompatibilityKey,
  CompatibilityScores,
  ComparisonResult,
  ComparisonScope,
  Grade,
  PopulationMember,
  PositionKey,
  TraitScores,
} from "./types";

/** 閾値判定の許容誤差（03 §7.6、D3-10） */
export const THRESHOLD_EPSILON = 1e-9;

export interface GradeRule {
  readonly grade: Grade;
  readonly minMatch: number;
  readonly minDeviation: number;
}
/** A→D の順。上から順に最初に成立したものを採用し、どれも成立しなければ E（03 §7.4） */
export const GRADE_RULES: readonly GradeRule[] = Object.freeze([
  { grade: "A", minMatch: 80, minDeviation: 60 },
  { grade: "B", minMatch: 70, minDeviation: 50 },
  { grade: "C", minMatch: 60, minDeviation: 40 },
  { grade: "D", minMatch: 60, minDeviation: 30 },
]);

export interface PositionRule {
  readonly key: PositionKey;
  readonly minDeviation: number | null;
}
/** strong_leader→unfit の順（付録B §10、03 §7.5） */
export const POSITION_RULES: readonly PositionRule[] = Object.freeze([
  { key: "strong_leader", minDeviation: 60 },
  { key: "cooperative_leader", minDeviation: 50 },
  { key: "follower", minDeviation: 40 },
  { key: "passive_follower", minDeviation: 30 },
  { key: "unfit", minDeviation: null },
]);

function mapRecord<K extends string>(
  keys: readonly K[],
  f: (k: K) => number,
): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = f(k);
  return Object.freeze(out);
}

/** 単純算術平均。合計してから n で割る（03 §7.3） */
function averageRecord<K extends string>(
  records: ReadonlyArray<Readonly<Record<K, number>>>,
  keys: readonly K[],
): Readonly<Record<K, number>> {
  return mapRecord(keys, (k) => {
    let sum = 0;
    for (const r of records) sum += r[k];
    return sum / records.length;
  });
}

/** 合致度 = max(0, 100 − 0.5 × Σ|平均 − 受検者|) */
export function computeMatchScore(subjectTraits: TraitScores, traitAverages: TraitScores): number {
  let sumDiff = 0;
  for (const k of TRAIT_KEYS) sumDiff += Math.abs(traitAverages[k] - subjectTraits[k]);
  const value = 100 - 0.5 * sumDiff;
  return value < 0 ? 0 : value;
}

/**
 * 各軸の偏差 = (受検者 − 平均) / 2 + 50。5 軸とも受検者自身の同じ軸の値を使う
 * （思考の傾向に適応力を参照する既存の不具合は再現しない。要件定義書 §11 の 2 番）
 */
export function computeAxisDeviations(
  subject: CompatibilityScores,
  averages: CompatibilityScores,
): CompatibilityScores {
  return mapRecord<CompatibilityKey>(
    COMPATIBILITY_KEYS,
    (k) => (subject[k] - averages[k]) / 2 + 50,
  );
}

/** 偏差値 = 5 軸の偏差の平均 */
export function computeDeviationScore(axisDeviations: CompatibilityScores): number {
  let sum = 0;
  for (const k of COMPATIBILITY_KEYS) sum += axisDeviations[k];
  return sum / COMPATIBILITY_KEYS.length;
}

export function decideGrade(matchScore: number, deviationScore: number): Grade {
  for (const r of GRADE_RULES) {
    if (
      matchScore >= r.minMatch - THRESHOLD_EPSILON &&
      deviationScore >= r.minDeviation - THRESHOLD_EPSILON
    ) {
      return r.grade;
    }
  }
  return "E";
}

export function decidePosition(deviationScore: number): PositionKey {
  const hit = POSITION_RULES.find(
    (r) => r.minDeviation === null || deviationScore >= r.minDeviation - THRESHOLD_EPSILON,
  );
  return hit?.key ?? "unfit";
}

/**
 * 閲覧対象 subject を母集団 population と比較する。population はフィルタも重複排除もせず、
 * そのまま母集団として扱う（取得条件は 02 の fetchPopulation() が担う）。0 件なら EmptyPopulationError。
 */
export function compareWithPopulation(
  subject: PopulationMember,
  population: readonly PopulationMember[],
  scope: ComparisonScope,
): ComparisonResult {
  if (population.length === 0) throw new EmptyPopulationError(scope);
  const traitAverages = averageRecord(
    population.map((m) => m.traits),
    TRAIT_KEYS,
  );
  const compatibilityAverages = averageRecord(
    population.map((m) => m.compatibility),
    COMPATIBILITY_KEYS,
  );
  const traitDiffs = mapRecord(TRAIT_KEYS, (k) => Math.abs(traitAverages[k] - subject.traits[k]));
  const matchScore = computeMatchScore(subject.traits, traitAverages);
  const axisDeviations = computeAxisDeviations(subject.compatibility, compatibilityAverages);
  const deviationScore = computeDeviationScore(axisDeviations);
  return Object.freeze({
    scope,
    populationSize: population.length,
    traitAverages,
    traitDiffs,
    compatibilityAverages,
    axisDeviations,
    matchScore,
    deviationScore,
    grade: decideGrade(matchScore, deviationScore),
    position: decidePosition(deviationScore),
  });
}
