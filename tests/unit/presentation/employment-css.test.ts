// M7-zaiseki-47 在籍・退職の配色と焦点の見た目とリンクの 4 つの状態の色（11-3 §2.14〜§2.16・§2.19・§2.20・§2.22・§5.1 の在籍・
// 退職の分、総論 8.3 の配色の取り決め（14〜25））。app/(admin)/admin.css の在籍・退職（.ob-pg）・分析（.ob-root .ret-）・変更ダイアログ
// （.ob-edit）の規則と通知の丸形（.toast--pill）を読み、K-49 の表の 25〜30・K-50 の表の 2 と、届いていて変えない組を WCAG 2 の式で
// 計算する（axe が見ないリンクの訪れたあと・マウス・押している間の色と疑似要素の文字、axe が調べない部品の 3:1 をここで確かめる）。
// ページの地は 11-8 §4.5 に従い #F7F9FC として計算する。ただし、ページの地の上の 3 つの文字（K-49 の表の 25・27・30）は、PR-7.13a までは
// 今の .admin-root の地 #F3F5F8 の上で同じ方法で選んだ色（11-3 §2.22 の 1.2 版、総論 8.5）なので、今の地と #F7F9FC の両方で確かめる
// （最後のテスト。PR-7.13a で表の値に戻す）。一覧のタイプの丸と退職の割合の棒は部品が style 属性で置くので、部品を見本の人で
// renderToStaticMarkup して確かめる。あわせて §2.19 のコンテナクエリの値（狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）と規則の範囲。
// 組織内分類の分（K-49 の表の 1〜24、K-50 の表の 1・3）は classification-css.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  contrastRatio,
  decl,
  findDecl,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  specificity,
  variablesOf,
  type Rgb,
} from "./css-rules";
import { EmploymentList } from "@/components/admin/employment/EmploymentList";
import { RetentionAnalysis } from "@/components/admin/employment/RetentionAnalysis";
import { QUADRANT_ORDER, QUADRANTS } from "@/lib/presentation/classification-view";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";
import type { EmploymentPersonDto } from "@/lib/services/dto/admin";

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
const color = (selector: string, property: string, at: string | null = null) =>
  solid(value(selector, property, at));
/** 「1px solid #xxxxxx」の色 */
const lineColor = (selector: string, property: string) =>
  solid(value(selector, property).replace(/^\d+px (solid|dashed) /, ""));

const WHITE: Rgb = [255, 255, 255];
/** ページの地（11-8 §4.5 の --adm-page-bg。今の .admin-root の地 #F3F5F8 は PR-7.13a で #F7F9FC になる） */
const PAGE_BG = solid("#F7F9FC");
/** 11-8 の PR-7.13a までの今のページの地（.admin-root の --admin-bg） */
const PAGE_BG_NOW = solid("#F3F5F8");
/**
 * PR-7.13a までの今のページの地の上で選んだ 3 つの色（11-3 §2.22 の 1.2 版。K-49 の表の 25・27・30 の値は #F7F9FC の上の色で、
 * 今の地の上では届かない）。PR-7.13a で地を #F7F9FC にするときに、表の値（#6A7480・#2E7A94・var(--mut-pale)）に戻す
 */
const NOW_HD = "#66717C";
const NOW_GO = "#2E7992";
const NOW_FT = "#66717D";
/** .ob-root の輪郭（参照元の ob-map の焦点の指定） */
const ROOT_OUTLINE = "2px solid #1f2933";
/** 管理画面に共通の焦点の枠（11-8 §2.2.6・別表A の 1） */
const COMMON_FOCUS = ":where(.admin-root, .adm-focus-scope) :focus-visible";
const COMMON_RING = "2px solid #3f8da5";

const NARROW_LIST = "@container (max-width: 700px)";
const NARROW_TABLE = "@container (max-width: 760px)";

/** 「回答一覧を開く →」の 4 つの状態の指定（§2.22 の「リンクの色」） */
const LINK_STATES = [
  ".ob-pg .pg-go:link",
  ".ob-pg .pg-go:visited",
  ".ob-pg .pg-go:hover",
  ".ob-pg .pg-go:active",
] as const;

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

