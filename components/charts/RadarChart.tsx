"use client";
// レーダー 3 種の共通の描画部品（06 §6.1）。react-apexcharts はブラウザ専用のため ssr: false で読み込み、
// 読み込み中は同じ大きさの空枠を出してレイアウトのずれを防ぐ
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { useCallback, useContext, useEffect, useId, useMemo, useRef } from "react";

import { PrintReadyContext } from "./print-ready-context";

import type { RadarSeries } from "@/lib/presentation/radar-options";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => null,
});

export interface RadarChartProps {
  readonly buildOptions: (onMounted?: () => void) => ApexOptions;
  readonly optionsKey: string; // options を作り直す条件（比較の有無など）
  readonly series: RadarSeries;
  readonly width: number;
  readonly height: number;
  readonly ariaLabel: string;
  readonly onMounted?: (() => void) | undefined;
}

export function RadarChart(props: RadarChartProps) {
  const { buildOptions, optionsKey, series, width, height, ariaLabel, onMounted } = props;
  // onMounted の変化で options を作り直さない（再描画を避ける。06 §6.2 の注記）
  const mountedRef = useRef(onMounted);
  useEffect(() => {
    mountedRef.current = onMounted;
  }, [onMounted]);
  // 印刷用ページ（07 §9.6）では PrintReadyProvider に描画完了を知らせる
  const printReady = useContext(PrintReadyContext);
  const chartId = useId();
  const hasMounted = onMounted !== undefined || printReady !== null;
  const fireMounted = useCallback(() => {
    mountedRef.current?.();
    printReady?.notifyMounted(chartId);
  }, [printReady, chartId]);
  const options = useMemo(
    () => buildOptions(hasMounted ? fireMounted : undefined),
    // optionsKey が変わったときだけ作り直す（buildOptions は呼び出し側で毎回作られるため依存に含めない）
    [optionsKey, hasMounted, fireMounted],
  );
  return (
    <div className="radar-chart" style={{ width, height }} role="img" aria-label={ariaLabel}>
      <ReactApexChart
        type="radar"
        options={options}
        series={series}
        width={width}
        height={height}
      />
    </div>
  );
}
