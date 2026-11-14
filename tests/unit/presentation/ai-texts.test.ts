// M7-ai-23（11-6 §5.1）: AI 解説の文言 ai-texts.ts（11-6 §2.15 の PR-7.9 の分）。文言は 11-6 の 2 章（仕様）にそのままの文字で
// 書かれていること（タブ・生成ボタン・準備中の注記・生成中は §2.15 の表、読み上げの名前は §2.1、案内は §2.4.2・§2.5.2、失敗の枠は
// §2.3.4、採用向けの表示は §2.4.3 を読んで比べる）、K-19 の置き換え後の文（§0.5）で「院長」「クリニック」「医院」を含まないこと、
// 参照元の文字（半角の「~」・「…」・「◎」「△」「⚠」「＆」「！」）のままであることを確かめる。
// X-12（06 §11）: 失敗の理由の文（AI_FAILURE_TEXTS・aiFailureText。admin-texts.ts から移した T-30 群）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AI_FAILURE_REASONS } from "@/lib/ai/errors";
import { AI_ANALYSIS_KINDS } from "@/lib/ai/kinds";
import { RECRUITMENT_CHIP_ORDER } from "@/lib/presentation/ai-area";
import { AI_FAILURE_TEXTS, AI_TEXTS as T, aiFailureText } from "@/lib/presentation/ai-texts";

const SPEC = readFileSync(
  fileURLToPath(new URL("../../../docs/基本設計/11_参照元の更新/11-6_AI解説.md", import.meta.url)),
  "utf8",
);

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

const SECTION_0_5 = between(SPEC, "### 0.5 ", "### 0.6 ");
/** 11-6 の 2 章（仕様） */
const SECTION_2 = between(SPEC, "## 2. 仕様", "## 3. ");
const SECTION_2_1 = between(SPEC, "### 2.1 ", "### 2.2 ");
const SECTION_2_2 = between(SPEC, "### 2.2 ", "### 2.3 ");
const SECTION_2_3_2 = between(SPEC, "#### 2.3.2 ", "#### 2.3.3 ");
const SECTION_2_3_3 = between(SPEC, "#### 2.3.3 ", "#### 2.3.4 ");
const SECTION_2_3_4 = between(SPEC, "#### 2.3.4 ", "#### 2.3.5 ");
const SECTION_2_4_2 = between(SPEC, "#### 2.4.2 ", "#### 2.4.3 ");
const SECTION_2_4_3 = between(SPEC, "#### 2.4.3 ", "#### 2.4.4 ");
const SECTION_2_4_4 = between(SPEC, "#### 2.4.4 ", "### 2.5 ");
const SECTION_2_5_2 = between(SPEC, "#### 2.5.2 ", "#### 2.5.3 ");
const SECTION_2_15 = between(SPEC, "### 2.15 ", "### 2.16 ");

/** 文言の定数の文字をすべて取り出す */
function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(stringLeaves);
  return [];
}

/** §2.15 の表の、1 列目が constants の行の文言（2 列目を「／」で分けたもの） */
function textsRow(constants: string): string[] {
  const line = SECTION_2_15.split("\n").find((l) => l.startsWith(`| ${constants} | `));
  if (line === undefined) throw new Error(`§2.15 の表に無い: ${constants}`);
  return line.split(" | ")[1]!.split("／");
}

