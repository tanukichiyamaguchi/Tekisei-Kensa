// 比較の状態の文字（11-4 §2.6）。セクションの部品が、比較の状態（ComparisonProvider の ComparisonState）から比較組織の名前と
// 比較なしの文言を求める。比較なしの文言を出すのは、概要の組織内のポジション・概要の組織との合致度・組織との相性の凡例の 3 か所だけ
import type { ComparisonState } from "@/components/admin/result/ComparisonProvider";
import { formatScopeLabel } from "@/lib/presentation/comparison-view";
import { noComparisonText } from "@/lib/presentation/result-detail-rules";
import type { ComparisonDto } from "@/lib/services/dto/result";

/** 比較あり（ready）のときの応答。それ以外の 4 つの状態は null */
export function readyComparison(state: ComparisonState): ComparisonDto | null {
  return state.kind === "ready" ? state.comparison : null;
}

/** 比較なしの文言（未選択・失敗・読み込み中・0 人）。比較ありのときは null */
export function noComparisonOf(state: ComparisonState): string | null {
  if (state.kind === "ready") return null;
  return noComparisonText(
    state.kind,
    state.kind === "empty" ? formatScopeLabel(state.scope) : null,
  );
}