// ---- 見本の人（架空。4 分類から 1 タイプずつ。退職 2・在籍 2・求職者 1）
const person = (
  index: number,
  aptitudeType: AptitudeTypeKey,
  employmentStatus: EmploymentPersonDto["employmentStatus"],
  hiredOn: string | null,
  leftOn: string | null,
): EmploymentPersonDto => ({
  resultId: `ResSample${String(index).padStart(11, "0")}`,
  respondentId: `RspSample${String(index).padStart(11, "0")}`,
  aptitudeType,
  name: `テストテスト ${String(index).padStart(2, "0")}`,
  occupationLabel: "アイリスト",
  teamCode: null,
  submittedAt: `2026-09-${String(index).padStart(2, "0")}T00:00:00.000Z`,
  employmentStatus,
  hiredOn,
  leftOn,
});
const TODAY = "2026-11-10";
const PEOPLE: readonly EmploymentPersonDto[] = [
  person(1, "scientist", "left", "2025-04-01", "2026-03-31"),
  person(2, "pioneer", "employed", "2024-04-01", null),
  person(3, "conductor", "left", null, "2026-10-29"),
  person(4, "freelancer", "employed", null, null),
  person(5, "freelancer", "candidate", null, null),
];
/** 見本の人の分類（タイプの所属分類） */
const QUADRANT_OF: Readonly<Record<string, SocialStyleKey>> = {
  scientist: "analytical",
  pioneer: "driving",
  conductor: "amiable",
  freelancer: "expressive",
};

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

