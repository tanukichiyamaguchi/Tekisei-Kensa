// M7-ai-48・49（11-6 §5.1 の PR-7.9・PR-7.10 の分。§2.17、11 総論 8.3 の配色の取り決め（14〜25））。components/admin/result/ai/ai-area.css
// （別表C の C.1〜C.5。C.6 は PR-7.11a）を読み、変数を解いて、§2.17 の K-49 の表の 1〜21 の規則（文字 4.5:1。共通の部品・採用向け・
// 育成・定着の 8 項目と表示）と、届いていて変えない組（マウス・押下を含む）、K-50 の表の 1・2（8 項目の選択欄の枠と、不正のときの選択欄の
// 焦点の枠。3:1）、焦点の枠（タブ・生成ボタン・8 項目の選択欄。管理画面に共通の焦点の枠と同じ値）と選んでいるタブの地（3:1。採用向けの
// 生成済みのパネルで下の端にかかるカードの影のすそとも比べる）、届いていて変えない部品（選択欄のフォーカスの枠・不正の枠・山形）を
// WCAG 2 の式で計算する。地がグラデーションのときは両端と途中の色（位置を 0.1% 刻み）で、重ねた色（見出し帯の半透明の札・影）と途中の
// 色は各成分を四捨五入（0.5 は切り上げ。Math.round）して 8 ビットにしてから計算し、いちばん低いところで確かめる（axe が判定しない
// グラデーションと半透明の地の上の文字、axe が見ないマウス・押下の色、axe が調べない部品の 3:1 をここで確かめる）。参照元の色のまま使う
// 用途（飾り・文字に添えた印・押せない状態）が置き換わっていないことと、選択欄の指定の並び（:focus-visible は :focus の後、:disabled は
// [aria-invalid="true"] の後）も確かめる。
// 写しの確かめ（ID なし）: 11-6 の別表C の C.1〜C.5 の CSS を読み、規則の並び・セレクタ・宣言の値と @keyframes が、ファイルと同じ
// （prettier の書き方の違い（空白・大文字小文字・小数の先頭の 0）はそろえて比べる）。
// 旧の AI 解説の領域の CSS の片付け（ID なし。11-6 §3.10・§4.3）: admin.css に .result-section・.badge・.small・.ai-analysis__actions・
// .ai-analysis__failed・.ai-analysis__verdict が無く、.spinner の指定がダウンロードのポップアップの作成中の表示（.ai-analysis__progress）の
// 下だけ（生成中の輪 svg.spinner に枠・角丸・回転が当たらない）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  contrastRatio,
  decl,
  findDecl,
  hexOf,
  normalizeCss,
  over,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  specificity,
  splitTopLevel,
  variablesOf,
  type CssRule,
  type Rgb,
} from "./css-rules";

const CSS_PATH = "components/admin/result/ai/ai-area.css";
const rules = parseCssRules(readCss(CSS_PATH));

/** 変数（#ai の --ai-2-strong に、生成中・採用向け・育成・定着の根の変数を重ねる） */
const ROOT_VARS = variablesOf(rules, "#ai");
const REC_VARS = new Map([...ROOT_VARS, ...variablesOf(rules, "#ai .ai-rec")]);
const IK_VARS = new Map([...ROOT_VARS, ...variablesOf(rules, "#ai .ai-ik")]);
const LOADING_VARS = new Map([...ROOT_VARS, ...variablesOf(rules, "#ai .ai-loading")]);

/** 宣言の値（var() を解く） */
const value = (
  selector: string,
  property: string,
  vars: ReadonlyMap<string, string> = ROOT_VARS,
): string => resolveVars(decl(rules, selector, property), vars);
const solid = (text: string): Rgb => {
  const c = parseColor(text);
  expect(c.alpha, text).toBe(1);
  return c.rgb;
};
const color = (
  selector: string,
  property: string,
  vars: ReadonlyMap<string, string> = ROOT_VARS,
): Rgb => solid(value(selector, property, vars));
const rec = (selector: string, property: string) => color(selector, property, REC_VARS);
const ik = (selector: string, property: string) => color(selector, property, IK_VARS);
const loading = (selector: string, property: string) => color(selector, property, LOADING_VARS);
const upper = (selector: string, property: string, vars?: ReadonlyMap<string, string>) =>
  value(selector, property, vars).toUpperCase();

const WHITE: Rgb = [255, 255, 255];
/** 管理画面に共通の焦点の枠（11-8 §2.2.6・別表A の 1。11 総論 8.3 の 19） */
const COMMON_RING = "2px solid #3f8da5";
const RING_COLOR = solid("#3F8DA5");

/** linear-gradient の 2 つの色（向きの指定は除く。位置の指定は無い形だけを読む） */
function gradientStops(text: string): readonly [Rgb, Rgb] {
  const m = /^linear-gradient\((.*)\)$/.exec(text.trim());
  if (!m?.[1]) throw new Error(`グラデーションでない: ${text}`);
  const args = splitTopLevel(m[1], ",").map((part) => part.trim());
  const colors = /deg$|^to /.test(args[0] ?? "") ? args.slice(1) : args;
  expect(colors, text).toHaveLength(2);
  return [solid(colors[0]!), solid(colors[1]!)];
}

/** グラデーションの両端と途中の色（位置を 0.1% 刻み。各成分を Math.round で 8 ビットに） */
function gradientColors([from, to]: readonly [Rgb, Rgb]): Rgb[] {
  return Array.from(
    { length: 1001 },
    (_, i) =>
      [0, 1, 2].map((k) =>
        Math.round(from[k]! + (to[k]! - from[k]!) * (i / 1000)),
      ) as unknown as Rgb,
  );
}

/** グラデーションの地のうち、front との比がいちばん低いところの比 */
const minRatioOver = (front: Rgb, stops: readonly [Rgb, Rgb]): number =>
  Math.min(...gradientColors(stops).map((c) => contrastRatio(front, c)));

function expectRatios(
  pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]>,
  minimum: number,
): void {
  for (const [label, front, back, expected] of pairs) {
    const r = contrastRatio(front, back);
    expect(round2(r), label).toBe(expected);
    expect(r, label).toBeGreaterThanOrEqual(minimum);
  }
}

