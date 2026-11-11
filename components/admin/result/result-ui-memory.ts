// 結果詳細の並びとたたみ方を、別の人の結果に移っても保つためのモジュールの変数（11-4 §3.5 の result-ui-memory.ts・§2.8.6・§2.16）。
// 参照元は結果詳細の部品をページを開いている間ずっと使い、並びとたたみ方を人ごとに戻さない。アプリは同じ働きを、ブラウザのタブで
// ページを読み込んでいる間だけ残るモジュールの変数で作る（ページを読み込み直すと初めの状態に戻る）。Cookie・sessionStorage・
// localStorage・Firestore には置かず、氏名などの個人情報を入れない（11-4 §2.21・§3.1）。
// 読み書きは画面の形（variant="screen"）の Client の部品だけで、書くのはブラウザの操作と描いた直後の useEffect からだけ（サーバの描画では
// 書かないので、リクエストをまたいで値が混ざらない）。印刷の形は読まず書かない。11-5 §3.8 が類似分析の入力・選んだ相手・
// ダウンロードの選択を同じ考え方で足す
import type { TraitSortOrder } from "@/lib/presentation/result-detail-rules";
import type { ResultSectionId } from "@/lib/presentation/result-view-state";

export const resultUiMemory: {
  /** 16の特性の並び（初め "score"） */
  traitSort: TraitSortOrder;
  /** セクションごとのたたみ方（true = たたむ）。null = まだ初めの状態を決めていない（§2.16） */
  folded: Readonly<Record<ResultSectionId, boolean>> | null;
} = {
  traitSort: "score",
  folded: null,
};
