"use client";
// 資質 4 型レーダー（V-02。06 §6.3）
import { RadarChart } from "./RadarChart";
import { CHART_SIZES } from "@/lib/presentation/chart-theme";
import { aptitudeRadarOptions, aptitudeRadarSeries } from "@/lib/presentation/radar-options";
import type { AptitudeScores } from "@/lib/scoring/types";

export interface AptitudeRadarProps {
  readonly subjectName: string;
  readonly subject: AptitudeScores; // 0 以上、1.25 刻み
  readonly onMounted?: () => void; // 07 §9.6
  /** 印刷用ページ（07 §9.5）では小さくする。省略時は画面の大きさ（06 §6） */
  readonly width?: number;
  readonly height?: number;
}

export function AptitudeRadar(props: AptitudeRadarProps) {
  const series = aptitudeRadarSeries(props.subjectName, props.subject);
  return (
    <RadarChart
      buildOptions={(onMounted) => aptitudeRadarOptions(props.subject, onMounted)}
      optionsKey={series[0]?.data.every((v) => v === 0) ? "empty" : "auto"}
      series={series}
      width={props.width ?? CHART_SIZES.aptitudeRadar.width}
      height={props.height ?? CHART_SIZES.aptitudeRadar.height}
      ariaLabel="資質のレーダーチャート"
      onMounted={props.onMounted}
    />
  );
}