/** 採用向けのカードの影のすそ（影の色を指定の不透明度のまま白に重ねた、いちばん濃い色。§2.17） */
function cardShadowSkirt(): Rgb {
  const shadow = value("#ai .ai-rec .card", "box-shadow");
  const m = /rgba\([^)]*\)/.exec(shadow);
  if (!m) throw new Error(`影の色が無い: ${shadow}`);
  return over(parseColor(m[0]), WHITE);
}

/** 規則の並び（ファイルの中の位置。@media・@container の外） */
const ruleIndex = (selector: string): number => {
  const index = rules.findIndex((r) => r.at === null && r.selectors.includes(selector));
  if (index < 0) throw new Error(`規則が無い: ${selector}`);
  return index;
};

describe("M7-ai-48 K-49 で変えた色の変数と規則の値（§2.17 の K-49 の表の 1・3・4・6〜16 のうち共通の部品と採用向けの分。変数と表の 1 は育成・定着の根と規則も）", () => {
  it("変数: #ai の --ai-2-strong #278379、採用向けと育成・定着の根の --muted #6A7684・--muted-2 #697888・--muted-chip #697482、生成中の根の --muted #6B7885", () => {
    expect(ROOT_VARS.get("--ai-2-strong")?.toUpperCase()).toBe("#278379");
    for (const root of ["#ai .ai-rec", "#ai .ai-ik"]) {
      const vars = variablesOf(rules, root);
      expect(vars.get("--muted")?.toUpperCase(), root).toBe("#6A7684");
      expect(vars.get("--muted-2")?.toUpperCase(), root).toBe("#697888");
      expect(vars.get("--muted-chip")?.toUpperCase(), root).toBe("#697482");
    }
    expect(variablesOf(rules, "#ai .ai-loading").get("--muted")?.toUpperCase()).toBe("#6B7885");
  });

  it("表の 1: 選んでいるタブ・生成ボタン（90deg）、採用向けと育成・定着の見出し帯（102deg）、質問と 1on1 の番号（上から下）のグラデーションは #4B6FB5 → var(--ai-2-strong)", () => {
    expect(decl(rules, "#ai .ai-tab", "background")).toBe(
      "linear-gradient(90deg, #4b6fb5, var(--ai-2-strong))",
    );
    expect(decl(rules, "#ai .ai-gen-btn", "background")).toBe(
      "linear-gradient(90deg, #4b6fb5, var(--ai-2-strong))",
    );
    for (const head of ["#ai .ai-rec .ai-head", "#ai .ai-ik .head"]) {
      expect(decl(rules, head, "background"), head).toBe(
        "linear-gradient(102deg, var(--ai-1), var(--ai-2-strong))",
      );
    }
    for (const qn of ["#ai .ai-rec .qn", "#ai .ai-ik .qn"]) {
      expect(decl(rules, qn, "background"), qn).toBe(
        "linear-gradient(var(--ai-1), var(--ai-2-strong))",
      );
    }
    expect(REC_VARS.get("--ai-1")?.toUpperCase()).toBe("#4B6FB5");
    expect(IK_VARS.get("--ai-1")?.toUpperCase()).toBe("#4B6FB5");
  });

  it("表の 3・4・6〜16 の規則の色", () => {
    expect(upper('#ai .ai-tab[aria-selected="false"]', "color")).toBe("#6B7885");
    expect(upper("#ai .ai-intro .fi-d", "color")).toBe("#6B7885");
    expect(decl(rules, "#ai .ai-loading .sub", "color")).toBe("var(--muted)");
    expect(upper("#ai .ai-fail", "color")).toBe("#B15936");
    expect(upper("#ai .ai-rec .mini.caution h4", "color")).toBe("#B15936");
    expect(decl(rules, "#ai .ai-rec .vchip .vk", "color")).toBe("var(--muted-chip)");
    expect(upper("#ai .ai-rec .vchip.good .vv", "color")).toBe("#27835E");
    expect(upper("#ai .ai-rec .vchip.warn .vv", "color")).toBe("#9B6927");
    expect(upper("#ai .ai-rec .vchip.bad .vv", "color")).toBe("#C64B44");
    expect(upper("#ai .ai-rec .mini.strength h4", "color")).toBe("#26815D");
    expect(decl(rules, "#ai .ai-rec .qintent", "color")).toBe("var(--muted)");
    expect(upper("#ai .ai-rec .qintent .e", "color")).toBe("#268177");
    expect(upper("#ai .ai-rec .ahead", "color")).toBe("#247A70");
    expect(upper("#ai .ai-rec .ra-head", "color")).toBe("#97662E");
    expect(upper("#ai .ai-rec .ra-k", "color")).toBe("#875A25");
    expect(decl(rules, "#ai .ai-rec .ai-foot", "color")).toBe("var(--muted-2)");
  });
});

