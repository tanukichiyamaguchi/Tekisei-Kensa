// 印刷用ページのレーダー描画完了の通知先（07 §9.6）。画面では Provider が無いため null
import { createContext } from "react";

export interface PrintReadyApi {
  /** グラフの描画完了で呼ぶ（同じ chartId の重複は 1 回として数える）。PR-7.8b から呼ぶグラフは無い（残すか消すかは 11-5） */
  readonly notifyMounted: (chartId: string) => void;
}

export const PrintReadyContext = createContext<PrintReadyApi | null>(null);
