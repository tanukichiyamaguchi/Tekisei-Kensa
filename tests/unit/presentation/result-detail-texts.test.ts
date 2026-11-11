// M7-result-16（RESULT_DETAIL_TEXTS の分。11-4 §5.1）と、結果詳細の表示用の定数（11-4 §3.4: RISK_RESULT_LABELS・RESULT_SECTIONS・
// TRAIT_ICONS・DETAIL_CATEGORY_ICONS とアイコンの名前）。文言は 11-4 §2（仕様）にそのままの文字で書かれていること（差し込みのある
// 文言は §2.20 の形に見本の値を入れたものと同じになること）、K-19 で置き換える語が無いこと、参照元の文字（〜・—・＞・全角空白）の
// ままであることを確かめる。定数の期待値は 11-4 §2.2・§2.9・§2.10・§2.19・別表E を読んで作る（組織内分類の M7-zaiseki-04 と同じ
// 書き方）。文言マスタ（別表A〜C）の確かめは tests/unit/masters/texts.test.ts。接し方の見出しの確かめは PR-7.8b
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import { TRAIT_DETAIL_CATEGORY_KEYS } from "@/lib/masters/texts";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import {
  DETAIL_CATEGORY_ICONS,
  RESULT_DETAIL_TEXTS as T,
  RESULT_ICON_NAMES,
  RESULT_SECTIONS,
  RISK_RESULT_LABELS,
  TRAIT_ICONS,
} from "@/lib/presentation/result-detail-texts";
import { RESULT_SECTION_IDS } from "@/lib/presentation/result-view-state";
import { RISK_KEYS, TRAIT_KEYS } from "@/lib/scoring/types";

const SPEC = readFileSync(
  fileURLToPath(
    new URL("../../../docs/基本設計/11_参照元の更新/11-4_結果詳細.md", import.meta.url),
  ),
  "utf8",
);

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

/** 11-4 の 2 章（仕様） */
const SECTION_2 = between(SPEC, "## 2. 仕様", "## 3. ");
/** §2.20 の文言の一覧 */
const SECTION_2_20 = between(SPEC, "### 2.20 ", "### 2.21 ");

/** 文言の定数の文字（関数を除く）をすべて取り出す */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(stringLeaves);
  return [];
}

/** 文言の定数のうち関数の道筋（"toc.name" など） */
function functionPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") return [prefix];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, v]) =>
      functionPaths(v, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  return [];
}

/** §2.20 などの形（「{氏名} さん」）の {…} に見本の値を入れる */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([^}]+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/**
 * 差し込みのある文言: [道筋, 見本の値で呼んだ結果, 仕様書の形, 形に入れる見本の値]。title（ADMIN_TEXTS.resultTitle を参照）は
 * 別のテスト
 */
const TEMPLATES: ReadonlyArray<
  readonly [string, string, string, Readonly<Record<string, string | number>>]
> = [
  ["percent", T.percent(80), "{n}%", { n: 80 }],
  ["toc.name", T.toc.name("テストテスト 01"), "{氏名} さん", { 氏名: "テストテスト 01" }],
  ["toc.examDate", T.toc.examDate("2026/4/5"), "{受験日} 受験", { 受験日: "2026/4/5" }],
  [
    "noComparison.empty",
    T.noComparison.empty("Aチーム"),
    "「{比較組織名}」には比べられる回答がありません",
    { 比較組織名: "Aチーム" },
  ],
  [
    "overview.aptitude",
    T.overview.aptitude("人を活躍させる仕事"),
    "{適性}に適性があります。",
    { 適性: "人を活躍させる仕事" },
  ],
  [
    "overview.matchNote",
    T.overview.matchNote("組織全体", 59),
    "{比較組織名}（{n}人）と比べた近さ",
    { 比較組織名: "組織全体", n: 59 },
  ],
  [
    "overview.big",
    T.overview.big("コミュニケーション力", "26.5"),
    "{特性名}\u3000{点数}", // 間は全角の空白
    { 特性名: "コミュニケーション力", 点数: "26.5" },
  ],
  [
    "traits.average",
    T.traits.average("組織全体", 12),
    "{比較組織名}の平均（{n}人）",
    { 比較組織名: "組織全体", n: 12 },
  ],
  ["traits.subjectPoints", T.traits.subjectPoints("23"), "本人 {値}点", { 値: "23" }],
  [
    "traits.legendAverage",
    T.traits.legendAverage("組織全体"),
    "サロン平均（{比較組織名}）",
    { 比較組織名: "組織全体" },
  ],
  [
    "traits.tipAverage",
    T.traits.tipAverage("20", "+6.5"),
    "サロン平均 {o}点（差 {d}）",
    { o: "20", d: "+6.5" },
  ],
  [
    "fit.average",
    T.fit.average("Aチーム", 3),
    "{比較組織名}の平均（{n}人）",
    { 比較組織名: "Aチーム", n: 3 },
  ],
  ["fit.lean", T.fit.lean("組織優先型"), "組織より「{言葉}」寄り", { 言葉: "組織優先型" }],
  [
    "fit.position",
    T.fit.position("協調性を重視するリーダータイプ"),
    "組織内のポジション：{名前}",
    { 名前: "協調性を重視するリーダータイプ" },
  ],
  [
    "fit.trackLabel",
    T.fit.trackLabel("適応する環境", "個人優先型", "組織優先型", 62),
    "{軸}: {左の言葉} から {右の言葉} のうち {位置}",
    { 軸: "適応する環境", 左の言葉: "個人優先型", 右の言葉: "組織優先型", 位置: 62 },
  ],
];