describe("M7-ai-48 K-49 の表の組の比（4.5:1 以上。§2.17 の表の値。表の 1 は育成・定着の見出し帯と 1on1 の番号も、3・4・6〜16 は共通の部品と採用向け）", () => {
  it("表の 1: 白い文字と、選んでいるタブ・生成ボタン・見出し帯・質問と 1on1 の番号のグラデーションの地（両端と途中。いちばん低いのは終わりの近くの 4.54）", () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyMap<string, string>]> = [
      ["#ai .ai-tab", ROOT_VARS],
      ["#ai .ai-gen-btn", ROOT_VARS],
      ["#ai .ai-rec .ai-head", REC_VARS],
      ["#ai .ai-rec .qn", REC_VARS],
      ["#ai .ai-ik .head", IK_VARS],
      ["#ai .ai-ik .qn", IK_VARS],
    ];
    for (const [selector, vars] of cases) {
      expect(color(selector, "color", vars), selector).toEqual(WHITE);
      const stops = gradientStops(value(selector, "background", vars));
      const lowest = minRatioOver(WHITE, stops);
      expect(round2(lowest), selector).toBe(4.54);
      expect(lowest, selector).toBeGreaterThanOrEqual(4.5);
      // 両端（始め 4.95・終わり 4.56）
      expect(round2(contrastRatio(WHITE, stops[0])), selector).toBe(4.95);
      expect(round2(contrastRatio(WHITE, stops[1])), selector).toBe(4.56);
    }
  });

  it("表の 3・4・6〜16（文字／地）", () => {
    const card = rec("#ai .ai-rec .card", "background");
    expect(card).toEqual(WHITE);
    const chip = rec("#ai .ai-rec .vchip", "background");
    const q = rec("#ai .ai-rec .q", "background");
    expectRatios(
      [
        [
          "3 選んでいないタブ／白",
          color('#ai .ai-tab[aria-selected="false"]', "color"),
          color('#ai .ai-tab[aria-selected="false"]', "background"),
          4.52,
        ],
        [
          "3 案内の特徴の説明／案内の白",
          color("#ai .ai-intro .fi-d", "color"),
          color("#ai .ai-intro", "background"),
          4.52,
        ],
        ["3 生成中の説明／白", loading("#ai .ai-loading .sub", "color"), WHITE, 4.52],
        ["4 失敗の枠", color("#ai .ai-fail", "color"), color("#ai .ai-fail", "background"), 4.51],
        [
          "4 注意点の箱の見出し",
          rec("#ai .ai-rec .mini.caution h4", "color"),
          rec("#ai .ai-rec .mini.caution", "background"),
          4.51,
        ],
        ["6 判定チップのラベル", rec("#ai .ai-rec .vchip .vk", "color"), chip, 4.59],
        ["7 判定チップの値 good", rec("#ai .ai-rec .vchip.good .vv", "color"), chip, 4.51],
        ["8 判定チップの値 warn", rec("#ai .ai-rec .vchip.warn .vv", "color"), chip, 4.56],
        ["9 判定チップの値 bad", rec("#ai .ai-rec .vchip.bad .vv", "color"), chip, 4.52],
        [
          "10 強みの箱の見出し",
          rec("#ai .ai-rec .mini.strength h4", "color"),
          rec("#ai .ai-rec .mini.strength", "background"),
          4.53,
        ],
        ["11 質問の intent", rec("#ai .ai-rec .qintent", "color"), q, 4.51],
        ["12 「見極め：」", rec("#ai .ai-rec .qintent .e", "color"), q, 4.56],
        [
          "13 接し方の札",
          rec("#ai .ai-rec .ahead", "color"),
          rec("#ai .ai-rec .ahead", "background"),
          4.51,
        ],
        [
          "14 辞めそうなサインの見出し",
          rec("#ai .ai-rec .ra-head", "color"),
          rec("#ai .ai-rec .retain-alert", "background"),
          4.57,
        ],
        [
          "15 「サイン」「一手」の札",
          rec("#ai .ai-rec .ra-k", "color"),
          rec("#ai .ai-rec .ra-k", "background"),
          4.61,
        ],
        ["16 末尾／カードの白", rec("#ai .ai-rec .ai-foot", "color"), card, 4.52],
      ],
      4.5,
    );
  });
});