describe("M7-zaiseki-47 K-49・K-50 で変えた色と形の値（在籍・退職の分。11-3 §2.22）", () => {
  it("一覧の見出しの行 #66717C（PR-7.13a までの今の地の色）、「—」と狭い幅のラベル #6B7885、「回答一覧を開く →」#2E7992（同）、日付の入力欄の枠 #8297AC（参照元の色から変えた）", () => {
    expect(value(".ob-pg .pg-row.hd", "color").toUpperCase()).toBe(NOW_HD);
    expect(value(".ob-pg .pg-mu", "color").toUpperCase()).toBe("#6B7885");
    expect(value(".ob-pg .pg-lb", "color").toUpperCase()).toBe("#6B7885");
    expect(value(".ob-pg .pg-go", "color").toUpperCase()).toBe(NOW_GO);
    expect(value(".ob-edit input", "border").toUpperCase()).toBe("1PX SOLID #8297AC");
  });

  it("分析: 数字のカードの補足・「参考」・狭い幅の勤続のラベルは var(--mut)（#6C7784）、勤続未入力者のカードの補足は var(--mut-pale)（#697380）、脚注は #66717D（PR-7.13a までの今の地の色。PR-7.13a で var(--mut-pale) に戻す）", () => {
    expect(vars.get("--mut")?.toUpperCase()).toBe("#6C7784");
    expect(vars.get("--mut-pale")?.toUpperCase()).toBe("#697380");
    expect(decl(rules, ".ob-root .ret-k .s", "color")).toBe("var(--mut)");
    expect(decl(rules, ".ob-root .ret-bar small", "color")).toBe("var(--mut)");
    expect(decl(rules, ".ob-root .ret-r .c5::before", "color", NARROW_TABLE)).toBe("var(--mut)");
    expect(decl(rules, ".ob-root .ret-r .c6::before", "color", NARROW_TABLE)).toBe("var(--mut)");
    expect(decl(rules, ".ob-root .ret-k.warn .s", "color")).toBe("var(--mut-pale)");
    expect(decl(rules, ".ob-root .ret-ft", "color").toUpperCase()).toBe(NOW_FT);
  });

  it("「回答一覧を開く →」: :link・:visited・:hover・:active の色が #2E7992 で、どれも .admin-root a より強い。下線を引く宣言が無い（text-decoration none）", () => {
    const adminLink = specificity(".admin-root a");
    expect(decl(rules, ".admin-root a", "color")).toBe("var(--admin-primary)");
    for (const selector of LINK_STATES) {
      expect(value(selector, "color").toUpperCase(), selector).toBe(NOW_GO);
      expect(compareSpecificity(specificity(selector), adminLink), selector).toBeGreaterThan(0);
      expect(findDecl(rules, selector, "text-decoration"), selector).toBeUndefined();
    }
    expect(compareSpecificity(specificity(".ob-pg .pg-go"), adminLink)).toBeGreaterThan(0);
    expect(decl(rules, ".ob-pg .pg-go", "text-decoration")).toBe("none");
    // ふだん・4 つの状態のどれにも下線を引く宣言が無い（ブラウザの既定の下線は .ob-pg .pg-go の none が消す）
    for (const rule of rules) {
      if (!rule.selectors.some((s) => s.includes(".pg-go"))) continue;
      expect(rule.declarations.get("text-decoration") ?? "none", rule.selectors.join(",")).toBe(
        "none",
      );
    }
  });

  it("焦点: 変更ダイアログの中の部品は .ob-edit :focus-visible（2px solid #3F8DA5・外へ 2px）で共通の焦点の枠以上の詳細度。タブと「変更」は .ob-root button:focus-visible（#1F2933）", () => {
    expect(decl(rules, COMMON_FOCUS, "outline")).toBe(COMMON_RING);
    expect(decl(rules, ".ob-edit :focus-visible", "outline")).toBe(COMMON_RING);
    expect(decl(rules, ".ob-edit :focus-visible", "outline-offset")).toBe("2px");
    expect(
      compareSpecificity(specificity(".ob-edit :focus-visible"), specificity(COMMON_FOCUS)),
    ).toBeGreaterThanOrEqual(0);
    // 組織内分類の 2 つのダイアログと同じ規則に書く
    const rule = rules.find(
      (r) => r.at === null && r.selectors.includes(".ob-edit :focus-visible"),
    );
    expect(rule?.selectors).toEqual([
      ".ob-panel :focus-visible",
      ".ob-about :focus-visible",
      ".ob-edit :focus-visible",
    ]);
    expect(decl(rules, ".ob-root button:focus-visible", "outline")).toBe(ROOT_OUTLINE);
    expect(decl(rules, ".ob-root button:focus-visible", "outline-offset")).toBe("2px");
  });

  it("焦点: 在籍・退職のどの規則（.ob-pg・.ob-root .ob-ret と .ret-・.ob-edit の中の部品）にも outline が無い（「回答一覧を開く →」は共通の焦点の枠、タブと「変更」は .ob-root の輪郭が効く）", () => {
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        const isEmployment =
          selector.startsWith(".ob-pg") ||
          /\.ob-ret|\.ret-/.test(selector) ||
          (selector.startsWith(".ob-edit") && selector !== ".ob-edit :focus-visible");
        if (!isEmployment) continue;
        expect(rule.declarations.has("outline"), selector).toBe(false);
        expect(rule.declarations.has("outline-offset"), selector).toBe(false);
      }
    }
  });

  it("通知の丸形 .toast--pill: 角丸 999px・内側の余白 10px 18px・13px・太さ 700・行間 1。位置と色は .toast-region と .toast のまま", () => {
    expect(decl(rules, ".toast--pill", "border-radius")).toBe("999px");
    expect(decl(rules, ".toast--pill", "padding")).toBe("10px 18px");
    expect(decl(rules, ".toast--pill", "font-size")).toBe("13px");
    expect(decl(rules, ".toast--pill", "font-weight")).toBe("700");
    expect(decl(rules, ".toast--pill", "line-height")).toBe("1");
    for (const property of ["background", "color", "position", "bottom"]) {
      expect(findDecl(rules, ".toast--pill", property), property).toBeUndefined();
    }
    expect(decl(rules, ".toast-region", "bottom")).toBe("28px");
    expect(decl(rules, ".toast-region", "left")).toBe("50%");
    expect(value(".toast", "background").toUpperCase()).toBe("#1F2933");
    expect(value(".toast", "color").toUpperCase()).toBe("#FFFFFF");
  });
});

