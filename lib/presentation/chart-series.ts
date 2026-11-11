// グラフ用データ整形（06 §6.8）。画面部品は ScoreResult から直接系列を作らず、ここを通す。レーダーの軸の順と値を返す
// （ゲージ・スライダーの整形は PR-7.8a で消した。結果詳細の上半分はメーター・横棒・相性の線を CSS で描き、色はリスクの 4 段階と
// 信頼係数の 3 段階（colors.ts）。11-4 §2.7・§2.10・§2.11）
import { clampForRadar } from "./negative-values";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import type {
  AptitudeKey,
  AptitudeScores,
  SocialStyleKey,
  SocialStyleScores,
  TraitKey,
  TraitScores,
} from "@/lib/scoring/types";

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