describe("M7-ai-48 育成・定着の 8 項目と表示の K-49 の組（§2.17 の K-49 の表の 2・4〜8・10・11・13・15〜21 の育成・定着の分。4.5:1 以上）", () => {
  it("規則の色: 未選択の表示 #657486（opacity 1 も）、チップのラベル var(--muted-chip)・値 good #27835E・warn #9B6927、箱の見出し #26815D・#B15936、1on1 の intent var(--muted)、接し方の札 #247A70、一手の札 #875A25、末尾 var(--muted-2)、原因の札 #AE483C・#93642C・#53708E、ステップの札 #277651・#297C55", () => {
    expect(upper("#ai .ai-ctx select.is-placeholder", "color")).toBe("#657486");
    expect(decl(rules, "#ai .ai-ctx select.is-placeholder", "opacity")).toBe("1");
    expect(decl(rules, "#ai .ai-ik .chip .k", "color")).toBe("var(--muted-chip)");
    expect(upper("#ai .ai-ik .good .v", "color")).toBe("#27835E");
    expect(upper("#ai .ai-ik .warn .v", "color")).toBe("#9B6927");
    expect(upper("#ai .ai-ik .mini.a h4", "color")).toBe("#26815D");
    expect(upper("#ai .ai-ik .mini.b h4", "color")).toBe("#B15936");
    expect(decl(rules, "#ai .ai-ik .qi", "color")).toBe("var(--muted)");
    expect(upper("#ai .ai-ik .fh", "color")).toBe("#247A70");
    expect(upper("#ai .ai-ik .gk", "color")).toBe("#875A25");
    expect(decl(rules, "#ai .ai-ik .foot", "color")).toBe("var(--muted-2)");
    expect(upper("#ai .ai-ik .hk.hi", "color")).toBe("#AE483C");
    expect(upper("#ai .ai-ik .hk.mi", "color")).toBe("#93642C");
    expect(upper("#ai .ai-ik .hk.lo", "color")).toBe("#53708E");
    expect(upper("#ai .ai-ik .sn", "color")).toBe("#277651");
    expect(upper("#ai .ai-ik .tgt", "color")).toBe("#297C55");
  });

  it("表の 2: 見出し帯の札の地 rgba(126,126,126,.2) を帯（102deg #4B6FB5 → #278379）の両端と途中に重ねた色の上の白い文字（始め #5572AA 4.80・終わり #38827A 4.52、いちばん低いところ 4.51）", () => {
    const tag = parseColor(value("#ai .ai-ik .head .tag", "background", IK_VARS));
    expect([tag.rgb, tag.alpha]).toEqual([[126, 126, 126], 0.2]);
    // 札の文字は帯の白を受け継ぐ（札に文字の色の指定は無い）
    expect(findDecl(rules, "#ai .ai-ik .head .tag", "color")).toBeUndefined();
    expect(ik("#ai .ai-ik .head", "color")).toEqual(WHITE);
    const band = gradientColors(gradientStops(value("#ai .ai-ik .head", "background", IK_VARS)));
    const onBand = band.map((c) => over(tag, c));
    expect(hexOf(onBand[0]!)).toBe("#5572AA");
    expect(hexOf(onBand[onBand.length - 1]!)).toBe("#38827A");
    expect(round2(contrastRatio(WHITE, onBand[0]!))).toBe(4.8);
    expect(round2(contrastRatio(WHITE, onBand[onBand.length - 1]!))).toBe(4.52);
    const lowest = Math.min(...onBand.map((c) => contrastRatio(WHITE, c)));
    expect(round2(lowest)).toBe(4.51);
    expect(lowest).toBeGreaterThanOrEqual(4.5);
  });

  it("表の 4〜8・10・11・13・15〜21（文字／地）", () => {
    const chip = ik("#ai .ai-ik .chip", "background");
    const card = ik("#ai .ai-ik .card", "background");
    expect(card).toEqual(WHITE);
    expectRatios(
      [
        [
          "4 「△ 欠けている」",
          ik("#ai .ai-ik .mini.b h4", "color"),
          ik("#ai .ai-ik .mini.b", "background"),
          4.51,
        ],
        [
          "5 未選択の表示／選択欄の地",
          color("#ai .ai-ctx select.is-placeholder", "color"),
          color("#ai .ai-ctx select", "background"),
          4.53,
        ],
        ["6 判定チップのラベル", ik("#ai .ai-ik .chip .k", "color"), chip, 4.59],
        ["7 判定チップの値 good", ik("#ai .ai-ik .good .v", "color"), chip, 4.51],
        ["8 判定チップの値 warn", ik("#ai .ai-ik .warn .v", "color"), chip, 4.56],
        [
          "10 「◎ 足りている」",
          ik("#ai .ai-ik .mini.a h4", "color"),
          ik("#ai .ai-ik .mini.a", "background"),
          4.53,
        ],
        [
          "11 1on1 の intent",
          ik("#ai .ai-ik .qi", "color"),
          ik("#ai .ai-ik .q", "background"),
          4.51,
        ],
        [
          "13 日常の接し方の札",
          ik("#ai .ai-ik .fh", "color"),
          ik("#ai .ai-ik .fh", "background"),
          4.51,
        ],
        ["15 一手の札", ik("#ai .ai-ik .gk", "color"), ik("#ai .ai-ik .gk", "background"), 4.61],
        ["16 末尾／カードの白", ik("#ai .ai-ik .foot", "color"), card, 4.52],
        [
          "17 原因の札「可能性 高」",
          ik("#ai .ai-ik .hk.hi", "color"),
          ik("#ai .ai-ik .hk.hi", "background"),
          4.52,
        ],
        [
          "18 原因の札「可能性 中」",
          ik("#ai .ai-ik .hk.mi", "color"),
          ik("#ai .ai-ik .hk.mi", "background"),
          4.58,
        ],
        [
          "19 原因の札（それ以外）",
          ik("#ai .ai-ik .hk.lo", "color"),
          ik("#ai .ai-ik .hk.lo", "background"),
          4.55,
        ],
        [
          "20 ステップの札 badge",
          ik("#ai .ai-ik .sn", "color"),
          ik("#ai .ai-ik .sn", "background"),
          4.61,
        ],
        [
          "21 ステップの札 target",
          ik("#ai .ai-ik .tgt", "color"),
          ik("#ai .ai-ik .tgt", "background"),
          4.55,
        ],
      ],
      4.5,
    );
  });

  it("届いていて変えない組: 判定チップの値 mid #4B6FB5（4.78）、青の枠 note #3E6E93 と #F0F5FA（4.96）、8 項目のラベル #6B7785 と箱の白（4.56）", () => {
    expect(decl(rules, "#ai .ai-ik .mid .v", "color")).toBe("var(--ai-1)");
    expect(upper("#ai .ai-ik .chk", "color")).toBe("#3E6E93");
    expect(upper("#ai .ai-ctx-label", "color")).toBe("#6B7785");
    expectRatios(
      [
        [
          "判定チップの値 mid",
          ik("#ai .ai-ik .mid .v", "color"),
          ik("#ai .ai-ik .chip", "background"),
          4.78,
        ],
        ["青の枠 note", ik("#ai .ai-ik .chk", "color"), ik("#ai .ai-ik .chk", "background"), 4.96],
        [
          "8 項目のラベル／箱の白",
          color("#ai .ai-ctx-label", "color"),
          color("#ai .ai-ctx", "background"),
          4.56,
        ],
      ],
      4.5,
    );
  });

  it("C.1 の 8 項目と C.5 のほかの文字と地の組（見出し・選んだ値・節の見出し・理由・原因・一手・箱の項目・ステップ・引用・前提・接し方・1on1）", () => {
    const card = ik("#ai .ai-ik .card", "background");
    const scene = ik("#ai .ai-ik .scene", "background");
    const pairs: ReadonlyArray<readonly [string, Rgb, Rgb]> = [
      ["8 項目の見出し", color("#ai .ai-ctx-h", "color"), color("#ai .ai-ctx", "background")],
      ["選んだ値", color("#ai .ai-ctx select", "color"), color("#ai .ai-ctx select", "background")],
      ["育成・定着の文字", ik("#ai .ai-ik", "color"), card],
      ["節の見出し", ik("#ai .ai-ik .lab", "color"), card],
      ["理由の枠", ik("#ai .ai-ik .why", "color"), ik("#ai .ai-ik .why", "background")],
      ["理由の枠の太字", ik("#ai .ai-ik .why b", "color"), ik("#ai .ai-ik .why", "background")],
      ["原因の見出し", ik("#ai .ai-ik .hyp-h", "color"), ik("#ai .ai-ik .hyp", "background")],
      ["原因の本文", ik("#ai .ai-ik .hv", "color"), ik("#ai .ai-ik .hyp", "background")],
      ["一手の本文", ik("#ai .ai-ik .gv", "color"), ik("#ai .ai-ik .gap", "background")],
      [
        "足りている項目",
        ik("#ai .ai-ik .ilist li", "color"),
        ik("#ai .ai-ik .mini.a", "background"),
      ],
      [
        "欠けている項目",
        ik("#ai .ai-ik .ilist li", "color"),
        ik("#ai .ai-ik .mini.b", "background"),
      ],
      ["ステップの見出し", ik("#ai .ai-ik .fill-h", "color"), card],
      ["ステップの 1 行目", ik("#ai .ai-ik .scene-t", "color"), scene],
      ["ステップの本文", ik("#ai .ai-ik .scene-b", "color"), scene],
      ["緑の引用", ik("#ai .ai-ik .say", "color"), ik("#ai .ai-ik .say", "background")],
      ["青の枠の太字", ik("#ai .ai-ik .chk b", "color"), ik("#ai .ai-ik .chk", "background")],
      ["前提の確認", ik("#ai .ai-ik .cond", "color"), ik("#ai .ai-ik .cond", "background")],
      ["前提の確認の太字", ik("#ai .ai-ik .cond b", "color"), ik("#ai .ai-ik .cond", "background")],
      ["接し方の本文", ik("#ai .ai-ik .ft", "color"), card],
      ["1on1 の質問", ik("#ai .ai-ik .qt", "color"), ik("#ai .ai-ik .q", "background")],
    ];
    for (const [label, front, back] of pairs) {
      expect(contrastRatio(front, back), label).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("M7-ai-48 届いていて変えない組（§2.17。マウス・押下を含む。4.5:1 以上）", () => {
  it("選んでいないタブのマウスのとき（文字 #4B6FB5・地 #F5F8FB）、生成ボタンのマウスのとき・押している間（白い文字と #347E78・#2C6E69）", () => {
    const hover = '#ai .ai-tab[aria-selected="false"]:hover';
    expect(upper(hover, "color")).toBe("#4B6FB5");
    expect(upper(hover, "background")).toBe("#F5F8FB");
    expect(upper("#ai .ai-gen-btn:hover", "background")).toBe("#347E78");
    expect(upper("#ai .ai-gen-btn:active", "background")).toBe("#2C6E69");
    expectRatios(
      [
        ["選んでいないタブのマウスのとき", color(hover, "color"), color(hover, "background"), 4.65],
        ["生成ボタンのマウスのとき", WHITE, color("#ai .ai-gen-btn:hover", "background"), 4.77],
        ["生成ボタンを押している間", WHITE, color("#ai .ai-gen-btn:active", "background"), 5.93],
      ],
      4.5,
    );
  });

  it("「この AI 解説は準備中です。」と案内の副題 #6B7785 と白（4.56）、判定チップの値 mid #4B6FB5 と #FAFBFD（4.78）", () => {
    expect(upper("#ai .ai-note", "color")).toBe("#6B7785");
    expect(upper("#ai .ai-intro .ih-s", "color")).toBe("#6B7785");
    expect(decl(rules, "#ai .ai-rec .vchip.mid .vv", "color")).toBe("var(--ai-1)");
    expectRatios(
      [
        ["準備中の注記／白", color("#ai .ai-note", "color"), WHITE, 4.56],
        ["案内の副題／案内の白", color("#ai .ai-intro .ih-s", "color"), WHITE, 4.56],
        [
          "判定チップの値 mid",
          rec("#ai .ai-rec .vchip.mid .vv", "color"),
          rec("#ai .ai-rec .vchip", "background"),
          4.78,
        ],
      ],
      4.5,
    );
  });

  it("C.2〜C.4 のほかの文字と地の組（案内・枠・警告・注意書き・要約・箇条書き・質問・接し方・サインの本文・生成中の見出し・節の見出し）", () => {
    const intro = color("#ai .ai-intro", "background");
    const card = rec("#ai .ai-rec .card", "background");
    const pairs: ReadonlyArray<readonly [string, Rgb, Rgb]> = [
      ["案内の文字", color("#ai .ai-intro", "color"), intro],
      ["案内の見出し", color("#ai .ai-intro .ih-t", "color"), intro],
      ["特徴の太字", color("#ai .ai-intro .fi-t", "color"), intro],
      [
        "枠の文字",
        color("#ai .ai-intro .need", "color"),
        color("#ai .ai-intro .need", "background"),
      ],
      [
        "枠の太字",
        color("#ai .ai-intro .need b", "color"),
        color("#ai .ai-intro .need", "background"),
      ],
      [
        "警告の文字",
        color("#ai .ai-intro .warn", "color"),
        color("#ai .ai-intro .warn", "background"),
      ],
      [
        "警告の太字",
        color("#ai .ai-intro .warn b", "color"),
        color("#ai .ai-intro .warn", "background"),
      ],
      [
        "注意書き",
        rec("#ai .ai-rec .ai-caution", "color"),
        rec("#ai .ai-rec .ai-caution", "background"),
      ],
      ["採用向けの文字", rec("#ai .ai-rec", "color"), card],
      ["節の見出し", rec("#ai .ai-rec .ai-label", "color"), card],
      ["要約の本文", rec("#ai .ai-rec .ai-p", "color"), card],
      [
        "強みの箇条書き",
        rec("#ai .ai-rec .ilist li", "color"),
        rec("#ai .ai-rec .mini.strength", "background"),
      ],
      [
        "注意点の箇条書き",
        rec("#ai .ai-rec .ilist li", "color"),
        rec("#ai .ai-rec .mini.caution", "background"),
      ],
      ["質問", rec("#ai .ai-rec .qtext", "color"), rec("#ai .ai-rec .q", "background")],
      ["接し方の本文", rec("#ai .ai-rec .atext", "color"), card],
      [
        "サイン・一手の本文",
        rec("#ai .ai-rec .ra-v", "color"),
        rec("#ai .ai-rec .retain-alert", "background"),
      ],
      ["生成中の見出し", loading("#ai .ai-loading .ttl", "color"), WHITE],
    ];
    for (const [label, front, back] of pairs) {
      expect(contrastRatio(front, back), label).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("M7-ai-48 参照元の色のまま使う用途（飾り・文字に添えた印・押せない状態。§2.17）", () => {
  it("案内の「✦」の四角 102deg #4B6FB5 → #2E9B8F と特徴のアイコン（#4B6FB5・稲妻 #E8A93A・芽 #2E9B6F）、警告の「！」の丸 #E8A93A", () => {
    expect(decl(rules, "#ai .ai-intro .ih-sp", "background")).toBe(
      "linear-gradient(102deg, #4b6fb5, #2e9b8f)",
    );
    expect(upper("#ai .ai-intro .fi .ai-ico", "color")).toBe("#4B6FB5");
    expect(upper("#ai .ai-intro .fi .ai-ico--zap", "color")).toBe("#E8A93A");
    expect(upper("#ai .ai-intro .fi .ai-ico--sprout", "color")).toBe("#2E9B6F");
    expect(upper("#ai .ai-intro .warn-i", "background")).toBe("#E8A93A");
  });

  it("採用向けの --ai-2 #2E9B8F と節の見出しの棒（上 var(--ai-1) → 下 var(--ai-2)）、判定チップの点 #2E9B6F・#CC8A33・var(--ai-1)・#C9544E", () => {
    expect(variablesOf(rules, "#ai .ai-rec").get("--ai-2")?.toUpperCase()).toBe("#2E9B8F");
    expect(decl(rules, "#ai .ai-rec .ai-label .bar", "background")).toBe(
      "linear-gradient(var(--ai-1), var(--ai-2))",
    );
    expect(upper("#ai .ai-rec .good .vdot", "background")).toBe("#2E9B6F");
    expect(upper("#ai .ai-rec .warn .vdot", "background")).toBe("#CC8A33");
    expect(decl(rules, "#ai .ai-rec .mid .vdot", "background")).toBe("var(--ai-1)");
    expect(upper("#ai .ai-rec .bad .vdot", "background")).toBe("#C9544E");
  });

  it("生成中の --ai-2 #2E9B8F と弧・点、「✦」の var(--ai-1) #4B6FB5、下地の円 #E4ECEA", () => {
    const vars = variablesOf(rules, "#ai .ai-loading");
    expect(vars.get("--ai-2")?.toUpperCase()).toBe("#2E9B8F");
    expect(vars.get("--ai-1")?.toUpperCase()).toBe("#4B6FB5");
    expect(decl(rules, "#ai .ai-loading .arc", "stroke")).toBe("var(--ai-2)");
    expect(decl(rules, "#ai .ai-loading .dots span", "background")).toBe("var(--ai-2)");
    expect(decl(rules, "#ai .ai-loading .spark", "color")).toBe("var(--ai-1)");
    expect(upper("#ai .ai-loading .track", "stroke")).toBe("#E4ECEA");
  });

  it("押せない生成ボタンの地 #C5CFD9（押せない状態の表示は対象外）", () => {
    expect(upper("#ai .ai-gen-btn:disabled", "background")).toBe("#C5CFD9");
  });

  it("育成・定着の --ai-2 #2E9B8F と節の見出しの棒、判定チップの点 #2E9B6F・#CC8A33・var(--ai-1)、箇条書きの丸 #7FB95E・#E0A04A、引用と青の枠の左の線 #7FB95E・#7FA8CC", () => {
    expect(variablesOf(rules, "#ai .ai-ik").get("--ai-2")?.toUpperCase()).toBe("#2E9B8F");
    expect(decl(rules, "#ai .ai-ik .lab .bar", "background")).toBe(
      "linear-gradient(var(--ai-1), var(--ai-2))",
    );
    expect(upper("#ai .ai-ik .good .dot", "background")).toBe("#2E9B6F");
    expect(upper("#ai .ai-ik .warn .dot", "background")).toBe("#CC8A33");
    expect(decl(rules, "#ai .ai-ik .mid .dot", "background")).toBe("var(--ai-1)");
    expect(upper("#ai .ai-ik .mini.a .ilist li::before", "background")).toBe("#7FB95E");
    expect(upper("#ai .ai-ik .mini.b .ilist li::before", "background")).toBe("#E0A04A");
    expect(decl(rules, "#ai .ai-ik .say", "border-left")).toBe("3px solid #7fb95e");
    expect(decl(rules, "#ai .ai-ik .chk", "border-left")).toBe("3px solid #7fa8cc");
  });

  it("8 項目の入力欄の箱の枠 #DDE4EC と見出しの左の線 #4B6FB5（飾り）", () => {
    expect(decl(rules, "#ai .ai-ctx", "border")).toBe("1px solid #dde4ec");
    expect(decl(rules, "#ai .ai-ctx-h", "border-left")).toBe("5px solid #4b6fb5");
  });
});

describe("M7-ai-49 焦点の枠と選んでいるタブの地（K-50。§2.17。共通の部品の分）", () => {
  it("タブ・生成ボタン・8 項目の選択欄の :focus-visible は管理画面に共通の焦点の枠と同じ値（2px solid #3F8DA5・outline-offset 2px）", () => {
    const admin = parseCssRules(readCss("app/(admin)/admin.css"));
    const common = ":where(.admin-root, .adm-focus-scope) :focus-visible";
    expect(decl(admin, common, "outline")).toBe(COMMON_RING);
    expect(decl(admin, common, "outline-offset")).toBe("2px");
    for (const selector of [
      "#ai .ai-tab:focus-visible",
      "#ai .ai-gen-btn:focus-visible",
      "#ai .ai-ctx select:focus-visible",
    ]) {
      expect(decl(rules, selector, "outline"), selector).toBe(COMMON_RING);
      expect(decl(rules, selector, "outline-offset"), selector).toBe("2px");
    }
  });

  it("共通の枠 #3F8DA5 と白（3.77）・カードの影のすそ（rgba(43,90,120,.10) を白に重ねた #EAEFF2。3.26）が 3:1 以上", () => {
    const skirt = cardShadowSkirt();
    expect(skirt).toEqual(solid("#EAEFF2"));
    expectRatios(
      [
        ["共通の枠／白", RING_COLOR, WHITE, 3.77],
        ["共通の枠／カードの影のすそ", RING_COLOR, skirt, 3.26],
      ],
      3,
    );
  });

  it("選んでいるタブの地（両端と途中）が、まわりの白と 3:1 以上（いちばん低いところ 4.54）、カードの影のすそ #EAEFF2 と 3:1 以上（3.92）", () => {
    const stops = gradientStops(value("#ai .ai-tab", "background"));
    const colors = gradientColors(stops);
    const lowest = (back: Rgb) => Math.min(...colors.map((c) => contrastRatio(c, back)));
    expect(round2(lowest(WHITE))).toBe(4.54);
    expect(lowest(WHITE)).toBeGreaterThanOrEqual(3);
    const skirt = cardShadowSkirt();
    expect(round2(lowest(skirt))).toBe(3.92);
    expect(lowest(skirt)).toBeGreaterThanOrEqual(3);
  });
});

describe("M7-ai-49 8 項目の選択欄（K-50。§2.17 の K-50 の表の 1・2 と、届いていて変えない部品。3:1 以上）", () => {
  const box = () => color("#ai .ai-ctx", "background");
  const field = () => color("#ai .ai-ctx select", "background");
  /** 不正のときの影の色（ずれ 0・ぼかし 6px の影の色を、指定の不透明度のまま箱の白に重ねた、いちばん濃い色） */
  const invalidShadow = (): Rgb => {
    const shadow = value('#ai .ai-ctx select[aria-invalid="true"]', "box-shadow");
    const m = /^0 0 6px (#[0-9a-f]{6})$/.exec(shadow);
    if (!m?.[1]) throw new Error(`影の形が違う: ${shadow}`);
    return over(parseColor(m[1]), box());
  };

  it("表の 1: 選択欄の枠 #7893B3 が、中の選択欄の地 #F7F9FC（3.01）と外の入力欄の箱の白（3.17）の両方と 3:1 以上", () => {
    const border = decl(rules, "#ai .ai-ctx select", "border");
    expect(border).toBe("1px solid #7893b3");
    expect(box()).toEqual(WHITE);
    expect(hexOf(field())).toBe("#F7F9FC");
    const frame = solid(border.split(" ").at(-1) ?? "");
    expectRatios(
      [
        ["枠／中の選択欄の地", frame, field(), 3.01],
        ["枠／外の箱の白", frame, box(), 3.17],
      ],
      3,
    );
  });

  it("表の 2: 不正のときの焦点の枠 #1A3943 が、影の色 #FF0000（箱の白に重ねた色。3.07）と影の外の白（12.28）と 3:1 以上（共通の枠 #3F8DA5 は影と 1.06 で届かない）", () => {
    const invalidFocus = '#ai .ai-ctx select[aria-invalid="true"]:focus-visible';
    expect(upper(invalidFocus, "outline-color")).toBe("#1A3943");
    const shadow = invalidShadow();
    expect(hexOf(shadow)).toBe("#FF0000");
    expectRatios(
      [
        ["不正の焦点の枠／影", color(invalidFocus, "outline-color"), shadow, 3.07],
        ["不正の焦点の枠／影の外の白", color(invalidFocus, "outline-color"), box(), 12.28],
      ],
      3,
    );
    expect(round2(contrastRatio(RING_COLOR, shadow))).toBe(1.06);
    expect(contrastRatio(RING_COLOR, shadow)).toBeLessThan(3);
  });

  it("届いていて変えない部品: 共通の枠 #3F8DA5 と箱の白（3.77）、フォーカスの枠 #4B6FB5（中 4.70・外 4.95）、不正の枠 #FF0000（中 3.79・外 4.00）、山形 #6B7785 と選択欄の地（4.33）", () => {
    expect(upper("#ai .ai-ctx select:focus", "border-color")).toBe("#4B6FB5");
    expect(upper('#ai .ai-ctx select[aria-invalid="true"]', "border-color")).toBe("#FF0000");
    expect(upper("#ai .ai-ctx .ai-chev", "color")).toBe("#6B7785");
    const focusFrame = color("#ai .ai-ctx select:focus", "border-color");
    const invalidFrame = color('#ai .ai-ctx select[aria-invalid="true"]', "border-color");
    expectRatios(
      [
        ["共通の枠／箱の白", RING_COLOR, box(), 3.77],
        ["フォーカスの枠／中の地", focusFrame, field(), 4.7],
        ["フォーカスの枠／外の白", focusFrame, box(), 4.95],
        ["不正の枠／中の地", invalidFrame, field(), 3.79],
        ["不正の枠／外の白", invalidFrame, box(), 4],
        ["山形／選択欄の地", color("#ai .ai-ctx .ai-chev", "color"), field(), 4.33],
      ],
      3,
    );
  });

  it("選べない状態（:disabled）の枠は参照元の #DDE4EC（押せない状態の表示は K-50 の対象外）。不透明度 1", () => {
    expect(upper("#ai .ai-ctx select:disabled", "border-color")).toBe("#DDE4EC");
    expect(decl(rules, "#ai .ai-ctx select:disabled", "opacity")).toBe("1");
  });

  it("指定の並び: :focus（枠 #4B6FB5・outline none）の後に :focus-visible、[aria-invalid] の後に :disabled（どちらも詳細度が同じで、後に書いた方が勝つ）。不正の :focus-visible は線の色だけを #1A3943 にする", () => {
    const focus = "#ai .ai-ctx select:focus";
    const focusVisible = "#ai .ai-ctx select:focus-visible";
    const invalid = '#ai .ai-ctx select[aria-invalid="true"]';
    const invalidFocus = '#ai .ai-ctx select[aria-invalid="true"]:focus-visible';
    const disabled = "#ai .ai-ctx select:disabled";
    expect(decl(rules, focus, "outline")).toBe("none");
    expect(compareSpecificity(specificity(focus), specificity(focusVisible))).toBe(0);
    expect(ruleIndex(focusVisible)).toBeGreaterThan(ruleIndex(focus));
    expect(compareSpecificity(specificity(invalid), specificity(disabled))).toBe(0);
    expect(ruleIndex(disabled)).toBeGreaterThan(ruleIndex(invalid));
    // 不正の焦点の枠は、共通の枠（線の幅・形・離し方）のうち色だけを変える
    expect([...rules[ruleIndex(invalidFocus)]!.declarations.keys()]).toEqual(["outline-color"]);
    expect(
      compareSpecificity(specificity(invalidFocus), specificity(focusVisible)),
    ).toBeGreaterThan(0);
  });
});

// ---- 写しの確かめ（11-6 別表C）

const SPEC = readFileSync(
  fileURLToPath(new URL("../../../docs/基本設計/11_参照元の更新/11-6_AI解説.md", import.meta.url)),
  "utf8",
);

/** start の位置から end の手前までの節の最初の css のコードの塊（コメントを除く） */
function specCss(start: string, end: string): string {
  const from = SPEC.indexOf(start);
  const to = SPEC.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  const block = /```css\n([\s\S]*?)```/.exec(SPEC.slice(from, to))?.[1];
  if (block === undefined) throw new Error(`css の塊が無い: ${start}`);
  return block.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** C.1〜C.5（C.6 は PR-7.11a で足す） */
const SPEC_TEXT = [
  specCss("### C.1 ", "### C.2 "),
  specCss("### C.2 ", "### C.3 "),
  specCss("### C.3 ", "### C.4 "),
  specCss("### C.4 ", "### C.5 "),
  specCss("### C.5 ", "### C.6 "),
].join("\n");

/** 値の書き方をそろえる（大文字小文字、カンマとかっこのまわりの空白、小数の先頭の 0 と末尾の 0） */
const normalizeValue = (text: string): string =>
  normalizeCss(text)
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/(^|[^\w.#-])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/(\d\.\d*?[1-9])0+(?!\d)/g, "$1")
    .replace(/(\d)\.0+(?!\d)/g, "$1");

/** 規則を比べられる形に（@media の条件は空白を除く） */
const comparable = (rule: CssRule) => ({
  at: rule.at === null ? null : rule.at.replace(/\s+/g, "").toLowerCase(),
  selectors: rule.selectors,
  declarations: [...rule.declarations].map(([name, v]) => [name, normalizeValue(v)]),
});

/** @keyframes の名前と中身（空白を除き、値をそろえる） */
function keyframesOf(text: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let end = open;
    while (end < text.length && depth > 0) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") depth -= 1;
      end += 1;
    }
    const body = normalizeValue(text.slice(open, end - 1))
      .replace(/\s+/g, "")
      .replace(/;}/g, "}");
    map.set(m[1]!, body);
  }
  return map;
}

describe("（ID なし）別表C の写し（C.1〜C.5。C.6 は PR-7.11a）", () => {
  const specRules = parseCssRules(SPEC_TEXT);
  /** C.1 の 8 項目の入力欄の規則（.ai-ctx で始まる規則と、その @media）と、C.5（育成・定着の表示）の規則の数（別表C から数える） */
  const specContext = specRules.filter((r) => r.selectors.some((s) => s.includes(".ai-ctx")));
  const specTraining = parseCssRules(specCss("### C.5 ", "### C.6 "));

  it(`別表C の C.1〜C.5 の ${specRules.length} の規則（C.1 の 8 項目の入力欄 ${specContext.length}・C.5 の ${specTraining.length} を含む。@keyframes は次の確かめ）が、並び・セレクタ・宣言の値ともファイルと同じ`, () => {
    // 8 項目の規則と C.5 の規則も入っている（別表C の該当の規則が読めていて、空でない）
    expect(specContext.length).toBeGreaterThan(0);
    expect(specContext.every((r) => r.selectors.every((s) => s.includes(".ai-ctx")))).toBe(true);
    expect(specTraining.length).toBeGreaterThan(0);
    expect(specTraining.every((r) => r.selectors.every((s) => s.startsWith("#ai .ai-ik")))).toBe(
      true,
    );
    expect(rules.map(comparable)).toEqual(specRules.map(comparable));
  });

  it("@keyframes は ai-rot・ai-pulse・ai-blink の 3 つで、中身も同じ", () => {
    const file = keyframesOf(readCss(CSS_PATH));
    expect([...file.keys()]).toEqual(["ai-rot", "ai-pulse", "ai-blink"]);
    expect(file).toEqual(keyframesOf(SPEC_TEXT));
  });

  it("C.6（.kh。経年比較）の規則が無い", () => {
    const selectors = rules.flatMap((rule) => rule.selectors);
    expect(selectors.filter((s) => s.includes(".kh"))).toEqual([]);
  });

  it('印刷の形（data-variant="print"）は動きを止める。強みと注意点・足りている・欠けているは幅 680px 以下で 1 列', () => {
    expect(decl(rules, '#ai[data-variant="print"] *', "animation")).toBe("none !important");
    for (const two of ["#ai .ai-rec .two", "#ai .ai-ik .two"]) {
      expect(decl(rules, two, "grid-template-columns"), two).toBe("1fr 1fr");
      expect(decl(rules, two, "grid-template-columns", "@media (max-width: 680px)"), two).toBe(
        "1fr",
      );
    }
  });

  it("8 項目: 1 行に 4 つ（等しい幅）。幅 1023px 以下は選択欄の最小幅 0・最大幅 100%、900px 以下は 1 行に 2 つ（幅 calc(50% - 6px)、縦の間 12px）（§2.13）", () => {
    expect(decl(rules, "#ai .ai-ctx-row", "display")).toBe("flex");
    expect(decl(rules, "#ai .ai-ctx-item", "flex")).toBe("1 1 0");
    expect(decl(rules, "#ai .ai-ctx select", "min-width")).toBe("180px");
    const narrow = "@media (max-width: 1023px)";
    expect(decl(rules, "#ai .ai-ctx select", "min-width", narrow)).toBe("0");
    expect(decl(rules, "#ai .ai-ctx select", "max-width", narrow)).toBe("100%");
    expect(decl(rules, "#ai .ai-ctx select", "width", narrow)).toBe("100%");
    const two = "@media (max-width: 900px)";
    expect(decl(rules, "#ai .ai-ctx-row", "flex-wrap", two)).toBe("wrap");
    expect(decl(rules, "#ai .ai-ctx-row", "row-gap", two)).toBe("12px");
    for (const property of ["flex", "min-width", "max-width"]) {
      expect(decl(rules, "#ai .ai-ctx-item", property, two), property).toContain("calc(50% - 6px)");
    }
  });
});

describe("（ID なし）旧の AI 解説の領域の CSS の片付け（11-6 §3.10・§4.3）", () => {
  const admin = parseCssRules(readCss("app/(admin)/admin.css"));
  const adminSelectors = admin.flatMap((rule) => rule.selectors);

  it("admin.css に旧の AI 解説の領域だけが使っていた .result-section（と中の h2・.panel・h3・h4）・.badge・.small・.ai-analysis__actions・.ai-analysis__failed・.ai-analysis__verdict が無い", () => {
    for (const name of [
      ".result-section",
      ".badge",
      ".small",
      ".ai-analysis__actions",
      ".ai-analysis__failed",
      ".ai-analysis__verdict",
    ]) {
      expect(
        adminSelectors.filter((s) => s.includes(name)),
        name,
      ).toEqual([]);
    }
  });

  it("admin.css の .spinner の指定はダウンロードのポップアップの作成中の表示（.ai-analysis__progress）の下だけ（ふだんと prefers-reduced-motion）。生成中の輪 svg.spinner に枠・角丸・回転が当たらない", () => {
    expect(adminSelectors).toContain(".ai-analysis__progress");
    const spinners = admin.filter((rule) => rule.selectors.some((s) => s.includes(".spinner")));
    expect(spinners.map((rule) => [rule.at, rule.selectors])).toEqual([
      [null, [".ai-analysis__progress .spinner"]],
      ["@media (prefers-reduced-motion: reduce)", [".ai-analysis__progress .spinner"]],
    ]);
    expect(readCss("app/(admin)/admin.css")).toContain("@keyframes admin-spin");
    // 生成中の輪の svg.spinner の指定は ai-area.css の #ai .ai-loading .spinner だけ（枠・角丸・動きの指定が無い）
    expect(findDecl(rules, "#ai .ai-loading .spinner", "border")).toBeUndefined();
    expect(findDecl(rules, "#ai .ai-loading .spinner", "animation")).toBeUndefined();
    expect(decl(rules, "#ai .ai-loading .spinner", "transform")).toBe("rotate(-90deg)");
  });
});