describe("M7-zaiseki-47 K-49 の表の 25〜30（文字 4.5:1。ページの地の上の 25・27・30 は今の地 #F3F5F8 と #F7F9FC の両方）", () => {
  it("25〜30 の組の比（参照元の色は 3.05〜4.48:1 で届かない）", () => {
    const go = color(".ob-pg .pg-go", "color");
    expectRatios(
      [
        [
          "25 一覧の見出しの行／今のページの地",
          color(".ob-pg .pg-row.hd", "color"),
          PAGE_BG_NOW,
          4.56,
        ],
        ["25 一覧の見出しの行／#F7F9FC", color(".ob-pg .pg-row.hd", "color"), PAGE_BG, 4.72],
        ["26 「—」／行の白", color(".ob-pg .pg-mu", "color"), WHITE, 4.52],
        ["26 狭い幅のラベル／行の白", color(".ob-pg .pg-lb", "color"), WHITE, 4.52],
        ["27 「回答一覧を開く →」／今のページの地", go, PAGE_BG_NOW, 4.51],
        ["27 「回答一覧を開く →」／#F7F9FC", go, PAGE_BG, 4.67],
        ["28 数字のカードの補足／白", color(".ob-root .ret-k .s", "color"), WHITE, 4.56],
        ["28 「参考」／表の白", color(".ob-root .ret-bar small", "color"), WHITE, 4.56],
        [
          "28 狭い幅の勤続（退職した人）のラベル／表の白",
          color(".ob-root .ret-r .c5::before", "color", NARROW_TABLE),
          WHITE,
          4.56,
        ],
        [
          "28 狭い幅の勤続（在籍中）のラベル／表の白",
          color(".ob-root .ret-r .c6::before", "color", NARROW_TABLE),
          WHITE,
          4.56,
        ],
        [
          "29 勤続未入力者のカードの補足／カードの地",
          color(".ob-root .ret-k.warn .s", "color"),
          color(".ob-root .ret-k.warn", "background"),
          4.51,
        ],
        ["30 脚注／今のページの地", color(".ob-root .ret-ft", "color"), PAGE_BG_NOW, 4.55],
        ["30 脚注／#F7F9FC", color(".ob-root .ret-ft", "color"), PAGE_BG, 4.71],
      ],
      4.5,
    );
    // 行・カード・表の地は白、勤続未入力者のカードの地は #FFF7E6
    expect(color(".ob-pg .pg-row", "background")).toEqual(WHITE);
    expect(color(".ob-root .ret-k", "background")).toEqual(WHITE);
    expect(color(".ob-root .ret-tb", "background")).toEqual(WHITE);
    expect(value(".ob-root .ret-k.warn", "background").toUpperCase()).toBe("#FFF7E6");
    // 見出しの行は地も枠も持たない（ページの地の上）
    expect(value(".ob-pg .pg-row.hd", "background")).toBe("transparent");
    // 参照元の色（#7A8591・#8A95A1・#2F7C96・#7A8592）は届かない
    const reference: ReadonlyArray<readonly [string, string, Rgb, number]> = [
      ["25", "#7A8591", PAGE_BG, 3.56],
      ["26", "#8A95A1", WHITE, 3.05],
      ["27", "#2F7C96", PAGE_BG, 4.48],
      ["28", "#7A8592", WHITE, 3.75],
      ["29", "#7A8592", solid("#FFF7E6"), 3.52],
      ["30", "#7A8592", PAGE_BG, 3.56],
    ];
    for (const [label, hex, back, expected] of reference) {
      const r = contrastRatio(solid(hex), back);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeLessThan(4.5);
    }
  });

  it("27 「回答一覧を開く →」は、ふだん・:link・:visited・:hover・:active の 5 つの宣言とも #2E7992 で、今のページの地の上で 4.51:1・#F7F9FC の上で 4.67:1（axe が見ない訪れたあと・マウス・押している間の色）", () => {
    for (const selector of [".ob-pg .pg-go", ...LINK_STATES]) {
      expect(round2(contrastRatio(color(selector, "color"), PAGE_BG_NOW)), selector).toBe(4.51);
      expect(round2(contrastRatio(color(selector, "color"), PAGE_BG)), selector).toBe(4.67);
    }
  });

  it("届いていて変えない文字（タブ・区分のボタン・「やめる」「保存する」「変更」・説明・0 人の文・分析の文字・注意書き・エラー・通知）", () => {
    const sub = solid("var(--sub)");
    expect(value(".ob-root .ret-k .k", "color")).toBe("#5f6b78");
    expectRatios(
      [
        ["「変更」#2F7C96／白", color(".ob-pg .pg-ed button", "color"), WHITE, 4.73],
        [
          "「保存する」白／#2F7C96",
          color(".ob-edit .pgd-b button.ok", "color"),
          color(".ob-edit .pgd-b button.ok", "background"),
          4.73,
        ],
        [
          "「やめる」#3A4651／#EDF0F3",
          color(".ob-edit .pgd-b button", "color"),
          color(".ob-edit .pgd-b button", "background"),
          8.44,
        ],
        [
          "タブ #3A4651／白",
          color(".ob-pg .pg-tabs button", "color"),
          color(".ob-pg .pg-tabs button", "background"),
          9.66,
        ],
        [
          "区分のボタン #3A4651／白",
          color(".ob-edit .pgd-seg button", "color"),
          color(".ob-edit .pgd-seg button", "background"),
          9.66,
        ],
        [
          "選択中のタブの白い文字／#1F2933",
          color(".ob-pg .pg-tabs button.on", "color"),
          color(".ob-pg .pg-tabs button.on", "background"),
          14.76,
        ],
        [
          "選択中の区分のボタンの白い文字／#1F2933",
          color(".ob-edit .pgd-seg button.on", "color"),
          color(".ob-edit .pgd-seg button.on", "background"),
          14.76,
        ],
        ["説明 .pg-sub／ページの地", color(".ob-pg .pg-sub", "color"), PAGE_BG, 5.16],
        ["0 人の文 .pg-emp／白", color(".ob-pg .pg-emp", "color"), WHITE, 5.44],
        ["カードの項目名 .ret-k .k／白", color(".ob-root .ret-k .k", "color"), WHITE, 5.44],
        [
          "カードの「人」.ret-k .v small／白",
          color(".ob-root .ret-k .v small", "color"),
          WHITE,
          5.44,
        ],
        ["ひらがな名 .ret-who span／白", color(".ob-root .ret-who span", "color"), WHITE, 5.44],
        ["分析の説明 .ret-h p／ページの地", color(".ob-root .ret-h p", "color"), PAGE_BG, 5.16],
        ["変更ダイアログの説明 .pgd-s／白", color(".ob-edit .pgd-s", "color"), WHITE, 5.44],
        [
          "勤続未入力者のカードの項目名と「人」／#FFF7E6",
          sub,
          color(".ob-root .ret-k.warn", "background"),
          5.1,
        ],
        [
          "表の見出しの行 .ret-r.hd／#F6F8FA",
          color(".ob-root .ret-r.hd", "color"),
          color(".ob-root .ret-r.hd", "background"),
          5.11,
        ],
        [
          "注意書き .ret-note／#FFF7E6",
          color(".ob-root .ret-note", "color"),
          color(".ob-root .ret-note", "background"),
          5.56,
        ],
        [
          "エラー .pgd-e／白",
          color(".ob-edit .pgd-e", "color"),
          color(".ob-edit .pgd-card", "background"),
          5.44,
        ],
        [
          "通知の丸形の白い文字／#1F2933",
          color(".toast", "color"),
          color(".toast", "background"),
          14.76,
        ],
      ],
      4.5,
    );
  });
});

