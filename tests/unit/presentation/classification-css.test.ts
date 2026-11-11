// M7-zaiseki-47 組織内分類の配色と焦点の見た目（11-3 §2.4・§2.19・§2.22・§5.1 の組織内分類の分、総論 8.3 の配色の取り決め）。
// app/(admin)/admin.css の組織内分類の節（ob-）と QUADRANTS を読み、K-49 の表の 1〜24・K-50 の表の 1・3 と、届いていて変えない
// 組を WCAG 2 の式で計算する（axe が見ないマウスのときの色と疑似要素の文字、axe が調べない部品の 3:1 をここで確かめる）。半透明の色は
// 下の地（白）に重ね、各成分を四捨五入（0.5 は切り上げ）して 8 ビットにしてから計算する。ページの地は 11-8 §4.5 に従い #F7F9FC として
// 計算する（今の .admin-root の地 #F3F5F8 は PR-7.13a で #F7F9FC になる）。分類ごとの色は部品が style 属性の CSS 変数で置くので、
// 部品を見本の人で renderToStaticMarkup し、変数の値と QUADRANTS の対応を確かめる。あわせて、§2.19 のコンテナクエリと @media の値
// （狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）と、取得の失敗の文の比。在籍・退職の分（K-49 の表の 25〜30、K-50 の表の 2、
// リンクの 4 つの状態の色、通知の丸形、変更ダイアログの焦点の枠、在籍・退職の規則の範囲）は employment-css.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  contrastRatio,
  decl,
  findDecl,
  hexOf,
  over,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  specificity,
  variablesOf,
  type Rgb,
} from "./css-rules";
import { ClassificationMap } from "@/components/admin/classification/ClassificationMap";
import { ClassificationPanel } from "@/components/admin/classification/ClassificationPanel";
import { ClassificationSummary } from "@/components/admin/classification/ClassificationSummary";
import {
  cellBackground,
  CHARACTER_CELLS,
  miniMapColors,
  mixHex,
  QUADRANT_ORDER,
  QUADRANTS,
  summarizeClassification,
  type QuadrantColors,
} from "@/lib/presentation/classification-view";
import type { SocialStyleKey } from "@/lib/scoring/types";
import type { ClassificationPersonDto } from "@/lib/services/dto/admin";

const rules = parseCssRules(readCss("app/(admin)/admin.css"));
const vars = variablesOf(rules, ".ob-root");

/** 宣言の値（var() を .ob-root の変数で解く） */
const value = (selector: string, property: string, at: string | null = null) =>
  resolveVars(decl(rules, selector, property, at), vars);
const solid = (text: string): Rgb => {
  const c = parseColor(resolveVars(text, vars));
  expect(c.alpha, text).toBe(1);
  return c.rgb;
};
const color = (selector: string, property: string) => solid(value(selector, property));

const WHITE: Rgb = [255, 255, 255];
/** ページの地（11-8 §4.5 の --adm-page-bg。今の .admin-root の地 #F3F5F8 は PR-7.13a で #F7F9FC になる） */
const PAGE_BG = solid("#F7F9FC");
/** .ob-root の輪郭（参照元の ob-map の焦点の指定） */
const ROOT_OUTLINE = "2px solid #1f2933";
/** 管理画面に共通の焦点の枠（11-8 §2.2.6・別表A の 1） */
const COMMON_FOCUS = ":where(.admin-root, .adm-focus-scope) :focus-visible";

const WIDE = "@container (min-width: 1000px)";
const NARROW = "@container (max-width: 900px)";
const NARROWER = "@container (max-width: 520px)";
const PHONE = "@media (max-width: 600px)";

const q = (key: SocialStyleKey): QuadrantColors => QUADRANTS[key].colors;
const rgb = (hex: string): Rgb => solid(hex);

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

// ---- 見本の人（架空。アナリティカル 2・ドライビング 1・エミアブル 0・エクスプレッシブ 2）
const person = (
  index: number,
  aptitudeType: ClassificationPersonDto["aptitudeType"],
  employmentStatus: ClassificationPersonDto["employmentStatus"],
): ClassificationPersonDto => ({
  resultId: `ResSample${String(index).padStart(11, "0")}`,
  aptitudeType,
  name: `テストテスト ${String(index).padStart(2, "0")}`,
  phoneNumber: `000-0000-00${String(index).padStart(2, "0")}`,
  occupationLabel: "アイリスト",
  teamCode: index % 2 === 0 ? "A" : null,
  submittedAt: `2026-09-${String(index).padStart(2, "0")}T00:00:00.000Z`,
  employmentStatus,
});
const PEOPLE: readonly ClassificationPersonDto[] = [
  person(1, "scientist", "candidate"),
  person(2, "scientist", "employed"),
  person(3, "pioneer", "candidate"),
  person(4, "attendant", "left"),
  person(5, "freelancer", "employed"),
];
const SUMMARY = summarizeClassification(PEOPLE, "", "all");