/** 案内の特徴の表（§2.4.2・§2.5.2）の行を上から [太字, 説明] で */
function featureRows(section: string): Array<[string, string]> {
  return [...section.matchAll(/^\| (\d) \| [^|]+ \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => [
    m[2]!,
    m[3]!,
  ]);
}

describe("M7-ai-23 AI_TEXTS（11-6 §2.15 の PR-7.9 の分）", () => {
  it("どの文言も 11-6 の 2 章にそのままの文字で書かれている", () => {
    const leaves = stringLeaves(T);
    expect(leaves.length).toBeGreaterThan(40);
    expect(leaves.filter((text) => !SECTION_2.includes(text))).toEqual([]);
  });

  it("領域とタブの行の読み上げの名前は §2.1 の表の aria-label", () => {
    expect(SECTION_2_1).toContain(`\`section\`（\`aria-label="${T.area.label}"\`）`);
    expect(SECTION_2_1).toContain(`\`role="tablist"\`、\`aria-label="${T.area.tabsLabel}"\``);
    expect(T.area).toEqual({ label: "AI解説", tabsLabel: "AI解説の種類" });
  });

  it("タブは §2.15 の表の文で、§2.2 の表の順と種類（採用向け → 育成・定着 → 経年比較）", () => {
    expect(textsRow("`tabs.recruitment`・`tabs.training`・`tabs.longitudinal`")).toEqual(
      AI_ANALYSIS_KINDS.map((kind) => T.tabs[kind]),
    );
    const rows = [...SECTION_2_2.matchAll(/^\| (\d) \| ([^|]+) \| `(\w+)` \| /gm)].map((m) => [
      m[3]!,
      m[2]!,
    ]);
    expect(rows).toEqual(AI_ANALYSIS_KINDS.map((kind) => [kind, T.tabs[kind]]));
    expect(T.tabs).toEqual({
      recruitment: "採用向けAI解説",
      training: "育成・定着AI解説",
      longitudinal: "経年比較AI解説",
    });
  });

  it("生成ボタンと準備中の注記は §2.15 の表と §2.3.2 の文（失敗のあとも同じ文言のボタン。「再試行」は無い）", () => {
    expect(textsRow("`generate.recruitment`・`generate.training`")).toEqual([
      T.generate.recruitment,
      T.generate.training,
    ]);
    expect(SECTION_2_3_2).toContain(`| 採用向け | ${T.generate.recruitment} | `);
    expect(SECTION_2_3_2).toContain(`| 育成・定着 | ${T.generate.training} | `);
    expect(textsRow("`notReady`")).toEqual([T.notReady]);
    expect(SECTION_2_3_2).toContain(`ボタンの下に「${T.notReady}」`);
    expect(stringLeaves(T)).not.toContain("再試行");
  });

  it("生成中は §2.15 の表と §2.3.3 の文（見出しと説明の 2 行）", () => {
    expect(textsRow("`generating`")).toEqual([T.generating.title, ...T.generating.lines]);
    expect(SECTION_2_3_3).toContain(`見出し「${T.generating.title}」`);
    expect(SECTION_2_3_3).toContain(
      `説明「${T.generating.lines[0]}」（改行）「${T.generating.lines[1]}」（「~」は半角）`,
    );
  });

  it("失敗の枠の文は §2.3.4 の T-18・T-29（今の文言のまま）", () => {
    expect(SECTION_2_3_4).toContain(
      `「${T.failed}」（T-18）に続けて、理由の文（\`aiFailureText(error)\``,
    );
    expect(SECTION_2_3_4).toContain(`「${T.pollingTimeout}」（T-29）`);
    expect(T.failed).toBe("AI解説の生成に失敗しました。");
    expect(T.pollingTimeout).toBe("時間内に完了しませんでした。ページを再読み込みしてください");
  });

  it("採用向けの生成前の案内は §2.4.2 の見出し・副題・特徴 3 行", () => {
    const intro = T.intro.recruitment;
    expect(SECTION_2_4_2).toContain(`見出し「${intro.title}」、副題「${intro.subtitle}」`);
    expect(featureRows(SECTION_2_4_2)).toEqual(intro.features.map((f) => [f.title, f.description]));
    expect(intro.features).toHaveLength(3);
  });

  it("育成・定着の生成前の案内は §2.5.2 の見出し・副題・特徴 3 行・枠・警告（太字の部分は分けて持つ）", () => {
    const intro = T.intro.training;
    expect(SECTION_2_5_2).toContain(`見出し「${intro.title}」、副題「${intro.subtitle}」`);
    expect(featureRows(SECTION_2_5_2)).toEqual(intro.features.map((f) => [f.title, f.description]));
    expect(intro.features).toHaveLength(3);
    expect(SECTION_2_5_2).toContain(
      `「${intro.need.before}」に続けて太字「${intro.need.strong}」、続けて「${intro.need.after}」`,
    );
    expect(SECTION_2_5_2).toContain(`左に「${intro.warn.mark}」の丸`);
    expect(SECTION_2_5_2).toContain(
      `右に「${intro.warn.before}」に続けて太字「${intro.warn.strong}」、続けて「${intro.warn.after}」`,
    );
  });

  it("採用向けの表示は §2.4.3 の文（見出し帯・注意書き・チップのラベル・節と箱の見出し・「見極め：」・札・末尾・空の値）", () => {
    const view = T.recruitmentView;
    expect(SECTION_2_4_3).toContain(`「${view.band}」（18px`);
    expect(SECTION_2_4_3).toContain(`「${view.caution}」。下 16px`);
    expect(SECTION_2_4_3).toContain(`「${view.summary}」（14.5px`);
    expect(SECTION_2_4_3).toContain(`左「${view.strengths}」（参照元: このクリニック。K-19）`);
    expect(SECTION_2_4_3).toContain(`右「${view.cautions}」:`);
    expect(SECTION_2_4_3).toContain(`| 8 | ${view.questions} | `);
    expect(SECTION_2_4_3).toContain(`その下に「${view.intentLabel}」（#268177`);
    expect(SECTION_2_4_3).toContain(`| 9 | ${view.retention} | `);
    expect(SECTION_2_4_3).toContain(`見出し「${view.retainAlert}」（13.5px`);
    expect(SECTION_2_4_3).toContain(
      `行「${view.sign}」+ \`retention.sign\`、行「${view.action}」+ \`retention.action\``,
    );
    expect(SECTION_2_4_3).toContain(`「${view.footer}」（T-09。参照元: 院長。K-19）`);
    expect(SECTION_2_4_3).toContain(`値が空の文字のときは「${view.empty}」を出す`);
    expect(SECTION_2_4_4).toContain(`値が無いとき（空）は「${view.empty}」で mid`);
  });

  it("判定チップのラベルは §2.4.3 の 5 の順（即戦力性 → 離職リスク → 総合判定）と verdict のキー", () => {
    const labels = [...SECTION_2_4_3.matchAll(/「([^「」]+)」（`verdict\.(\w+)`）/g)].map((m) => [
      m[2]!,
      m[1]!,
    ]);
    expect(labels).toEqual(
      RECRUITMENT_CHIP_ORDER.map((kind) => [kind, T.recruitmentView.chips[kind]]),
    );
    expect(Object.keys(T.recruitmentView.chips).sort()).toEqual([...RECRUITMENT_CHIP_ORDER].sort());
  });

  it("K-19（§0.5）: 強みの箱の見出しと末尾（T-09）は置き換え後の文", () => {
    expect(T.recruitmentView.strengths).toBe("◎ このサロンで活きる強み");
    expect(SECTION_0_5).toContain(
      `| 採用向けの強みの箱の見出し | ${T.recruitmentView.strengths} | ◎ このクリニックで活きる強み |`,
    );
    expect(
      T.recruitmentView.footer.endsWith("生成結果は責任者が内容をご確認のうえご活用ください。"),
    ).toBe(true);
    expect(SECTION_0_5).toContain(
      `| 採用向けの末尾（T-09。今のアプリと同じ） | ${T.recruitmentView.footer} | …生成結果は院長が内容をご確認のうえご活用ください。 |`,
    );
  });

  it("K-19: どの文言（失敗の理由の文を含む）にも「院長」「クリニック」「医院」が無い", () => {
    const all = [...stringLeaves(T), ...Object.values(AI_FAILURE_TEXTS)];
    for (const word of ["院長", "クリニック", "医院"]) {
      expect(
        all.filter((text) => text.includes(word)),
        word,
      ).toEqual([]);
    }
  });

  it("参照元の文字のまま: 「~」は半角（U+007E）、「…」は U+2026、「◎」「△」「⚠」（異体字セレクタなし）・「＆」「！」は全角、AI の後ろの空白は半角", () => {
    expect(T.generating.lines[1]).toBe("完了まで30~90秒ほどお待ちください");
    expect(T.generating.lines[1]).not.toMatch(/[\uFF5E\u301C]/); // 全角チルダ・波ダッシュではない
    expect(T.generating.lines[0].endsWith("\u2026")).toBe(true);
    expect(T.recruitmentView.strengths.startsWith("\u25CE ")).toBe(true);
    expect(T.recruitmentView.cautions.startsWith("\u25B3 ")).toBe(true);
    expect(T.recruitmentView.retainAlert).toBe("\u26A0 辞めそうなサイン \uFF06 引き止めの一手");
    expect(T.intro.training.warn.mark).toBe("\uFF01");
    expect(T.notReady).toBe("この AI 解説は準備中です。");
    expect(T.intro.recruitment.title).toBe("AI 採用アドバイザー");
    expect(T.recruitmentView.band).toBe("AI 採用・育成アドバイザー");
    expect(stringLeaves(T).filter((text) => text.includes("\uFE0F"))).toEqual([]);
  });
});

describe("X-12 AI_FAILURE_TEXTS（06 §3.5.9 の T-30 群。11-6 §2.15 で admin-texts.ts から移した）", () => {
  it("07 §4.6 の AiFailureReason 全値と internal_error を持つ", () => {
    expect(Object.keys(AI_FAILURE_TEXTS).sort()).toEqual(
      [...AI_FAILURE_REASONS, "internal_error"].sort(),
    );
  });

  it("06 §3.5.9 の表の文言", () => {
    expect(aiFailureText("provider_error")).toBe(
      "AI サービスとの通信に失敗しました。時間をおいて再試行してください",
    );
    expect(aiFailureText("rate_limited")).toBe(
      "AI サービスが混み合っています。時間をおいて再試行してください",
    );
    for (const code of ["invalid_request", "auth_error", "config_error"]) {
      expect(aiFailureText(code)).toBe(
        "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
      );
    }
    expect(aiFailureText("timeout")).toBe(
      "生成に時間がかかりすぎたため中断しました。再試行してください",
    );
    for (const code of ["invalid_json", "truncated"]) {
      expect(aiFailureText(code)).toBe("AI の応答を解釈できませんでした。再試行してください");
    }
    expect(aiFailureText("refusal")).toBe("AI が解説の生成を行いませんでした。再試行してください");
  });

  it("internal_error・未知の値・null は既定文言（理由コードをそのまま見せない）", () => {
    const fallback = "生成処理でエラーが発生しました。再試行してください";
    expect(aiFailureText("internal_error")).toBe(fallback);
    expect(aiFailureText("unknown_code")).toBe(fallback);
    expect(aiFailureText("toString")).toBe(fallback);
    expect(aiFailureText(null)).toBe(fallback);
  });
});
