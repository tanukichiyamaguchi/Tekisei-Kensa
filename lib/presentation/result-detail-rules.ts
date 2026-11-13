// 結果詳細の表示の規則（11-4 §3.5 の result-detail-rules.ts）。画面の部品（components/admin/result/）と
// buildResultDetailView（result-detail-view.ts）が使う純関数で、React・window・Next.js・Firebase と lib/services に触れない
// （Client Component から import する）。部品が読むので、文言マスタ（lib/masters/texts）は読まない（11-4 §2.21。文は
// buildResultDetailView がサーバで組み立てて渡す）。丸め（小数第 1 位の表示・表示値）は rounding.ts、段階は colors.ts で行う
// （資質の割合の百分率は §2.13.1 の式のまま aptitudeShares が四捨五入する）。育て方の資質の割合（aptitudeShares）は部品が、
// 接し方の本文の振り分け（splitStyleBody）と関わり方のコツの題と振り分け（howToTitle・splitHowTo）は buildResultDetailView が使う
import { riskLevel, type RiskLevel } from "./colors";
import { clampForSlider } from "./negative-values";
import { RESULT_DETAIL_TEXTS } from "./result-detail-texts";
import { formatOneDecimal, toDisplayPercent } from "./rounding";
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
 * 育て方の資質の割合（§2.13.1）。values は割合の行の順（値の大きい順。同じ値は軸の順。並べるのは呼ぶ側）の資質の点数で、並べ替えない。
 * 各値の小数第 1 位の表示を数にした f（Number(formatOneDecimal(v))）を求め、f の合計が 0 でなければ Math.round(f ÷ 合計 × 100) に
 * 「%」を付けた文字（行ごとに丸めるので、合計が 100 にならないことがある。例 122.5・90・60・25 → 41%・30%・20%・8%）、合計が 0 なら
 * f をそのまま（「%」なし。例 "0"）。式は §2.13.1 の順のまま左から計算する（f × 100 ÷ 合計 の順とは浮動小数の誤差で丸めが違うことが
 * ある。例 57.5・15・15・12.5 は 57.5 ÷ 100 × 100 が 57.49999… で 57%）
 */
export function aptitudeShares(values: readonly number[]): readonly string[] {
  const shown = values.map((value) => Number(formatOneDecimal(value)));
  const total = shown.reduce((sum, f) => sum + f, 0);
  return Object.freeze(
    shown.map((f) =>
      total === 0 ? String(f) : RESULT_DETAIL_TEXTS.percent(Math.round((f / total) * 100)),
    ),
  );
}

/** 接し方のソーシャルスタイルの本文の振り分け（§2.14.2）。無いものは "" */
export interface StyleBodyParts {
  readonly assertion: string; // 見出しの行の小さい行の 1 つ目（括弧なし。例 自己主張：弱／感情表出：強）
  readonly kind: string; // 小さい行の 2 つ目（〇〇派。括弧なし）
  readonly catchCopy: string; // キャッチ（「…」タイプ の「」の中）
  readonly paragraphs: readonly string[]; // 段落（1 行ずつ、本文の順）
}

/** 文を改行で分け、各行の前後の空白を除き、空の行を捨てる（§2.14.2・§2.14.3） */
function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** 全角か半角の開き括弧で始まり、全角か半角の閉じ括弧で終わる行の中（括弧を外した文字）。括弧の行でなければ null */
function bracketedInner(line: string): string | null {
  const match = /^[（(](.*)[）)]$/u.exec(line);
  return match ? (match[1] ?? "") : null;
}

/** 括弧の中の〇〇派（1〜8 文字で「派」で終わる） */
const STYLE_KIND = /^.{0,7}派$/u;
/** キャッチの行「「…」タイプ」。後ろに空白と括弧の〇〇派が続いてもよい */
const STYLE_CATCH_LINE = /^「(.+)」タイプ(?:\s+[（(](.{0,7}派)[）)])?$/u;

/**
 * ソーシャルスタイルの本文（STYLE_TEXTS の body）の振り分け（§2.14.2）。行に分け（前後の空白を除き、空の行は捨てる）、上から順に:
 * 小さい行の 1 つ目がまだ無く、括弧の中が「自己主張」で始まる行 → assertion（括弧を外す）／キャッチがまだ無く、「「…」タイプ」の
 * 形の行 → catchCopy（「」の中。後ろの括弧の〇〇派は、小さい行の 2 つ目がまだ無ければ kind）／小さい行の 2 つ目がまだ無く、括弧の
 * 中が 1〜8 文字で「派」で終わる行 → kind（括弧を外す）／それ以外 → paragraphs。括弧は全角・半角のどちらでも読む
 */