describe("M7-zaiseki-47 K-50 の表の 2 と、届いていて変えない部品（部品 3:1。外の地と中の地の両方）", () => {
  it("K-50 の 2: 変更ダイアログの日付の入力欄の枠 #8297AC は、外のカードの白とも欄の中の白とも 3.01:1（参照元の #D5DCE3 は 1.38:1）", () => {
    const line = lineColor(".ob-edit input", "border");
    expectRatios(
      [
        ["枠／カードの白", line, color(".ob-edit .pgd-card", "background"), 3.01],
        ["枠／欄の中の白", line, color(".ob-edit input", "background"), 3.01],
      ],
      3,
    );
    expect(round2(contrastRatio(solid("#D5DCE3"), WHITE))).toBe(1.38);
  });

  it("焦点の枠: 変更ダイアログの中の部品は #3F8DA5（ダイアログの白と 3.77:1）、「回答一覧を開く →」は共通の枠（ページの地と 3.58:1、今の地と 3.46:1）、タブと「変更」は #1F2933（ページの地 13.99:1・白 14.76:1）", () => {
    const ring = solid("#3F8DA5");
    const outline = solid("#1F2933");
    expectRatios(
      [
        ["共通の枠／ダイアログの白", ring, color(".ob-edit .pgd-card", "background"), 3.77],
        ["共通の枠／ページの地", ring, PAGE_BG, 3.58],
        ["共通の枠／今のページの地", ring, PAGE_BG_NOW, 3.46],
        ["タブと「変更」の輪郭／ページの地", outline, PAGE_BG, 13.99],
        ["タブと「変更」の輪郭／今のページの地", outline, PAGE_BG_NOW, 13.51],
        ["タブと「変更」の輪郭／白", outline, WHITE, 14.76],
      ],
      3,
    );
  });

  it("選択中の印: タブと区分のボタンの選択中の地 #1F2933 はページの地と 13.99:1・白と 14.76:1", () => {
    const tabOn = color(".ob-pg .pg-tabs button.on", "background");
    const segOn = color(".ob-edit .pgd-seg button.on", "background");
    expect(tabOn).toEqual(solid("#1F2933"));
    expect(segOn).toEqual(tabOn);
    expect(lineColor(".ob-pg .pg-tabs button", "border")).toEqual(solid("#D5DCE3"));
    expectRatios(
      [
        ["選択中のタブ／ページの地", tabOn, PAGE_BG, 13.99],
        ["選択中の区分のボタン／カードの白", segOn, WHITE, 14.76],
      ],
      3,
    );
  });
});

