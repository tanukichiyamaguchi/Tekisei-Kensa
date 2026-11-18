// M7-ai-48・49（11-6 §5.1 の PR-7.9 の分。§2.17、11 総論 8.3 の配色の取り決め（14〜25））。components/admin/result/ai/ai-area.css（別表C の
// C.1〜C.4。C.1 の 8 項目の入力欄の規則・C.5 は PR-7.10、C.6 は PR-7.11a）を読み、変数を解いて、§2.17 の K-49 の表の 1・3・4・6〜16 のうち
// 共通の部品と採用向けの規則（文字 4.5:1）と、届いていて変えない組（マウス・押下を含む）、K-50 の焦点の枠（タブと生成ボタン。管理画面に
// 共通の焦点の枠と同じ値）と選んでいるタブの地（3:1。採用向けの生成済みのパネルで下の端にかかるカードの影のすそとも比べる）を WCAG 2 の
// 式で計算する。地がグラデーションのときは両端と途中の色（位置を 0.1% 刻み）で、重ねた色と途中の色は各成分を四捨五入（0.5 は切り上げ。
// Math.round）して 8 ビットにしてから計算し、いちばん低いところで確かめる（axe が判定しないグラデーションの地の上の文字、axe が見ない
// マウス・押下の色、axe が調べない部品の 3:1 をここで確かめる）。参照元の色のまま使う用途（飾り・文字に添えた印・押せない状態）が置き
// 換わっていないことも確かめる。
// 写しの確かめ（ID なし）: 11-6 の別表C の C.1〜C.4 の CSS を読み、C.1 の 8 項目の入力欄の規則を除いた規則の並び・セレクタ・宣言の値と
// @keyframes が、ファイルと同じ（prettier の書き方の違い（空白・大文字小文字・小数の先頭の 0）はそろえて比べる）。
// 旧の AI 解説の領域の CSS の片付け（ID なし。11-6 §3.10・§4.3）: admin.css に .result-section・.badge・.small・.ai-analysis__actions・
// .ai-analysis__failed・.ai-analysis__verdict が無く、.spinner の指定がダウンロードのポップアップの作成中の表示（.ai-analysis__progress）の
// 下だけ（生成中の輪 svg.spinner に枠・角丸・回転が当たらない）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  decl,
  findDecl,
  normalizeCss,
  over,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  splitTopLevel,
  variablesOf,
  type CssRule,
  type Rgb,
} from "./css-rules";

const CSS_PATH = "components/admin/result/ai/ai-area.css";
const rules = parseCssRules(readCss(CSS_PATH));

/** 変数（#ai の --ai-2-strong に、生成中・採用向けの根の変数を重ねる） */
const ROOT_VARS = variablesOf(rules, "#ai");
const REC_VARS = new Map([...ROOT_VARS, ...variablesOf(rules, "#ai .ai-rec")]);
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

