// 結果詳細の表示の規則（11-4 §3.5 の result-detail-rules.ts。PR-7.8a の分）。画面の部品（components/admin/result/）と
// buildResultDetailView（result-detail-view.ts）が使う純関数で、React・window・Next.js・Firebase と lib/services に触れない
// （Client Component から import する）。部品が読むので、文言マスタ（lib/masters/texts）は読まない（11-4 §2.21。文は
// buildResultDetailView がサーバで組み立てて渡す）。丸めは rounding.ts、段階は colors.ts で行う。
// 育て方・接し方の関数と型（aptitudeShares・splitStyleBody・howToTitle・splitHowTo・StyleBodyParts・HowToParts）は PR-7.8b が足す
import { riskLevel, type RiskLevel } from "./colors";
import { clampForSlider } from "./negative-values";
import { RESULT_DETAIL_TEXTS } from "./result-detail-texts";
import { toDisplayPercent } from "./rounding";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import {
  TRAIT_KEYS,
  type RiskKey,
  type RiskScores,
  type SocialStyleKey,
  type TraitKey,
  type TraitScores,
} from "@/lib/scoring/types";

/** 16の特性の一覧の並び（§2.8.6）。score = 点数の高い順（既定）、diff = 平均との差、def = 項目順 */
export type TraitSortOrder = "score" | "diff" | "def";

/** 項目順（TRAIT_KEYS。00 §1.2）の位置 */
const TRAIT_INDEX: ReadonlyMap<TraitKey, number> = new Map(TRAIT_KEYS.map((key, i) => [key, i]));
const traitIndex = (key: TraitKey): number => TRAIT_INDEX.get(key) ?? 0;

/**
 * 平均との差を同じとみなす幅。平均は合計 ÷ 人数で丸めない（03 §7.3）ので、3 人など割り切れない人数では、数学的に同じ差が
 * 浮動小数の誤差（1e-15 ほど）で違って見える。値は 0.5 刻みで、数学的に違う差は 1 ÷（2 × 人数）以上離れるので、この幅で取り違えない
 */
const SAME_DIFF_EPSILON = 1e-9;

/**
 * 16の特性の一覧の並び（§2.8.6）。レーダー・凡例・項目の説明は並べ替えない。
 * - score: 本人の値の大きい順。同じ値は、いちばん高い特性を先、いちばん低い特性を後、ほかは項目順（16 項目が同じ値なら
 *   highestKey = lowestKey = 協力性で、項目順のまま）
 * - diff: 本人 − 平均（丸めない）の大きい順。同じ差は項目順（差が SAME_DIFF_EPSILON 以内なら同じ差とみなす）。averages が null
 *   （比較あり以外）のときは項目順として扱う
 * - def: 項目順
 */
export function sortTraitKeys(input: {
  readonly values: TraitScores;
  readonly averages: TraitScores | null;
  readonly order: TraitSortOrder;
  readonly highestKey: TraitKey;
  readonly lowestKey: TraitKey;
}): readonly TraitKey[] {
  const { values, averages, order, highestKey, lowestKey } = input;
  const keys = [...TRAIT_KEYS];
  if (order === "score") {
    // 同じ値の中での順: いちばん高い特性 0、ほか 1、いちばん低い特性 2（高い = 低いなら高い側の 0）
    const tieRank = (key: TraitKey): number => (key === highestKey ? 0 : key === lowestKey ? 2 : 1);
    keys.sort(
      (a, b) => values[b] - values[a] || tieRank(a) - tieRank(b) || traitIndex(a) - traitIndex(b),
    );
  } else if (order === "diff" && averages !== null) {
    const diffOf = (key: TraitKey): number => values[key] - averages[key];
    keys.sort((a, b) => {
      const gap = diffOf(b) - diffOf(a);
      return Math.abs(gap) > SAME_DIFF_EPSILON ? gap : traitIndex(a) - traitIndex(b);
    });
  }
  return Object.freeze(keys);
}

/**
 * リスク 7 項目の並びと段階（§2.10・§2.7.5）。表示値（toDisplayPercent。0〜100 に収めて四捨五入した整数）の大きい順で、
 * 同じ値はマスタの順（00 §1.5 の sort_order）。段階は表示値で決める（riskLevel）
 */
export function rankRisks(risks: RiskScores): ReadonlyArray<{
  readonly key: RiskKey;
  readonly display: number;
  readonly level: RiskLevel;
}> {
  return Object.freeze(
    [...RISK_DEFINITIONS]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d, index) => ({ key: d.key, display: toDisplayPercent(risks[d.key]), index }))
      .sort((a, b) => b.display - a.display || a.index - b.index)
      .map(({ key, display }) => Object.freeze({ key, display, level: riskLevel(display) })),
  );
}

/**
 * 組織との相性の一言（§2.11。比較ありのときだけ出す）。本人と平均をそれぞれ 0〜100 に収めてから d = 本人 − 平均 を求め、
 * |d| が 5 以下なら「組織とほぼ同じ」、d が負なら「組織より「{左の言葉}」寄り」、正なら「組織より「{右の言葉}」寄り」
 */
export function fitLean(subject: number, average: number, left: string, right: string): string {
  const d = clampForSlider(subject) - clampForSlider(average);
  if (Math.abs(d) <= 5) return RESULT_DETAIL_TEXTS.fit.same;
  return RESULT_DETAIL_TEXTS.fit.lean(d < 0 ? left : right);
}

/**
 * タイプの適性（§2.7.1・§2.12）。適性の見出し（TYPE_TEXTS の aptitudeHeading。例「<人を活躍させる仕事>に適性があります」）の
 * `<` と `>` の間の文字。`<` `>` が無ければ、末尾の「。」と「に適性があります」を除いた文字
 */
export function aptitudeOfHeading(heading: string): string {
  const bracketed = /<([^>]*)>/.exec(heading);
  if (bracketed) return bracketed[1] ?? "";
  return heading.replace(/。$/, "").replace(/に適性があります$/, "");
}

/** 優位感覚の短い名前（§2.13.1）: 全文（例「視覚（Visual）」）の最初の「（」より前。概要のタグにも使う（§2.7.1） */
export function senseShortName(sense: string): string {
  const paren = sense.indexOf("（");
  return paren < 0 ? sense : sense.slice(0, paren);
}

/** 組織内のポジションの説明（POSITION_DEFINITIONS の description）を改行で分け、各行の先頭の「・」を 1 つ除く（§2.7.2・§2.11） */
export function positionLines(description: string): readonly string[] {
  return Object.freeze(description.split("\n").map((line) => line.replace(/^・/, "")));
}

/** 特性の詳細の見出し（§2.9）: マスタのカテゴリの名前の最初の「及び」を「・」にする（情緒及び精神面 → 情緒・精神面） */
export function detailHeading(label: string): string {
  return label.replace("及び", "・");
}

/**
 * 比較なしの文言（§2.6）。未選択・失敗は「右上で比較組織を選ぶと表示されます」、読み込み中は「データを読み込んでいます」、
 * 0 人は「「{比較組織名}」には比べられる回答がありません」（scopeLabel は formatScopeLabel の名前）
 */
export function noComparisonText(
  state: "none" | "loading" | "empty" | "error",
  scopeLabel: string | null,
): string {
  const texts = RESULT_DETAIL_TEXTS.noComparison;
  if (state === "loading") return texts.loading;
  if (state === "empty") return texts.empty(scopeLabel ?? "");
  return texts.none;
}

/** 接し方のタブの既定（見ている人のスタイル。§2.14.4・§2.18） */
export const DEFAULT_VIEWER_STYLE: SocialStyleKey = "driving";
