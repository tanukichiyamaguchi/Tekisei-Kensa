// グラフ用データ整形（06 §6.8）。画面部品は ScoreResult / ComparisonResult から直接系列を作らず、ここを通す。
import { matchScoreColor, reliabilityColor, riskColor } from "./colors";
import { clampForRadar } from "./negative-values";
import { toDisplayPercent } from "./rounding";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import type {
  AptitudeKey,
  AptitudeScores,
  ComparisonResult,
  ScoreResult,
  SocialStyleKey,
  SocialStyleScores,
  TraitKey,
  TraitScores,
} from "@/lib/scoring/types";

export interface GaugeView {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly value: number; // 表示値。整数 0〜100
  readonly color: string;
}
export interface SliderView {
  readonly key: string;
  readonly label: string;
  readonly lowLabel: string;
  readonly highLabel: string;
  readonly value: number; // 保存値（整数、負値あり）。位置は clampForSlider で求める
}
export interface RadarAxis<K extends string> {
  readonly key: K;
  readonly label: string;
}

function bySortOrder<T extends { readonly sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 16 尺度レーダーの軸（sortOrder = 付録E §1 の軸順） */
export const TRAIT_RADAR_AXES: readonly RadarAxis<TraitKey>[] = Object.freeze(
  bySortOrder(TRAIT_DEFINITIONS).map((d) => ({ key: d.key, label: d.label })),
);
/** 資質レーダーの軸（表示名。内部名は使わない。00 §1.4） */
export const APTITUDE_RADAR_AXES: readonly RadarAxis<AptitudeKey>[] = Object.freeze(
  bySortOrder(APTITUDE_DEFINITIONS).map((d) => ({ key: d.key, label: d.label })),
);
/** ソーシャルスタイルレーダーの軸（chartOrder = ドライビング, エクスプレッシブ, エミアブル, アナリティカル） */
export const SOCIAL_STYLE_RADAR_AXES: readonly RadarAxis<SocialStyleKey>[] = Object.freeze(
  [...SOCIAL_STYLE_DEFINITIONS]
    .sort((a, b) => a.chartOrder - b.chartOrder)
    .map((d) => ({ key: d.key, label: d.labelKatakana })),
);

/** 16 尺度の系列値（受検者・比較対象平均の両方に使う。丸めない。03 §9.2） */
export function traitRadarValues(traits: TraitScores): readonly number[] {
  return TRAIT_RADAR_AXES.map((a) => traits[a.key]);
}
export function aptitudeRadarValues(aptitudes: AptitudeScores): readonly number[] {
  return APTITUDE_RADAR_AXES.map((a) => aptitudes[a.key]);
}
/** 負値は 0 に丸める（03 §8.4） */
export function socialStyleRadarValues(styles: SocialStyleScores): readonly number[] {
  return SOCIAL_STYLE_RADAR_AXES.map((a) => clampForRadar(styles[a.key]));
}

export function reliabilityGauge(result: ScoreResult): GaugeView {
  const value = toDisplayPercent(result.reliability);
  return {
    key: "reliability",
    label: "信頼係数",
    title: "信頼係数",
    value,
    color: reliabilityColor(value),
  };
}

export function matchScoreGauge(comparison: ComparisonResult): GaugeView {
  const value = toDisplayPercent(comparison.matchScore);
  return {
    key: "match_score",
    label: "組織との合致度",
    title: "組織との合致度",
    value,
    color: matchScoreColor(value),
  };
}

/** リスク 7 件（sortOrder 順）。ラベルは短縮名、title は正式名。負値は 0% */
export function riskGauges(result: ScoreResult): readonly GaugeView[] {
  return bySortOrder(RISK_DEFINITIONS).map((d) => {
    const value = toDisplayPercent(result.risks[d.key]);
    return { key: d.key, label: d.shortLabel, title: d.label, value, color: riskColor(value) };
  });
}

/** 相性 5 件（sortOrder 順）。値はそのまま（負値を含む） */
export function compatSliders(result: ScoreResult): readonly SliderView[] {
  return bySortOrder(COMPATIBILITY_DEFINITIONS).map((d) => ({
    key: d.key,
    label: d.label,
    lowLabel: d.lowLabel,
    highLabel: d.highLabel,
    value: result.compatibility[d.key],
  }));
}