describe("M7-zaiseki-47 参照元の色のまま使う用途（部品を見本の人で描いて style 属性を読む）", () => {
  it("一覧のタイプの丸は分類の濃い色（QUADRANTS[].colors.dark）で、text の色に置き換わっていない。丸は読み上げない", () => {
    for (const tab of ["stay", "left", "seek"] as const) {
      const html = renderToStaticMarkup(
        createElement(EmploymentList, {
          tab,
          people: PEOPLE,
          today: TODAY,
          pending: new Set<string>(),
          onEdit: noop,
        }),
      );
      for (const p of PEOPLE) {
        const row = html.slice(html.indexOf(`data-testid="em-row-${p.resultId}"`));
        const dot = openTag(row, "<i ");
        const quadrant = QUADRANT_OF[p.aptitudeType] as SocialStyleKey;
        expect(styleOf(dot).get("background"), `${tab} ${p.aptitudeType}`).toBe(
          QUADRANTS[quadrant].colors.dark,
        );
        expect(dot, p.aptitudeType).toContain('aria-hidden="true"');
      }
    }
    expect(QUADRANT_ORDER.map((key) => QUADRANTS[key].colors.dark)).toEqual([
      "#2F8A63",
      "#7A5788",
      "#2F7C96",
      "#A8791F",
    ]);
    // text と違う分類（アナリティカル・エクスプレッシブ）でも dark のまま
    expect(QUADRANTS.analytical.colors.text).not.toBe(QUADRANTS.analytical.colors.dark);
    expect(QUADRANTS.expressive.colors.text).not.toBe(QUADRANTS.expressive.colors.dark);
  });

  it("退職の割合の棒の地は分類の濃い色、幅は割合 %（CSS で描く棒。10 K-23）", () => {
    const html = renderToStaticMarkup(
      createElement(RetentionAnalysis, { people: PEOPLE, today: TODAY, teamPrefix: "" }),
    );
    const expected: Readonly<Record<string, string>> = {
      scientist: "100%",
      pioneer: "0%",
      conductor: "100%",
      freelancer: "0%",
    };
    for (const [type, width] of Object.entries(expected)) {
      const row = html.slice(html.indexOf(`data-testid="ret-row-${type}"`));
      const bar = styleOf(openTag(row, "<u "));
      const quadrant = QUADRANT_OF[type] as SocialStyleKey;
      expect(bar.get("background"), type).toBe(QUADRANTS[quadrant].colors.dark);
      expect(bar.get("width"), type).toBe(width);
    }
    // 求職者だけのタイプは行にならない（freelancer は在籍 1 人の行）
    expect(html.match(/data-testid="ret-row-/g)).toHaveLength(4);
  });

  it("「変更」の文字と「保存する」の地は #2F7C96 のまま（白の上で届く。#2E7A94 の「回答一覧を開く →」とは別）", () => {
    expect(value(".ob-pg .pg-ed button", "color").toUpperCase()).toBe("#2F7C96");
    expect(value(".ob-edit .pgd-b button.ok", "background").toUpperCase()).toBe("#2F7C96");
    // 枠・地のうち参照元のまま使うもの（文字のボタンの枠、0 人の点線の枠、勤続未入力者のカードと注意書きの枠、棒の溝）
    expect(value(".ob-pg .pg-ed button", "border").toUpperCase()).toBe("1PX SOLID #D5DCE3");
    expect(value(".ob-edit .pgd-seg button", "border").toUpperCase()).toBe("1PX SOLID #D5DCE3");
    expect(value(".ob-pg .pg-emp", "border").toUpperCase()).toBe("1PX DASHED #D5DCE3");
    expect(value(".ob-root .ret-k.warn", "border-color").toUpperCase()).toBe("#F3DDA8");
    expect(value(".ob-root .ret-note", "border").toUpperCase()).toBe("1PX SOLID #F3DDA8");
    expect(value(".ob-root .ret-bar i", "background").toUpperCase()).toBe("#EDF0F3");
    expect(value(".ob-root .ret-who img", "background").toUpperCase()).toBe("#EEF2F5");
    expect(decl(rules, ".ob-edit::backdrop", "background")).toBe("rgba(15, 23, 32, 0.45)");
  });
});

describe("（ID なし）§2.19 のコンテナクエリの値（狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）と、§2.13〜§2.16 の形", () => {
  it("本文の幅 700px 以下（一覧）: 行は 2 列、見出しの行を隠す、h1 20px、値の前のラベルを出す、お名前と「変更」は行の幅いっぱい（「変更」は右寄せ）", () => {
    expect(decl(rules, ".ob-pg .pg-row", "grid-template-columns", NARROW_LIST)).toBe("1fr 1fr");
    expect(decl(rules, ".ob-pg .pg-row.hd", "display", NARROW_LIST)).toBe("none");
    expect(decl(rules, ".ob-pg h1", "font-size", NARROW_LIST)).toBe("20px");
    expect(decl(rules, ".ob-pg .pg-lb", "display", NARROW_LIST)).toBe("inline");
    expect(decl(rules, ".ob-pg .pg-nm", "grid-column", NARROW_LIST)).toBe("1/-1");
    expect(decl(rules, ".ob-pg .pg-ed", "grid-column", NARROW_LIST)).toBe("1/-1");
    expect(decl(rules, ".ob-pg .pg-ed", "text-align", NARROW_LIST)).toBe("right");
    // 広い幅は 6 列、ラベルは隠す、h1 24px
    expect(decl(rules, ".ob-pg .pg-row", "grid-template-columns")).toBe(
      "minmax(120px, 1.4fr) minmax(120px, 1.2fr) minmax(90px, 1fr) minmax(90px, 1fr) 90px 72px",
    );
    expect(decl(rules, ".ob-pg .pg-lb", "display")).toBe("none");
    expect(decl(rules, ".ob-pg h1", "font-size")).toBe("24px");
  });

  it("本文の幅 760px 以下（分析の表）: 3 列（1fr 48px 48px）・縦の間隔 6px、見出しの行の c4〜c6 を隠し、c4〜c6 は次の行で幅いっぱい、勤続の行は左に 12px のラベル", () => {
    expect(decl(rules, ".ob-root .ret-r", "grid-template-columns", NARROW_TABLE)).toBe(
      "1fr 48px 48px",
    );
    expect(decl(rules, ".ob-root .ret-r", "row-gap", NARROW_TABLE)).toBe("6px");
    for (const c of ["c4", "c5", "c6"]) {
      expect(decl(rules, `.ob-root .ret-r.hd .${c}`, "display", NARROW_TABLE), c).toBe("none");
      expect(decl(rules, `.ob-root .ret-r .${c}`, "grid-column", NARROW_TABLE), c).toBe("1/-1");
    }
    for (const c of ["c5", "c6"]) {
      expect(decl(rules, `.ob-root .ret-r .${c}`, "display", NARROW_TABLE), c).toBe("flex");
      expect(decl(rules, `.ob-root .ret-r .${c}`, "justify-content", NARROW_TABLE), c).toBe(
        "space-between",
      );
      expect(decl(rules, `.ob-root .ret-r .${c}::before`, "font-size", NARROW_TABLE), c).toBe(
        "12px",
      );
    }
    expect(decl(rules, ".ob-root .ret-r .c5::before", "content", NARROW_TABLE)).toBe(
      '"勤続（退職した人）"',
    );
    expect(decl(rules, ".ob-root .ret-r .c6::before", "content", NARROW_TABLE)).toBe(
      '"勤続（在籍中）"',
    );
    // 広い幅は 6 列
    expect(decl(rules, ".ob-root .ret-r", "grid-template-columns")).toBe(
      "minmax(150px, 1.3fr) 56px 56px minmax(140px, 1.6fr) 110px 110px",
    );
  });

  it("切り替えは本文の幅（@container。参照元は @media）で、在籍・退職の規則を画面の幅で切り替えない", () => {
    for (const rule of rules) {
      if (rule.at === null || !rule.at.startsWith("@media")) continue;
      for (const selector of rule.selectors) {
        expect(selector, `${rule.at} ${selector}`).not.toMatch(/\.ob-pg|\.pg-|\.ret-|\.ob-edit/);
      }
    }
    expect(decl(rules, ".ob-root", "container-type")).toBe("inline-size");
  });

  it("変更ダイアログ: 幅は画面の幅 − 32px で最大 380px、内側の余白 0（カードが要素いっぱい）、背景は rgba(15,23,32,.45)", () => {
    expect(decl(rules, ".ob-edit", "width")).toBe("calc(100% - 32px)");
    expect(decl(rules, ".ob-edit", "max-width")).toBe("380px");
    expect(decl(rules, ".ob-edit", "padding")).toBe("0");
    expect(decl(rules, ".ob-edit .pgd-card", "width")).toBe("100%");
    expect(decl(rules, ".ob-edit", "line-height")).toBe("1");
    expect(decl(rules, ".ob-edit", "font-size")).toBe("16px");
  });

  it("分析のイラストは 38px の丸（上寄せで切り抜く・地 #EEF2F5）、割合の棒の溝は 10px", () => {
    expect(decl(rules, ".ob-root .ret-who img", "width")).toBe("38px");
    expect(decl(rules, ".ob-root .ret-who img", "height")).toBe("38px");
    expect(decl(rules, ".ob-root .ret-who img", "border-radius")).toBe("50%");
    expect(decl(rules, ".ob-root .ret-who img", "object-fit")).toBe("cover");
    expect(decl(rules, ".ob-root .ret-who img", "object-position")).toBe("top");
    expect(decl(rules, ".ob-root .ret-bar i", "height")).toBe("10px");
    expect(decl(rules, ".ob-root .ret-bar i u", "position")).toBe("absolute");
  });

  it("規則の範囲: .pg- は .ob-pg の下、.ret-（と .ob-ret）は .ob-root の下、.pgd- は .ob-edit の下だけ。.ob-pg・.ob-edit は規則の根", () => {
    let count = 0;
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (/\.pg-/.test(selector)) {
          expect(selector, selector).toMatch(/^\.ob-pg \.pg-/);
          count += 1;
        }
        if (/\.ret-|\.ob-ret/.test(selector)) {
          expect(selector, selector).toMatch(/^\.ob-root \.(ret-|ob-ret)/);
          count += 1;
        }
        if (/\.pgd-/.test(selector)) {
          expect(selector, selector).toMatch(/^\.ob-edit \.pgd-/);
          count += 1;
        }
        if (/\.ob-pg/.test(selector)) expect(selector, selector).toMatch(/^\.ob-pg\b/);
        if (/\.ob-edit/.test(selector)) expect(selector, selector).toMatch(/^\.ob-edit\b/);
      }
    }
    expect(count).toBeGreaterThan(50);
  });
});

