"use client";
// 16 尺度レーダー（V-01。06 §6.2）
import { RadarChart } from "./RadarChart";
import { traitRadarOptions, traitRadarSeries } from "@/lib/presentation/radar-options";
import type { TraitScores } from "@/lib/scoring/types";

export interface TraitRadarProps {
  readonly subjectName: string; // 凡例の系列名（氏名）
  readonly subject: TraitScores; // 受検者 0〜30
  readonly comparison?: TraitScores | null; // 比較対象平均（比較選択時のみ。comparison.traitAverages）
  readonly width: number; // 626（サマリー）／440（個人特性）。D06-25
  readonly height: number; // 450／440
  readonly onMounted?: () => void; // 07 の PrintReadyMarker が描画完了を数える（07 §9.6）
  readonly plotRadius?: number | undefined; // 印刷用ページのみ（07 §9.5）
}

export function TraitRadar(props: TraitRadarProps) {
  const hasComparison = Boolean(props.comparison);
  return (
    <RadarChart
      buildOptions={(onMounted) => traitRadarOptions(hasComparison, onMounted, props.plotRadius)}
      optionsKey={`${hasComparison ? "comparison" : "subject"}:${props.plotRadius ?? "auto"}`}
      series={traitRadarSeries(props)}
      width={props.width}
      height={props.height}
      ariaLabel="16 特性のレーダーチャート"
      onMounted={props.onMounted}
    />
  );
}
