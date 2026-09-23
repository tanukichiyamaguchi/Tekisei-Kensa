// 印刷用ページのレーダー描画完了の通知先（07 §9.6）。画面では Provider が無いため null
import { createContext } from "react";

export interface PrintReadyApi {
  /** ApexCharts の mounted イベントで呼ぶ（同じ chartId の重複は 1 回として数える） */
  readonly notifyMounted: (chartId: string) => void;
}

export const PrintReadyContext = createContext<PrintReadyApi | null>(null);