export function splitStyleBody(body: string): StyleBodyParts {
  let assertion = "";
  let kind = "";
  let catchCopy = "";
  const paragraphs: string[] = [];
  for (const line of linesOf(body)) {
    const inner = bracketedInner(line);
    if (assertion === "" && inner?.startsWith("自己主張")) {
      assertion = inner;
      continue;
    }
    const catchLine = catchCopy === "" ? STYLE_CATCH_LINE.exec(line) : null;
    if (catchLine) {
      catchCopy = catchLine[1] ?? "";
      if (kind === "") kind = catchLine[2] ?? "";
      continue;
    }
    if (kind === "" && inner !== null && STYLE_KIND.test(inner)) {
      kind = inner;
      continue;
    }
    paragraphs.push(line);
  }
  return Object.freeze({ assertion, kind, catchCopy, paragraphs: Object.freeze(paragraphs) });
}

/**
 * 関わり方のコツのカードの題（§2.14.3）。マスタの見出し（identifyHeading など）から、先頭から最初の「タイプ」まで（直後の「への」
 * 「の」「を」を含む）を除き、末尾の「……」を除く。先頭が「褒めるなら」なら「褒め方」。例「ドライビングタイプへの効果的な対応」→
 * 「効果的な対応」、「ドライビングタイプを褒めるなら……」→「褒め方」
 */
export function howToTitle(heading: string): string {
  const title = heading.replace(/^.*?タイプ(?:への|の|を)?/u, "").replace(/……$/u, "");
  return title.startsWith("褒めるなら") ? RESULT_DETAIL_TEXTS.style.praiseTitle : title;
}

/** 関わり方のコツのカードの中身の振り分け（§2.14.3）。どれも本文の順 */
export interface HowToParts {
  readonly ng: readonly string[]; // 「×」「✕」で始まる行（記号を除く。灰色の帯）
  /** 「○」「◯」「◎」で始まる行（記号と、記号を除いた文。緑の帯） */
  readonly ok: ReadonlyArray<{ readonly mark: string; readonly text: string }>;
  readonly bullets: readonly string[]; // 「・」で始まる行（声かけ例のカード以外。「・」を除く。箇条書き）
  readonly says: readonly string[]; // 「・」で始まる行（声かけ例のカード。「・」を除く。吹き出し）
  readonly paragraphs: readonly string[]; // それ以外の行
}

/** 灰色の帯の印（U+00D7・U+2715） */
const HOW_TO_NG_MARKS: readonly string[] = ["×", "✕"];
/** 緑の帯の印（U+25CB・U+25EF・U+25CE） */
const HOW_TO_OK_MARKS: readonly string[] = ["○", "◯", "◎"];
/** 箇条書き・吹き出しの印（U+30FB） */
const HOW_TO_BULLET = "・";

/**
 * 関わり方のコツのカードの文（identify・praise・response・phrases）の振り分け（§2.14.3）。行に分け（前後の空白を除き、空の行は
 * 捨てる）、行の先頭の 1 文字で分ける。isPhrases は声かけ例のカードのとき真（「・」の行を吹き出しにする）。出す順（帯（×）→帯（○）→
 * 箇条書き・吹き出し→段落）は部品が守る
 */
export function splitHowTo(text: string, isPhrases: boolean): HowToParts {
  const ng: string[] = [];
  const ok: Array<{ readonly mark: string; readonly text: string }> = [];
  const bullets: string[] = [];
  const says: string[] = [];
  const paragraphs: string[] = [];
  for (const line of linesOf(text)) {
    const mark = line.charAt(0);
    const rest = line.slice(1);
    if (HOW_TO_NG_MARKS.includes(mark)) ng.push(rest);
    else if (HOW_TO_OK_MARKS.includes(mark)) ok.push(Object.freeze({ mark, text: rest }));
    else if (mark === HOW_TO_BULLET) (isPhrases ? says : bullets).push(rest);
    else paragraphs.push(line);
  }
  return Object.freeze({
    ng: Object.freeze(ng),
    ok: Object.freeze(ok),
    bullets: Object.freeze(bullets),
    says: Object.freeze(says),
    paragraphs: Object.freeze(paragraphs),
  });
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