/** 見本の値で呼んだ文言も含めた、結果詳細の文言のすべて */
const ALL_TEXTS = [
  ...stringLeaves(T),
  ...TEMPLATES.map(([, text]) => text),
  T.title("テストテスト 01"),
  ...stringLeaves(RISK_RESULT_LABELS),
  ...RESULT_SECTIONS.flatMap((s) => [s.title, s.description, s.descriptionReady]),
];

describe("M7-result-16 RESULT_DETAIL_TEXTS（11-4 §2.20）", () => {
  it("差し込みの無い文言は、どれも 11-4 の 2 章にそのままの文字で書かれている", () => {
    const leaves = stringLeaves(T);
    expect(leaves.length).toBeGreaterThan(60);
    expect(leaves.filter((text) => !SECTION_2.includes(text))).toEqual([]);
  });

  it("差し込みのある文言は §2.20 などの形に見本の値を入れたものと同じ（関数はすべて確かめる）", () => {
    expect(functionPaths(T).sort()).toEqual([...TEMPLATES.map(([path]) => path), "title"].sort());
    for (const [path, text, template, values] of TEMPLATES) {
      expect(SECTION_2.includes(template), `${path} の形「${template}」`).toBe(true);
      expect(text, path).toBe(fill(template, values));
    }
  });

  it("見出しの文は ADMIN_TEXTS.resultTitle（PDF の見出しも同じ関数）、「回答一覧に戻る」「ダウンロード」は ADMIN_TEXTS", () => {
    expect(T.title("テストテスト 01")).toBe(ADMIN_TEXTS.resultTitle("テストテスト 01"));
    expect(T.backToResults).toBe(ADMIN_TEXTS.backToResults);
    expect(T.download).toBe(ADMIN_TEXTS.download);
  });

  it("K-19: 文言に「院長」「医院」「クリニック」「歯科」「患者」が無い", () => {
    for (const word of ["院長", "医院", "クリニック", "歯科", "患者"]) {
      expect(
        ALL_TEXTS.filter((text) => text.includes(word)),
        word,
      ).toEqual([]);
    }
  });

  it("2 つ目の凡例と吹き出しは「サロン平均」（参照元: 医院平均。K-19）", () => {
    expect(T.traits.legendAverage("組織全体")).toBe("サロン平均（組織全体）");
    expect(T.traits.legendAverageNone).toBe("サロン平均（右上で比較組織を選ぶと表示されます）");
    expect(T.traits.tipAverage("20", "+6.5")).toBe("サロン平均 20点（差 +6.5）");
    expect(T.traits.legendAverageNone).toBe(`サロン平均（${T.noComparison.none}）`);
  });

  it("参照元の文字のまま: 〜 は波ダッシュ（U+301C）、— は全角ダーシ（U+2014）、＞ と空白は全角", () => {
    expect(T.risk.note).toBe(
      "色分けの目安：20％未満 低い／20\u301C40％ やや低い／40\u301C60％ 注意／60％以上 高い",
    );
    expect(T.risk.note).not.toContain("\uFF5E"); // 全角チルダではない
    expect(RESULT_SECTIONS[1]!.description).toContain("0\u301C30点");
    expect(RESULT_SECTIONS[1]!.descriptionReady).toContain("0\u301C30点");
    expect(T.overview.none).toBe("\u2014");
    expect(T.overview.moreHigh).toBe("ほかの特性が高い場合を見る\u3000\uFF1E");
    expect(T.overview.moreLow).toBe("ほかの特性が低い場合を見る\u3000\uFF1E");
    expect(T.similaritySub).toBe("\u3000似た結果の人を探す");
    expect(T.overview.big("反省力", "7")).toBe("反省力\u30007");
    expect(T.fold.mark).toBe("\u25B4");
    expect(T.traits.tipMark).toBe("\u25CF");
  });

  it("信頼係数のカードの一文は §2.7.4 の表のとおり", () => {
    const rows = [
      ...between(SPEC, "#### 2.7.4 ", "#### 2.7.5 ").matchAll(
        /^\| (40 未満|40 以上 80 未満|80 以上) \| #[0-9A-F]{6} \| (.+) \|$/gm,
      ),
    ].map((m) => m[2]);
    expect(rows).toEqual([
      T.overview.reliabilityLow,
      T.overview.reliabilityLow,
      T.overview.reliabilityGood,
    ]);
  });

  it("並び替えのボタンは 3 つ（点数の高い順・平均との差・項目順）、目盛は 0・15・30", () => {
    expect(T.traits.sort).toEqual({ score: "点数の高い順", diff: "平均との差", def: "項目順" });
    expect(T.traits.scale).toEqual(["0", "15", "30"]);
    expect(SECTION_2_20).toContain("点数の高い順／平均との差／項目順");
  });
});