describe("M7-ai-48 K-49 で変えた色の変数と規則の値（§2.17 の K-49 の表の 1・3・4・6〜16 のうち共通の部品と採用向けの分）", () => {
  it("変数: #ai の --ai-2-strong #278379、採用向けの根の --muted #6A7684・--muted-2 #697888・--muted-chip #697482、生成中の根の --muted #6B7885", () => {
    expect(ROOT_VARS.get("--ai-2-strong")?.toUpperCase()).toBe("#278379");
    const recVars = variablesOf(rules, "#ai .ai-rec");
    expect(recVars.get("--muted")?.toUpperCase()).toBe("#6A7684");
    expect(recVars.get("--muted-2")?.toUpperCase()).toBe("#697888");
    expect(recVars.get("--muted-chip")?.toUpperCase()).toBe("#697482");
    expect(variablesOf(rules, "#ai .ai-loading").get("--muted")?.toUpperCase()).toBe("#6B7885");
  });

  it("表の 1: 選んでいるタブ・生成ボタン（90deg）、見出し帯（102deg）、質問の番号（上から下）のグラデーションは #4B6FB5 → var(--ai-2-strong)", () => {
    expect(decl(rules, "#ai .ai-tab", "background")).toBe(
      "linear-gradient(90deg, #4b6fb5, var(--ai-2-strong))",
    );
    expect(decl(rules, "#ai .ai-gen-btn", "background")).toBe(
      "linear-gradient(90deg, #4b6fb5, var(--ai-2-strong))",
    );
    expect(decl(rules, "#ai .ai-rec .ai-head", "background")).toBe(
      "linear-gradient(102deg, var(--ai-1), var(--ai-2-strong))",
    );
    expect(decl(rules, "#ai .ai-rec .qn", "background")).toBe(
      "linear-gradient(var(--ai-1), var(--ai-2-strong))",
    );
    expect(REC_VARS.get("--ai-1")?.toUpperCase()).toBe("#4B6FB5");
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

describe("M7-ai-48 K-49 の表の組の比（4.5:1 以上。§2.17 の表の値）", () => {
  it("表の 1: 白い文字と、選んでいるタブ・生成ボタン・見出し帯・質問の番号のグラデーションの地（両端と途中。いちばん低いのは終わりの近くの 4.54）", () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyMap<string, string>]> = [
      ["#ai .ai-tab", ROOT_VARS],
      ["#ai .ai-gen-btn", ROOT_VARS],
      ["#ai .ai-rec .ai-head", REC_VARS],
      ["#ai .ai-rec .qn", REC_VARS],
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
});

describe("M7-ai-49 焦点の枠と選んでいるタブの地（K-50。§2.17。PR-7.9 の分）", () => {
  it("タブと生成ボタンの :focus-visible は管理画面に共通の焦点の枠と同じ値（2px solid #3F8DA5・outline-offset 2px）", () => {
    const admin = parseCssRules(readCss("app/(admin)/admin.css"));
    const common = ":where(.admin-root, .adm-focus-scope) :focus-visible";
    expect(decl(admin, common, "outline")).toBe(COMMON_RING);
    expect(decl(admin, common, "outline-offset")).toBe("2px");
    for (const selector of ["#ai .ai-tab:focus-visible", "#ai .ai-gen-btn:focus-visible"]) {
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

/** C.1〜C.4（C.1 の 8 項目の入力欄の規則と、その @media は PR-7.10 で足す） */
const SPEC_TEXT = [
  specCss("### C.1 ", "### C.2 "),
  specCss("### C.2 ", "### C.3 "),
  specCss("### C.3 ", "### C.4 "),
  specCss("### C.4 ", "### C.5 "),
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

describe("（ID なし）別表C の写し（C.1〜C.4。C.1 の 8 項目の入力欄・C.5・C.6 は後の PR）", () => {
  const specRules = parseCssRules(SPEC_TEXT);
  const isTrainingContext = (rule: CssRule) => rule.selectors.every((s) => s.includes(".ai-ctx"));

  it("C.1 の 8 項目の入力欄の規則（.ai-ctx で始まる 14 の規則と @media の 3 つ）を除いた 114 の規則（@keyframes は次の確かめ）が、並び・セレクタ・宣言の値ともファイルと同じ", () => {
    // 8 項目の規則は、ほかの部品の規則とセレクタを分け合わない（まとめて除ける）
    expect(
      specRules.filter(
        (r) => !isTrainingContext(r) && r.selectors.some((s) => s.includes(".ai-ctx")),
      ),
    ).toEqual([]);
    expect(specRules.filter(isTrainingContext)).toHaveLength(17);
    const expected = specRules.filter((r) => !isTrainingContext(r)).map(comparable);
    expect(expected).toHaveLength(114);
    expect(rules.map(comparable)).toEqual(expected);
  });

  it("@keyframes は ai-rot・ai-pulse・ai-blink の 3 つで、中身も同じ", () => {
    const file = keyframesOf(readCss(CSS_PATH));
    expect([...file.keys()]).toEqual(["ai-rot", "ai-pulse", "ai-blink"]);
    expect(file).toEqual(keyframesOf(SPEC_TEXT));
  });

  it("8 項目の入力欄（.ai-ctx）・C.5（.ai-ik の中）・C.6（.kh）の規則が無い（C.1 の .ai-ik を含む 2 つの規則はある）", () => {
    const selectors = rules.flatMap((rule) => rule.selectors);
    expect(selectors.filter((s) => s.includes(".ai-ctx"))).toEqual([]);
    expect(selectors.filter((s) => s.includes(".kh"))).toEqual([]);
    expect(selectors.filter((s) => s.includes(".ai-ik"))).toEqual([
      "#ai .ai-ik",
      "#ai .ai-ik .head .sp",
    ]);
  });

  it('印刷の形（data-variant="print"）は動きを止める。強みと注意点は幅 680px 以下で 1 列', () => {
    expect(decl(rules, '#ai[data-variant="print"] *', "animation")).toBe("none !important");
    expect(decl(rules, "#ai .ai-rec .two", "grid-template-columns")).toBe("1fr 1fr");
    expect(
      decl(rules, "#ai .ai-rec .two", "grid-template-columns", "@media (max-width: 680px)"),
    ).toBe("1fr");
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