/** data-testid（または class）で引いた最初の開きタグ */
function openTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`見つからない: ${marker}`);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
}
/** 開きタグの style 属性を宣言の表に */
function styleOf(tag: string): ReadonlyMap<string, string> {
  const m = /style="([^"]*)"/.exec(tag);
  const map = new Map<string, string>();
  for (const part of (m?.[1] ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return map;
}
const noop = () => {};

describe("M7-zaiseki-47 K-49・K-50 で変えた色と形の値（組織内分類の分。11-3 §2.22）", () => {
  it(".ob-root の変数（--mut #6C7784・--mut-pale #697380。参照元の値は #7A8592）と根の文字（16px・行間 1・コンテナ）", () => {
    const expected: Readonly<Record<string, string>> = {
      "--ink": "#1F2933",
      "--sub": "#5F6B78",
      "--mut": "#6C7784",
      "--mut-pale": "#697380",
      "--line": "#E3E8EE",
    };
    for (const [name, hex] of Object.entries(expected)) {
      expect(vars.get(name)?.toUpperCase(), name).toBe(hex);
    }
    expect(decl(rules, ".ob-root", "font-size")).toBe("16px");
    expect(decl(rules, ".ob-root", "line-height")).toBe("1");
    expect(decl(rules, ".ob-root", "container-type")).toBe("inline-size");
  });

  it("キャラクターの枠: 短縮名は var(--qsub)、0 人の枠のひらがな名は var(--mut-pale)・短縮名は var(--sub)・人数は #667484（K-49 の表の 19〜24）", () => {
    expect(decl(rules, ".ob-c .ty", "color")).toBe("var(--qsub)");
    expect(decl(rules, ".ob-c.z .who", "color")).toBe("var(--mut-pale)");
    expect(decl(rules, ".ob-c.z .ty", "color")).toBe("var(--sub)");
    expect(value(".ob-c.z .n", "color").toUpperCase()).toBe("#667484");
    expect(value(".ob-c.z", "background").toUpperCase()).toBe("#F7F9FA");
    // 人数 1 以上の枠の人数と象限の見出しは --qc（onMid）
    expect(decl(rules, ".ob-c .n", "color")).toBe("var(--qc)");
    expect(decl(rules, ".ob-qh .nm", "color")).toBe("var(--qc)");
    expect(decl(rules, ".ob-qh .jp", "color")).toBe("var(--qc)");
    expect(decl(rules, ".ob-qh .ct", "background")).toBe("var(--qc)");
    expect(decl(rules, ".ob-qh .ct small", "color")).toBe("var(--qmid)");
    // 詳細パネル: 丸いラベルの地 --qc（label）、適性 --qd（text）、4 タイプのボタンの人数 --qn（typeCount）
    expect(decl(rules, ".ob-panel .q", "background")).toBe("var(--qc)");
    expect(decl(rules, ".ob-panel .fit", "color")).toBe("var(--qd)");
    expect(decl(rules, ".ob-panel .types em", "color")).toBe("var(--qn)");
  });

  it("チームの選択欄の枠は 1px solid #8397AA（K-50 の表の 1。参照元は #CDD5DD）", () => {
    expect(value(".ob-team select", "border").toUpperCase()).toBe("1PX SOLID #8397AA");
  });

  it("全員／在籍／退職の焦点: #1F2933 の 2px を縁から 1px あけて内側（-3px）、選択中は inset 0 0 0 5px の白（K-50 の表の 3）", () => {
    const seg = ".ob-root .ob-seg button:focus-visible";
    expect(decl(rules, seg, "outline")).toBe(ROOT_OUTLINE);
    expect(decl(rules, seg, "outline-offset")).toBe("-3px");
    expect(decl(rules, ".ob-root .ob-seg button.on:focus-visible", "box-shadow")).toBe(
      "inset 0 0 0 5px #ffffff",
    );
    expect(
      compareSpecificity(specificity(seg), specificity(".ob-root button:focus-visible")),
    ).toBeGreaterThan(0);
  });

  it("象限の見出しのボタンの焦点: outline-offset -2px だけを書き、色と太さは .ob-root の輪郭（2px solid #1F2933）。詳細度はそれより強い", () => {
    const qh = ".ob-root .ob-qh:focus-visible";
    const rule = rules.find((r) => r.at === null && r.selectors.includes(qh));
    expect(rule?.declarations.get("outline-offset")).toBe("-2px");
    expect([...(rule?.declarations.keys() ?? [])]).toEqual(["outline-offset"]);
    expect(decl(rules, ".ob-root button:focus-visible", "outline")).toBe(ROOT_OUTLINE);
    expect(decl(rules, ".ob-root button:focus-visible", "outline-offset")).toBe("2px");
    expect(decl(rules, ".ob-root select:focus-visible", "outline")).toBe(ROOT_OUTLINE);
    expect(
      compareSpecificity(specificity(qh), specificity(".ob-root button:focus-visible")),
    ).toBeGreaterThan(0);
    // 輪郭の外の縁はボタンの縁の内側に収まる（offset + 太さ ≦ 0）
    const offset = Number.parseFloat(rule?.declarations.get("outline-offset") ?? "0");
    const width = Number.parseFloat(ROOT_OUTLINE);
    expect(offset + width).toBeLessThanOrEqual(0);
  });

  it("「組織内分類とは？」と 2 つのダイアログの中の部品は #3F8DA5（共通の焦点の枠と同じ）、詳細パネルの × は #1F2933、本文の枠は内側", () => {
    const ring = "2px solid #3f8da5";
    expect(decl(rules, COMMON_FOCUS, "outline")).toBe(ring);
    expect(decl(rules, ".ob-head .ob-help:focus-visible", "outline")).toBe(ring);
    expect(decl(rules, ".ob-head .ob-help:focus-visible", "outline-offset")).toBe("2px");
    for (const selector of [".ob-panel :focus-visible", ".ob-about :focus-visible"]) {
      expect(decl(rules, selector, "outline"), selector).toBe(ring);
      expect(decl(rules, selector, "outline-offset"), selector).toBe("2px");
      expect(compareSpecificity(specificity(selector), specificity(COMMON_FOCUS))).toBeGreaterThan(
        0,
      );
    }
    // 「組織内分類とは？」は .ob-root の輪郭より強い
    expect(
      compareSpecificity(
        specificity(".ob-head .ob-help:focus-visible"),
        specificity(".ob-root button:focus-visible"),
      ),
    ).toBeGreaterThan(0);
    // 詳細パネルの × は参照元の #1F2933（.ob-panel :focus-visible より強い）
    expect(decl(rules, ".ob-panel .x:focus-visible", "outline")).toBe(ROOT_OUTLINE);
    expect(decl(rules, ".ob-panel .x:focus-visible", "outline-offset")).toBe("2px");
    expect(
      compareSpecificity(
        specificity(".ob-panel .x:focus-visible"),
        specificity(".ob-panel :focus-visible"),
      ),
    ).toBeGreaterThan(0);
    // キャラクターのパネルの本文がはみ出して焦点を受けるときは、枠を本文の内側に、縁から 1px あけて描く（総論 8.5・8.3 の 19）。
    // 本文はパネルの幅いっぱいなので、縁に接して描くと（-2px）枠の外がパネルの左の影に接する（影のいちばん濃い場合の色と 1.28:1）。
    // 1px あけると、枠の外と内は本文の地（本文は地を持たず、パネルの白）だけになり 3.77:1
    const bd = rules.find(
      (r) => r.at === null && r.selectors.includes(".ob-panel .bd:focus-visible"),
    );
    expect([...(bd?.declarations ?? [])]).toEqual([["outline-offset", "-3px"]]);
    expect(
      compareSpecificity(
        specificity(".ob-panel .bd:focus-visible"),
        specificity(".ob-panel :focus-visible"),
      ),
    ).toBeGreaterThan(0);
    const bdOffset = Number.parseFloat(bd?.declarations.get("outline-offset") ?? "0");
    expect(bdOffset + Number.parseFloat(ring)).toBeLessThanOrEqual(-1);
    expect(findDecl(rules, ".ob-panel .bd", "background")).toBeUndefined();
    expect(color(".ob-panel", "background")).toEqual(WHITE);
    const panelShadow = solid(decl(rules, ".ob-panel", "box-shadow").split(" ").at(-1) ?? "");
    expect(round2(contrastRatio(solid("#3F8DA5"), panelShadow))).toBe(1.28);
    expect(round2(contrastRatio(solid("#3F8DA5"), WHITE))).toBe(3.77);
  });

  it("象限の見出し・4 タイプのボタンの人数・枠の人数の文字の色をマウスで変える規則が無い（状態で地が変わる文字。§2.22）", () => {
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (!selector.includes(":hover")) continue;
        if (!/ob-qh|\.types|ob-c\b/.test(selector)) continue;
        expect(rule.declarations.has("color"), selector).toBe(false);
      }
    }
    // マウスで変わるのは地だけ
    expect(decl(rules, ".ob-qh:hover", "background")).toBe("var(--qmid)");
    expect(value(".ob-panel .types button:hover", "background").toUpperCase()).toBe("#F7F9FA");
  });
});