describe("（ID なし）結果詳細の表示用の定数（11-4 §3.4）", () => {
  it("RISK_RESULT_LABELS は §2.10 の表示名の表と一致し、00 §1.5 の正式名・短縮名とは別の文言", () => {
    const rows = Object.fromEntries(
      [...between(SPEC, "### 2.10 ", "### 2.11 ").matchAll(/^\| `(\w+)` \| (.+) \|$/gm)].map(
        (m) => [m[1], m[2]],
      ),
    );
    expect(Object.keys(rows)).toEqual([...RISK_KEYS]);
    expect(RISK_RESULT_LABELS).toEqual(rows);
    for (const d of RISK_DEFINITIONS) {
      expect(RISK_RESULT_LABELS[d.key], d.key).not.toBe(d.label);
      expect(RISK_RESULT_LABELS[d.key], d.key).not.toBe(d.shortLabel);
    }
  });

  it("RESULT_SECTIONS は RESULT_SECTION_IDS の順の 7 件で、見出しと説明は §2.2 の表（16の特性だけ比較ありで説明が変わる）", () => {
    expect(RESULT_SECTIONS.map((s) => s.id)).toEqual([...RESULT_SECTION_IDS]);
    const table = [
      ...between(SPEC, "- 各セクションの説明（見出しの右。固定の文言）:", "- カード:").matchAll(
        /^\| (\S+) \| (.+) \|$/gm,
      ),
    ]
      .map((m) => [m[1]!, m[2]!] as const)
      .filter(([title]) => title !== "セクション" && !title.startsWith("---"));
    expect(table.map(([title]) => title)).toEqual(RESULT_SECTIONS.map((s) => s.title));
    for (const [title, text] of table) {
      const s = RESULT_SECTIONS.find((x) => x.title === title)!;
      const both = /^比較なし: (.+)／比較あり: (.+)$/.exec(text);
      expect([s.description, s.descriptionReady], title).toEqual(
        both ? [both[1], both[2]] : [text, text],
      );
    }
    expect(RESULT_SECTIONS[1]).toEqual({
      id: "rs-tr",
      title: "16の特性",
      description: "0〜30点。右上で比較組織を選ぶと平均も表示",
      descriptionReady: "0〜30点。線は比較組織の平均",
    });
  });

  it("アイコンの名前は別表E の 25（自作の back・download・close を含む）", () => {
    // 別表E は文書の最後の節
    const names = [
      ...SPEC.slice(SPEC.indexOf("## 別表E ")).matchAll(/^\| `(\w+)`(?:（アプリ）)? \|/gm),
    ].map((m) => m[1]);
    expect(names).toHaveLength(25);
    expect([...RESULT_ICON_NAMES]).toEqual(names);
  });

  it("TRAIT_ICONS は §2.19 の 16の特性のアイコン", () => {
    const line = between(SPEC, "- 16の特性のアイコン: ", "。\n");
    const byLabel = new Map(TRAIT_DEFINITIONS.map((d) => [d.label, d.key]));
    const expected = Object.fromEntries(
      line
        .replace("- 16の特性のアイコン: ", "")
        .split("、")
        .map((part) => {
          const [label, icon] = part.split(" ");
          return [byLabel.get(label!), icon];
        }),
    );
    expect(Object.keys(expected)).toEqual([...TRAIT_KEYS]);
    expect(TRAIT_ICONS).toEqual(expected);
  });

  it("DETAIL_CATEGORY_ICONS は §2.9 の表（対人関係 users・行動特性 zap・業務対応 brief・環境適応 globe・情緒・精神面 heart）", () => {
    const rows = [
      ...between(SPEC, "### 2.9 ", "### 2.10 ").matchAll(
        /^\| \d \| \S+ \| `(\w+)`.* \| (\w+) \|$/gm,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(rows.map(([key]) => key)).toEqual([...TRAIT_DETAIL_CATEGORY_KEYS]);
    expect(DETAIL_CATEGORY_ICONS).toEqual(Object.fromEntries(rows));
    for (const icon of [...Object.values(TRAIT_ICONS), ...Object.values(DETAIL_CATEGORY_ICONS)]) {
      expect(RESULT_ICON_NAMES).toContain(icon);
    }
  });

  it("定数は書き換えられない", () => {
    expect(Object.isFrozen(RISK_RESULT_LABELS)).toBe(true);
    expect(Object.isFrozen(RESULT_SECTIONS)).toBe(true);
    expect(RESULT_SECTIONS.every((s) => Object.isFrozen(s))).toBe(true);
    expect(Object.isFrozen(TRAIT_ICONS)).toBe(true);
    expect(Object.isFrozen(DETAIL_CATEGORY_ICONS)).toBe(true);
  });
});
