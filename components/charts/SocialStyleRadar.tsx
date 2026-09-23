"use client";
// ソーシャルスタイル 4 分類レーダー（V-03。06 §6.4）
import { RadarChart } from "./RadarChart";
import { CHART_SIZES } from "@/lib/presentation/chart-theme";
import { socialStyleRadarOptions, socialStyleRadarSeries } from "@/lib/presentation/radar-options";
import type { SocialStyleScores } from "@/lib/scoring/types";

export interface SocialStyleRadarProps {
  readonly subjectName: string;
  readonly subject: SocialStyleScores; // 負値あり（描画時に 0 に丸める）
  readonly onMounted?: () => void; // 07 §9.6
}

export function SocialStyleRadar(props: SocialStyleRadarProps) {
  return (
    <RadarChart
      buildOptions={(onMounted) => socialStyleRadarOptions(onMounted)}
      optionsKey="social-style"
      series={socialStyleRadarSeries(props.subjectName, props.subject)}
      width={CHART_SIZES.socialStyleRadar.width}
      height={CHART_SIZES.socialStyleRadar.height}
      ariaLabel="ソーシャルスタイルのレーダーチャート"
      onMounted={props.onMounted}
    />
  );
}