describe("M7-zaiseki-47 K-49 の表の 1〜24（文字 4.5:1。分類ごと、マウスを載せたときの地を含む）", () => {
  const typeHover = color(".ob-panel .types button:hover", "background");
  const posBox = color(".ob-panel .pos", "background");
  const zeroCell = color(".ob-c.z", "background");

  it("1・2 凡例の %・適性・枠の印の文字（白の上）と典型の印の地（白い文字）は text", () => {
    expectRatios(
      [
        ["1 アナリティカル", rgb(q("analytical").text), WHITE, 4.59],
        ["2 エクスプレッシブ", rgb(q("expressive").text), WHITE, 4.56],
        ["ドライビング（濃い色のまま）", rgb(q("driving").text), WHITE, 5.92],
        ["エミアブル（濃い色のまま）", rgb(q("amiable").text), WHITE, 4.73],
      ],
      4.5,
    );
    // 典型の印は印の色の地に白い文字（.ob-c .lean.core）
    expect(decl(rules, ".ob-c .lean.core", "background")).toBe("var(--lc)");
    expect(value(".ob-c .lean.core", "color").toUpperCase()).toBe("#FFFFFF");
    expect(decl(rules, ".ob-c .lean", "color")).toBe("var(--lc)");
    expect(value(".ob-c .lean", "background").toUpperCase()).toBe("#FFFFFF");
  });

  it("3〜9 象限の見出し（ふだんの背景とマウスの中間色）・人数のピル（白い文字と中間色の %）・枠の人数（いちばん濃い枠の地）は onMid", () => {
    const pairs: Array<readonly [string, Rgb, Rgb, number]> = [];
    const onBg: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 5.27,
      driving: 5.56,
      amiable: 5.36,
      expressive: 5.35,
    };
    const onMid: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 4.51,
      driving: 4.54,
      amiable: 4.57,
      expressive: 4.56,
    };
    const pillWhite: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 5.89,
      driving: 6.36,
      amiable: 6.05,
      expressive: 5.81,
    };
    for (const key of QUADRANT_ORDER) {
      const c = q(key);
      pairs.push([`見出し／背景（${key}）`, rgb(c.onMid), rgb(c.bg), onBg[key]]);
      pairs.push([`見出し・枠の人数／中間色（${key}）`, rgb(c.onMid), rgb(c.mid), onMid[key]]);
      pairs.push([`ピルの %（中間色）／ピルの地（${key}）`, rgb(c.mid), rgb(c.onMid), onMid[key]]);
      pairs.push([`ピルの白い文字／ピルの地（${key}）`, WHITE, rgb(c.onMid), pillWhite[key]]);
    }
    expectRatios(pairs, 4.5);
    expect(value(".ob-qh .ct", "color").toUpperCase()).toBe("#FFFFFF");
  });

  it("10〜13 詳細パネルの丸いラベル（白い文字）の地は label", () => {
    expect(value(".ob-panel .q", "color").toUpperCase()).toBe("#FFFFFF");
    expectRatios(
      [
        ["10 アナリティカル", WHITE, rgb(q("analytical").label), 4.61],
        ["11 ドライビング", WHITE, rgb(q("driving").label), 4.54],
        ["12 エミアブル", WHITE, rgb(q("amiable").label), 4.58],
        ["13 エクスプレッシブ", WHITE, rgb(q("expressive").label), 4.59],
      ],
      4.5,
    );
  });

  it("14〜16 4 タイプのボタンの人数は typeCount（白とマウスのときの #F7F9FA の上）", () => {
    expect(value(".ob-panel .types button", "background").toUpperCase()).toBe("#FFFFFF");
    expectRatios(
      [
        ["14 アナリティカル／白", rgb(q("analytical").typeCount), WHITE, 4.83],
        ["14 アナリティカル／マウス", rgb(q("analytical").typeCount), typeHover, 4.57],
        ["15 エミアブル／白", rgb(q("amiable").typeCount), WHITE, 4.85],
        ["15 エミアブル／マウス", rgb(q("amiable").typeCount), typeHover, 4.6],
        ["16 エクスプレッシブ／白", rgb(q("expressive").typeCount), WHITE, 4.78],
        ["16 エクスプレッシブ／マウス", rgb(q("expressive").typeCount), typeHover, 4.52],
        ["ドライビング（濃い色のまま）／白", rgb(q("driving").typeCount), WHITE, 5.92],
        ["ドライビング（濃い色のまま）／マウス", rgb(q("driving").typeCount), typeHover, 5.61],
      ],
      4.5,
    );
  });

  it("17・18 位置の箱の印（#F9FAFB の上）は pos。中央寄りは #5F6B78", () => {
    expect(hexOf(posBox)).toBe("#F9FAFB");
    expectRatios(
      [
        ["17 アナリティカル", rgb(q("analytical").pos), posBox, 4.5],
        ["18 エクスプレッシブ", rgb(q("expressive").pos), posBox, 4.57],
        ["ドライビング（濃い色のまま）", rgb(q("driving").pos), posBox, 5.67],
        ["エミアブル（濃い色のまま）", rgb(q("amiable").pos), posBox, 4.52],
        ["中央寄り", rgb("#5F6B78"), posBox, 5.2],
      ],
      4.5,
    );
  });

  it("19〜22 人数 1 以上の枠の短縮名は cellSub（いちばん濃い枠の地＝中間色の上。いちばん薄い 25% の地でも届く）", () => {
    const expected: Readonly<Record<SocialStyleKey, readonly [number, number]>> = {
      analytical: [4.57, 5.58],
      driving: [4.51, 5.84],
      amiable: [4.62, 5.71],
      expressive: [4.52, 5.44],
    };
    const pairs: Array<readonly [string, Rgb, Rgb, number]> = [];
    for (const key of QUADRANT_ORDER) {
      const c = q(key);
      const lightest = rgb(mixHex("#FFFFFF", c.mid, 0.25)); // cellBackground のいちばん薄い色（1 人で最多が多いとき）の極限
      pairs.push([`短縮名／中間色（${key}）`, rgb(c.cellSub), rgb(c.mid), expected[key][0]]);
      pairs.push([`短縮名／25% の地（${key}）`, rgb(c.cellSub), lightest, expected[key][1]]);
    }
    expectRatios(pairs, 4.5);
  });

  it("23・24 0 人の枠のひらがな名と人数（#F7F9FA の上）。短縮名は #5F6B78 のまま", () => {
    expect(hexOf(zeroCell)).toBe("#F7F9FA");
    expectRatios(
      [
        ["23 ひらがな名", color(".ob-c.z .who", "color"), zeroCell, 4.56],
        ["24 人数", color(".ob-c.z .n", "color"), zeroCell, 4.52],
        ["短縮名（参照元のまま）", color(".ob-c.z .ty", "color"), zeroCell, 5.15],
      ],
      4.5,
    );
  });

  it("届いていて変えない文字（ひらがな名・中央寄りの印・パネルの上部・4 タイプのボタンの名前・見出し行・ページの地の上の文字）", () => {
    const pairs: Array<readonly [string, Rgb, Rgb, number]> = [
      ["中央寄りの印／白", rgb("#5F6B78"), WHITE, 5.44],
      ["4 タイプのボタンの名前と印／白", color(".ob-panel .types span", "color"), WHITE, 5.44],
      [
        "4 タイプのボタンの名前と印／マウス",
        color(".ob-panel .types span", "color"),
        typeHover,
        5.15,
      ],
      [
        "「組織内分類とは？」",
        color(".ob-help .tx", "color"),
        color(".ob-help", "background"),
        9.33,
      ],
      [
        "「組織内分類とは？」／マウス",
        color(".ob-help .tx", "color"),
        color(".ob-help:hover", "background"),
        8.32,
      ],
      ["説明文・軸・人数のラベル／ページの地", color(".ob-note", "color"), PAGE_BG, 5.16],
      ["見出し／ページの地", color(".ob-head h1", "color"), PAGE_BG, 13.99],
      ["本文 #3C4753／白", color(".ob-panel .tx2", "color"), WHITE, 9.47],
      ["位置の説明／箱の地", color(".ob-panel .pos p", "color"), posBox, 9.06],
      [
        "表の見出し／#F7F9FA",
        color(".ob-panel th", "color"),
        color(".ob-panel th", "background"),
        5.15,
      ],
    ];
    const panelSub: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 4.87,
      driving: 4.76,
      amiable: 4.82,
      expressive: 5.01,
    };
    for (const key of QUADRANT_ORDER) {
      const c = q(key);
      pairs.push([`ひらがな名／中間色（${key}）`, color(".ob-c .who", "color"), rgb(c.mid), 0]);
      pairs.push([
        `パネルの上部の人数と割合／背景（${key}）`,
        color(".ob-panel .sub", "color"),
        rgb(c.bg),
        panelSub[key],
      ]);
    }
    for (const [label, front, back, expected] of pairs) {
      const r = contrastRatio(front, back);
      if (expected > 0) expect(round2(r), label).toBe(expected);
      expect(r, label).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("M7-zaiseki-47 K-50 の表の 1・3 と、届いていて変えない部品（部品 3:1。外の地と中の地の両方）", () => {
  it("K-50 の 1: チームの選択欄の枠は、外の集計カードの白とも中の白とも 3.01:1", () => {
    const line = solid(value(".ob-team select", "border").replace(/^1px solid /, ""));
    expectRatios(
      [
        ["枠／集計カードの地", line, color(".ob-sum", "background"), 3.01],
        ["枠／選択欄の中", line, color(".ob-team select", "background"), 3.01],
      ],
      3,
    );
  });

  it("K-50 の 3: 全員／在籍／退職の焦点の輪郭は白と区切りの線だけに接し、白の線は選択中の地から離す", () => {
    const outline = solid("#1F2933");
    const divider = solid(
      value(".ob-seg button + button", "border-left").replace(/^1px solid /, ""),
    );
    const selected = solid(
      decl(rules, ".ob-seg button.on", "background").replace(/\s*!important$/, ""),
    );
    expect(hexOf(divider)).toBe("#CDD5DD");
    expect(hexOf(selected)).toBe("#1F2D3A");
    expectRatios(
      [
        ["輪郭／ボタンの白", outline, color(".ob-seg button", "background"), 14.76],
        ["輪郭／区切りの線", outline, divider, 9.95],
        ["白の線／選択中の地", WHITE, selected, 14.05],
        ["選択中の白い文字", WHITE, selected, 14.05],
      ],
      3,
    );
    // 参照元のまま: 輪郭を内側に描かないと選択中の地と 1.05:1
    expect(round2(contrastRatio(outline, selected))).toBe(1.05);
  });

  it("届いていて変えない: .ob-root の輪郭 #1F2933（ページの地・白・象限の背景・中間色、枠のマウスの影）", () => {
    const outline = solid("#1F2933");
    const shadow = solid(value(".ob-c:hover", "box-shadow").replace(/^0 8px 18px -10px /, ""));
    expect(hexOf(shadow)).toBe("#6B7785");
    const pairs: Array<readonly [string, Rgb, Rgb, number]> = [
      ["輪郭／ページの地", outline, PAGE_BG, 13.99],
      ["輪郭／白", outline, WHITE, 14.76],
      ["輪郭／枠のマウスの影", outline, shadow, 3.23],
    ];
    const ringBg: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 13.21,
      driving: 12.9,
      amiable: 13.06,
      expressive: 13.59,
    };
    const ringMid: Readonly<Record<SocialStyleKey, number>> = {
      analytical: 11.31,
      driving: 10.54,
      amiable: 11.14,
      expressive: 11.59,
    };
    for (const key of QUADRANT_ORDER) {
      pairs.push([`輪郭／象限の背景（${key}）`, outline, rgb(q(key).bg), ringBg[key]]);
      pairs.push([
        `輪郭・折りたたみの ▾／中間色（${key}）`,
        outline,
        rgb(q(key).mid),
        ringMid[key],
      ]);
    }
    expectRatios(pairs, 3);
    expect(value(".ob-fold", "color").toUpperCase()).toBe("#1F2933");
    expect(decl(rules, ".ob-fold", "background")).toBe("var(--qmid)");
  });

  it("届いていて変えない: 共通の焦点の枠 #3F8DA5（白 3.77:1・ページの地 3.58:1）、閉じるアイコンと × の色", () => {
    const ring = solid("#3F8DA5");
    const aboutClose = color(".ob-about .x", "color");
    const aboutHover = over(parseColor(value(".ob-about .x:hover", "color")), WHITE);
    expect(hexOf(aboutHover)).toBe("#828181");
    const panelClose = color(".ob-panel .x", "color");
    expectRatios(
      [
        ["共通の枠／ダイアログの白", ring, WHITE, 3.77],
        ["共通の枠／ページの地", ring, PAGE_BG, 3.58],
        ["閉じるアイコン／白", aboutClose, color(".ob-about", "background"), 8.69],
        ["閉じるアイコンのマウス（白に重ねた色）／白", aboutHover, WHITE, 3.88],
        ["パネルの ×／白", panelClose, color(".ob-panel .x", "background"), 9.47],
        ["パネルの ×／マウス", panelClose, color(".ob-panel .x:hover", "background"), 8.65],
        ["パネルの × の輪郭／白", solid("#1F2933"), WHITE, 14.76],
      ],
      3,
    );
  });

  it("届いていて変えない: キャラクターの枠の印の枠（印の色）と外のいちばん濃い地（中間色）は 3.26:1 以上、中の白と 4.5:1 以上", () => {
    let lowest = Infinity;
    for (const cell of CHARACTER_CELLS) {
      const mark = rgb(cell.lean.color);
      const mid = rgb(q(cell.quadrant).mid);
      const outside = contrastRatio(mark, mid);
      lowest = Math.min(lowest, outside);
      expect(outside, `${cell.type} の印の枠／中間色`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(mark, WHITE), `${cell.type} の印／白`).toBeGreaterThanOrEqual(4.5);
    }
    expect(round2(lowest)).toBe(3.26);
  });
});

describe("M7-zaiseki-47 CSS 変数と QUADRANTS の対応（部品を見本の人で描いて style 属性を読む）", () => {
  it("集計カード: 割合バーの帯（人数 1 以上の分類だけ。幅は丸めない）と凡例の四角は主色、凡例の % は text", () => {
    // 割合が割り切れない 6 人（アナリティカル 2・ドライビング 1・エミアブル 0・エクスプレッシブ 3）。帯の幅は人数 ÷ 今の人数 × 100% を
    // 丸めずに置く（11-3 §2.6）
    const summary = summarizeClassification(
      [...PEOPLE, person(6, "attendant", "employed")],
      "",
      "all",
    );
    const html = renderToStaticMarkup(
      createElement(ClassificationSummary, {
        summary,
        teamChoices: ["A", "none"],
        team: "",
        mode: "all",
        onOpenQuadrant: noop,
      }),
    );
    const bar = html.slice(html.indexOf('class="ob-bar"'), html.indexOf('class="ob-leg"'));
    const bands = [...bar.matchAll(/<i style="([^"]*)"/g)].map((m) => styleOf(`style="${m[1]}"`));
    expect(bands.map((b) => b.get("background"))).toEqual(
      (["analytical", "driving", "expressive"] as const).map((key) => q(key).main),
    );
    expect(bands.map((b) => b.get("width"))).toEqual([
      "33.33333333333333%",
      "16.666666666666664%",
      "50%",
    ]);
    for (const key of QUADRANT_ORDER) {
      const legend = html.slice(html.indexOf(`data-testid="ob-legend-${key}"`));
      expect(styleOf(openTag(legend, 'class="dot"')).get("background"), key).toBe(q(key).main);
      expect(styleOf(openTag(legend, "<em")).get("color"), key).toBe(q(key).text);
    }
  });

  it("マップ: 象限の --qc・--qbg・--qmid・--qsub は onMid・bg・mid・cellSub、枠の --cbg は cellBackground・--lc は印の色", () => {
    const html = renderToStaticMarkup(
      createElement(ClassificationMap, {
        summary: SUMMARY,
        folds: {},
        onOpenQuadrant: noop,
        onOpenType: noop,
      }),
    );
    for (const key of QUADRANT_ORDER) {
      const style = styleOf(openTag(html, `data-testid="ob-quadrant-${key}"`));
      const c = q(key);
      expect(Object.fromEntries(style), key).toEqual({
        "--qc": c.onMid,
        "--qbg": c.bg,
        "--qmid": c.mid,
        "--qsub": c.cellSub,
      });
    }
    for (const cell of CHARACTER_CELLS) {
      const tag = openTag(html, `data-testid="ob-cell-${cell.type}"`);
      const n = SUMMARY.byType[cell.type];
      expect(Object.fromEntries(styleOf(tag)), cell.type).toEqual({
        "--cbg": cellBackground(n, SUMMARY.maxTypeCount, q(cell.quadrant).mid),
        "--lc": cell.lean.color,
      });
      expect(tag.includes('class="ob-c z"'), cell.type).toBe(n === 0);
    }
    // 最多のキャラクターは中間色、0 人は #F7F9FA
    expect(styleOf(openTag(html, 'data-testid="ob-cell-scientist"')).get("--cbg")).toBe(
      q("analytical").mid,
    );
    expect(styleOf(openTag(html, 'data-testid="ob-cell-follower"')).get("--cbg")).toBe("#F7F9FA");
  });

  it("詳細パネル: 上部の --qc・--qbg は label・bg、本文の --qd・--qn は text・typeCount、位置の箱の印は posColor、ミニ図は主色・中間色・#E9EDF1", () => {
    const panel = (target: Parameters<typeof ClassificationPanel>[0]["target"]) =>
      renderToStaticMarkup(
        createElement(ClassificationPanel, {
          target,
          opener: null,
          people: PEOPLE,
          team: "",
          mode: "all",
          summary: SUMMARY,
          onSelectType: noop,
          onClose: noop,
        }),
      );
    for (const key of QUADRANT_ORDER) {
      const html = panel({ kind: "quadrant", quadrant: key });
      const c = q(key);
      expect(Object.fromEntries(styleOf(openTag(html, 'class="hd"'))), key).toEqual({
        "--qc": c.label,
        "--qbg": c.bg,
      });
      expect(Object.fromEntries(styleOf(openTag(html, 'class="bd"'))), key).toEqual({
        "--qd": c.text,
        "--qn": c.typeCount,
      });
    }
    for (const cell of CHARACTER_CELLS) {
      const html = panel({ kind: "type", type: cell.type });
      const c = q(cell.quadrant);
      expect(Object.fromEntries(styleOf(openTag(html, 'class="hd"'))), cell.type).toEqual({
        "--qc": c.label,
        "--qbg": c.bg,
      });
      expect(styleOf(openTag(html, 'class="bd"')).get("--qd"), cell.type).toBe(c.text);
      const pos = html.slice(html.indexOf('class="pos"'));
      expect(styleOf(openTag(pos, "<b")).get("color"), cell.type).toBe(cell.lean.posColor);
      const mini = html.slice(
        html.indexOf('class="mini"'),
        html.indexOf("</div>", html.indexOf('class="mini"')),
      );
      const squares = [...mini.matchAll(/<i style="background:([^"]*)"/g)].map((m) => m[1]);
      expect(squares, cell.type).toEqual([...miniMapColors(cell.type)]);
    }
  });

  it("参照元の色のまま使う用途は置き換えない（全員／在籍／退職の枠と区切り #CDD5DD、割合バーの地、軸の ▲▼ と中央の丸）", () => {
    expect(value(".ob-seg", "border").toUpperCase()).toBe("1PX SOLID #CDD5DD");
    expect(value(".ob-seg button + button", "border-left").toUpperCase()).toBe("1PX SOLID #CDD5DD");
    expect(value(".ob-bar", "background").toUpperCase()).toBe("#EEF1F4");
    expect(value(".ob-ax-y span:first-child::before", "color").toUpperCase()).toBe("#9AA5B1");
    expect(value(".ob-ax-y span:last-child::after", "color").toUpperCase()).toBe("#9AA5B1");
    expect(value(".ob-map::after", "border").toUpperCase()).toBe("3PX SOLID #9AA5B1");
    expect(value(".ob-help", "border").toUpperCase()).toBe("1PX SOLID #CCCCCC");
    // 主色は QUADRANTS の main（SOCIAL_STYLE_DEFINITIONS と同じ。zaiseki-29）で、文字の色には使わない
    for (const key of QUADRANT_ORDER) {
      expect(Object.values(q(key)).filter((v) => v === q(key).main)).toHaveLength(1);
    }
  });
});

describe("（ID なし）§2.19 のコンテナクエリと @media の値（狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）と取得の失敗の文", () => {
  it("本文の幅 1000px 以上: 枠の最小の高さ 156px、イラスト 80×136px", () => {
    expect(decl(rules, ".ob-c", "min-height", WIDE)).toBe("156px");
    expect(decl(rules, ".ob-c img", "width", WIDE)).toBe("80px");
    expect(decl(rules, ".ob-c img", "height", WIDE)).toBe("136px");
    // 既定（1000px 未満）は 132px・62×112
    expect(decl(rules, ".ob-c", "min-height")).toBe("132px");
    expect(decl(rules, ".ob-c img", "width")).toBe("62px");
    expect(decl(rules, ".ob-c img", "height")).toBe("112px");
  });

  it("本文の幅 900px 以下: 集計カードの折り返しと割合の段、凡例 2 列、象限の余白、ピルの % なし、枠は 1 列の縦並び", () => {
    expect(decl(rules, ".ob-sum", "flex-wrap", NARROW)).toBe("wrap");
    expect(decl(rules, ".ob-sum", "gap", NARROW)).toBe("12px 20px");
    expect(decl(rules, ".ob-bal", "flex-basis", NARROW)).toBe("100%");
    expect(decl(rules, ".ob-bal", "order", NARROW)).toBe("3");
    expect(decl(rules, ".ob-leg", "grid-template-columns", NARROW)).toBe("repeat(2, auto)");
    expect(decl(rules, ".ob-leg", "column-gap", NARROW)).toBe("28px");
    expect(decl(rules, ".ob-q", "padding", NARROW)).toBe("10px");
    expect(decl(rules, ".ob-q", "gap", NARROW)).toBe("8px");
    expect(decl(rules, ".ob-qh .nm", "font-size", NARROW)).toBe("19px");
    expect(decl(rules, ".ob-qh .ct", "padding", NARROW)).toBe("5px 10px");
    expect(decl(rules, ".ob-qh .ct b", "font-size", NARROW)).toBe("17px");
    expect(decl(rules, ".ob-qh .ct small", "display", NARROW)).toBe("none");
    expect(decl(rules, ".ob-g", "gap", NARROW)).toBe("6px");
    expect(decl(rules, ".ob-c", "grid-template-columns", NARROW)).toBe("1fr");
    expect(decl(rules, ".ob-c", "min-height", NARROW)).toBe("0");
    expect(decl(rules, ".ob-c", "padding", NARROW)).toBe("8px");
    expect(decl(rules, ".ob-c", "text-align", NARROW)).toBe("center");
    expect(decl(rules, ".ob-c img", "width", NARROW)).toBe("52px");
    expect(decl(rules, ".ob-c img", "height", NARROW)).toBe("88px");
    expect(decl(rules, ".ob-c .who", "font-size", NARROW)).toBe("13.5px");
    expect(decl(rules, ".ob-c .ty", "font-size", NARROW)).toBe("11px");
    expect(decl(rules, ".ob-c .lean", "font-size", NARROW)).toBe("10.5px");
    expect(decl(rules, ".ob-c .lean", "padding", NARROW)).toBe("2px 7px");
    expect(decl(rules, ".ob-c .n b", "font-size", NARROW)).toBe("22px");
  });

  it("本文の幅 520px 以下: 軸の列 22px、軸の文字 11.5px、イラスト 44×74px、日本語名を隠し、カタカナ名 16px、印を折り返す", () => {
    expect(decl(rules, ".ob-wrap", "grid-template-columns", NARROWER)).toBe("22px 1fr");
    expect(decl(rules, ".ob-ax-x", "font-size", NARROWER)).toBe("11.5px");
    expect(decl(rules, ".ob-ax-y", "font-size", NARROWER)).toBe("11.5px");
    expect(decl(rules, ".ob-c img", "width", NARROWER)).toBe("44px");
    expect(decl(rules, ".ob-c img", "height", NARROWER)).toBe("74px");
    expect(decl(rules, ".ob-qh .jp", "display", NARROWER)).toBe("none");
    expect(decl(rules, ".ob-qh .nm", "font-size", NARROWER)).toBe("16px");
    expect(decl(rules, ".ob-c .lean", "white-space", NARROWER)).toBe("normal");
    expect(decl(rules, ".ob-c .lean", "line-height", NARROWER)).toBe("1.3");
    expect(decl(rules, ".ob-c .lean", "font-size", NARROWER)).toBe("10px");
    expect(decl(rules, ".ob-c .lean", "padding", NARROWER)).toBe("2px 6px");
    expect(decl(rules, ".ob-c .who", "font-size", NARROWER)).toBe("12.5px");
    expect(decl(rules, ".ob-c .ty", "font-size", NARROWER)).toBe("10px");
    expect(decl(rules, ".ob-c .ty", "word-break", NARROWER)).toBe("break-all");
  });

  it("画面の幅 600px 以下: 詳細パネルの上部の余白 18px 16px 14px、本文 16px、イラスト 64×112px、4 タイプのボタン 1 列、電話番号の列なし", () => {
    expect(decl(rules, ".ob-panel .hd", "padding", PHONE)).toBe("18px 16px 14px");
    expect(decl(rules, ".ob-panel .bd", "padding", PHONE)).toBe("16px");
    expect(decl(rules, ".ob-panel .hd img", "width", PHONE)).toBe("64px");
    expect(decl(rules, ".ob-panel .hd img", "height", PHONE)).toBe("112px");
    expect(decl(rules, ".ob-panel .types", "grid-template-columns", PHONE)).toBe("1fr");
    expect(decl(rules, ".ob-panel th.tl", "display", PHONE)).toBe("none");
    expect(decl(rules, ".ob-panel td.tl", "display", PHONE)).toBe("none");
    // パネルの幅は画面の幅を超えない、「組織内分類とは」は画面の幅 − 32px を超えない（§1.4 の 6）
    expect(decl(rules, ".ob-panel", "width")).toBe("min(600px, 100vw)");
    expect(decl(rules, ".ob-about", "width")).toBe("700px");
    expect(decl(rules, ".ob-about", "max-width")).toBe("calc(100vw - 32px)");
    expect(decl(rules, ".ob-panel::backdrop", "background")).toBe("none");
  });

  it("取得の失敗の文（§2.1）は 13px・#5F6B78・中央寄せ・上下 40px で、ページの地の上で 4.5:1 以上（今の地 #F3F5F8 でも）", () => {
    expect(decl(rules, ".ob-load-failed", "font-size")).toBe("13px");
    expect(decl(rules, ".ob-load-failed", "padding")).toBe("40px 0");
    expect(decl(rules, ".ob-load-failed", "text-align")).toBe("center");
    const text = color(".ob-load-failed", "color");
    expect(hexOf(text)).toBe("#5F6B78");
    expect(round2(contrastRatio(text, PAGE_BG))).toBe(5.16);
    expect(round2(contrastRatio(text, solid("#F3F5F8")))).toBe(4.98);
  });
});
