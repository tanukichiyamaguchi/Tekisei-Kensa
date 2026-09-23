// レーダー 3 種の ApexCharts 設定と系列（06 §6.2〜§6.4。付録E §1・§2）。
// 描画部品（components/charts/）から切り離した純関数で、Node の単体テストから検証する（06 §11）
import type { ApexOptions } from "apexcharts";

import {
  APTITUDE_RADAR_AXES,
  SOCIAL_STYLE_RADAR_AXES,
  TRAIT_RADAR_AXES,
  aptitudeRadarValues,
  socialStyleRadarValues,
  traitRadarValues,
} from "./chart-series";
import { CHART_COLORS, CHART_FONT_FAMILY, COMPARISON_SERIES_NAME, RADAR_MAX } from "./chart-theme";
import type { AptitudeScores, SocialStyleScores, TraitScores } from "@/lib/scoring/types";

export type RadarSeries = Array<{ name: string; data: number[] }>;

/** 資質 4 型がすべて 0 のときの仮の最大値（ApexCharts が最大値を決められないため。06 §6.3 の設計判断） */
export const APTITUDE_EMPTY_MAX = 10;

/** 3 種に共通の設定（付録E §2 の取得値。アニメーションは PDF のため無効。06 D06-21） */
function baseRadarOptions(
  categories: readonly string[],
  colors: readonly string[],
  onMounted?: () => void,
): ApexOptions {
  return {
    chart: {
      type: "radar",
      toolbar: { show: false },
      animations: { enabled: false },
      fontFamily: CHART_FONT_FAMILY,
      ...(onMounted ? { events: { mounted: () => onMounted() } } : {}),
    },
    xaxis: { categories: [...categories] },
    stroke: { width: 5, curve: "straight" },
    fill: { type: "solid", opacity: 0.5 },
    markers: { size: 5 },
    legend: { show: true, position: "bottom" },
    dataLabels: { enabled: false },
    tooltip: { enabled: false },
    colors: [...colors],
  };
}

/** 16 尺度（V-01）。比較選択時は「比較対象」系列を重ねる */
export function traitRadarOptions(hasComparison: boolean, onMounted?: () => void): ApexOptions {
  return {
    ...baseRadarOptions(
      TRAIT_RADAR_AXES.map((a) => a.label),
      hasComparison ? [CHART_COLORS.subject, CHART_COLORS.comparison] : [CHART_COLORS.subject],
      onMounted,
    ),
    yaxis: { show: false, min: 0, max: RADAR_MAX.traits },
  };
}

export function traitRadarSeries(input: {
  readonly subjectName: string;
  readonly subject: TraitScores;
  readonly comparison?: TraitScores | null | undefined;
}): RadarSeries {
  const series: RadarSeries = [
    { name: input.subjectName, data: [...traitRadarValues(input.subject)] },
  ];
  // 比較対象は comparison.traitAverages をそのまま（丸めない。03 §9.2）。差分は描かない
  if (input.comparison) {
    series.push({ name: COMPARISON_SERIES_NAME, data: [...traitRadarValues(input.comparison)] });
  }
  return series;
}

/** 資質 4 型（V-02）。最大値は自動（付録E §2 yaxis_max null）、すべて 0 なら仮の最大値 */
export function aptitudeRadarOptions(subject: AptitudeScores, onMounted?: () => void): ApexOptions {
  const allZero = aptitudeRadarValues(subject).every((v) => v === 0);
  return {
    ...baseRadarOptions(
      APTITUDE_RADAR_AXES.map((a) => a.label),
      [CHART_COLORS.subject],
      onMounted,
    ),
    yaxis: allZero ? { show: false, min: 0, max: APTITUDE_EMPTY_MAX } : { show: false, min: 0 },
  };
}

export function aptitudeRadarSeries(subjectName: string, subject: AptitudeScores): RadarSeries {
  return [{ name: subjectName, data: [...aptitudeRadarValues(subject)] }];
}

/** ソーシャルスタイル 4 分類（V-03）。軸は chartOrder、負値は 0 に丸める（03 §8.4） */
export function socialStyleRadarOptions(onMounted?: () => void): ApexOptions {
  return {
    ...baseRadarOptions(
      SOCIAL_STYLE_RADAR_AXES.map((a) => a.label),
      [CHART_COLORS.subject],
      onMounted,
    ),
    yaxis: { show: false, min: 0, max: RADAR_MAX.socialStyles },
  };
}

export function socialStyleRadarSeries(
  subjectName: string,
  styles: SocialStyleScores,
): RadarSeries {
  return [{ name: subjectName, data: [...socialStyleRadarValues(styles)] }];
}
