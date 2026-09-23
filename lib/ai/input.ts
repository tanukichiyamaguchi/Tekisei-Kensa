// AI 入力の組み立て（04 §7.1 の契約）と埋め込み値の整形（07 §2.3、D07-05）
import type { AiAnalysisInput } from "@/lib/ai/types";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { formatStep } from "@/lib/presentation/rounding";
import type { AptitudeTypeKey, ScoreResult } from "@/lib/scoring/types";

export function buildAiAnalysisInput(args: {
  readonly respondentName: string;
  readonly occupationCode: number;
  readonly score: ScoreResult;
}): AiAnalysisInput {
  return {
    respondentName: args.respondentName.trim(),
    occupationLabel: getOccupationLabel(args.occupationCode),
    result: args.score,
  };
}

/** 信頼係数: 四捨五入した整数（画面のゲージと同じ。03 §9.2） */
export function formatReliabilityForAi(value: number): string {
  return String(Math.round(value));
}

/** 16 尺度: 0.5 刻みの真値（formatStep） */
export function formatTraitForAi(value: number): string {
  return formatStep(value);
}

/** ソーシャルスタイル: 0.25 刻みの真値。負値は 0（画面のレーダーと同じ。03 §8.4） */
export function formatSocialStyleForAi(value: number): string {
  return formatStep(Math.max(0, value));
}

/** 資質: 1.25 刻みの真値。100 を超えてもそのまま渡す（07 D07-04） */
export function formatAptitudeForAi(value: number): string {
  return formatStep(value);
}

/** 組織との相性: 整数の真値。負値は 0（画面のスライダー表示と一致。D-07、07 D07-05） */
export function formatCompatibilityForAi(value: number): string {
  return formatStep(Math.max(0, value));
}

/** リスク: 2.5 刻みの真値。負値は 0（付録B §5 の画面表示と一致） */
export function formatRiskForAi(value: number): string {
  return formatStep(Math.max(0, value));
}

/** 適性タイプ: 「タイプ」を除いた短縮名（付録D の辞書がその形。00 §1.6） */
export function formatAptitudeTypeForAi(key: AptitudeTypeKey): string {
  const def = APTITUDE_TYPE_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new RangeError(`未知の適性タイプです: ${key}`);
  return def.shortLabel;
}
