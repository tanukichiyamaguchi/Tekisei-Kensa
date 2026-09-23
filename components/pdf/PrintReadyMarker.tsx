"use client";
// 期待する個数のレーダーが描画を終えたら <html data-print-ready="true"> を付ける（07 §9.6）。
// lib/pdf/render-result-pdf.ts がこの属性を待ってから page.pdf を呼ぶ
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PrintReadyContext, type PrintReadyApi } from "@/components/charts/print-ready-context";

export const PRINT_READY_ATTRIBUTE = "data-print-ready";

export function PrintReadyProvider(props: {
  /** 印刷用ページに置くレーダーの個数 */
  readonly expectedCharts: number;
  readonly children: ReactNode;
}) {
  const mounted = useRef(new Set<string>());
  const [count, setCount] = useState(0);
  const notifyMounted = useCallback((chartId: string) => {
    if (mounted.current.has(chartId)) return;
    mounted.current.add(chartId);
    setCount(mounted.current.size);
  }, []);
  const api = useMemo<PrintReadyApi>(() => ({ notifyMounted }), [notifyMounted]);

  useEffect(() => {
    if (count < props.expectedCharts) return;
    // 描画完了の次のフレームで印を付ける（SVG の反映を待つ）
    const frame = requestAnimationFrame(() => {
      document.documentElement.setAttribute(PRINT_READY_ATTRIBUTE, "true");
    });
    return () => cancelAnimationFrame(frame);
  }, [count, props.expectedCharts]);

  return <PrintReadyContext.Provider value={api}>{props.children}</PrintReadyContext.Provider>;
}