describe("（ID なし）PR-7.13a までの今のページの地 #F3F5F8 で選んだ 3 つの色（11-3 §2.22 の 1.2 版、総論 8.5。PR-7.13a で表の値に戻し、このテストを改める）", () => {
  it("今の地は #F3F5F8。表の値（#F7F9FC で選んだ #6A7480・#2E7A94・#697380）は今の地で 4.35・4.44・4.41 と届かないので、今の地で届く最初の色にした（1 段手前の色は届かない）", () => {
    expect(decl(rules, ".admin-root", "background")).toBe("var(--admin-bg)");
    expect(decl(rules, ".admin-root", "--admin-bg")).toBe("#f3f5f8");
    const table: ReadonlyArray<readonly [string, string, number, number]> = [
      ["25 一覧の見出しの行", "#6A7480", 4.35, 4.5],
      ["27 「回答一覧を開く →」", "#2E7A94", 4.44, 4.6],
      ["30 分析の脚注", "#697380", 4.41, 4.56],
    ];
    for (const [label, hex, now, future] of table) {
      const rNow = contrastRatio(solid(hex), PAGE_BG_NOW);
      expect(round2(rNow), label).toBe(now);
      expect(rNow, label).toBeLessThan(4.5);
      expect(round2(contrastRatio(solid(hex), PAGE_BG)), label).toBe(future);
    }
    // 選んだ色の 1 段手前（HSL の明度を 0.5% 戻した色）は今の地で届かない
    const previous: ReadonlyArray<readonly [string, string, number]> = [
      ["25 の 1 段手前", "#68727D", 4.48],
      ["27 の 1 段手前", "#2E7A94", 4.44],
      ["30 の 1 段手前", "#67727E", 4.49],
    ];
    for (const [label, hex, expected] of previous) {
      const r = contrastRatio(solid(hex), PAGE_BG_NOW);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeLessThan(4.5);
    }
    // ほかのページの地の上の文字は今の地でも届く（説明・分析の説明・取得の失敗の文）
    expect(round2(contrastRatio(color(".ob-pg .pg-sub", "color"), PAGE_BG_NOW))).toBe(4.98);
    expect(round2(contrastRatio(color(".ob-root .ret-h p", "color"), PAGE_BG_NOW))).toBe(4.98);
  });
});
