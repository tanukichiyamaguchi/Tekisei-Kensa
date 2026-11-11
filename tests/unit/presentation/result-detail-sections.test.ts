// M7-result-05（描画の分）・18・19（PR-7.8a の分）。結果詳細の部品（11-4 §2.4・§2.7〜§2.12・§2.15・§2.18）を renderToStaticMarkup で
// 静的な HTML に描いて確かめる（DOM のライブラリは足さない）。比較の状態は部品の props で 5 つ（未選択・読み込み中・比較あり・0 人・
// 失敗）を渡し、本文・見出しの塊・目次・レイアウトは ComparisonProvider の initialComparison（比較ありか未選択）と印刷の形で包む
// （比較組織のプルダウンは next/navigation を読むので、印刷の形では描かない）。見本の DTO は合成の回答（scoreAnswers）にコンダクター
// タイプを当てたもので、氏名などは架空。比較の応答は値を決めて置く（平均との差のバッジの K-44 などを確かめるため）。
// 育て方・接し方（M7-result-19 の 7.8b の分）は PR-7.8b が足す
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ComparisonProvider,
  type ComparisonState,
} from "@/components/admin/result/ComparisonProvider";
import { ResultDetailBody } from "@/components/admin/result/ResultDetailBody";
import { ResultHead } from "@/components/admin/result/ResultHead";
import { ResultMetaLine } from "@/components/admin/result/ResultMetaLine";
import { FitSection } from "@/components/admin/result/sections/FitSection";
import { OverviewSection } from "@/components/admin/result/sections/OverviewSection";
import { ProfileSection } from "@/components/admin/result/sections/ProfileSection";
import { RiskSection } from "@/components/admin/result/sections/RiskSection";
import { TraitsSection } from "@/components/admin/result/sections/TraitsSection";
import { TraitHighlightPopups } from "@/components/admin/result/TraitHighlightPopups";
import { POSITION_DEFINITIONS } from "@/lib/masters/texts";
import { FULL_VISIBILITY, type PdfSectionVisibility } from "@/lib/pdf/visibility";
import { RISK_LEVEL_STYLES } from "@/lib/presentation/colors";
import {
  buildResultDetailView,
  type ResultDetailView,
} from "@/lib/presentation/result-detail-view";
import { DEFAULT_RESULT_VIEW_STATE } from "@/lib/presentation/result-view-state";
import { diffTone, formatDiffBadge, formatOneDecimal } from "@/lib/presentation/rounding";
import { scoreAnswers } from "@/lib/scoring/score";
import {
  TRAIT_KEYS,
  type CompatibilityScores,
  type ScoreResult,
  type TraitKey,
  type TraitScores,
} from "@/lib/scoring/types";
import type { ComparisonDto, ResultDetailDto } from "@/lib/services/dto/result";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

// ---- 見本（架空）

/** 合成の回答（Q(q) = ((q − 1) mod 5) + 1）の採点結果にコンダクタータイプを当てたもの。いちばん高い特性は規則遵守力（18.5）、
 * いちばん低い特性は謙虚さ（13。こだわり・発想力と同点で項目順の先）、信頼係数は 78.685 */
const CONDUCTOR: ScoreResult = { ...scoreAnswers(cyclicAnswers()), aptitudeType: "conductor" };

function dtoOf(scores: ScoreResult = CONDUCTOR): ResultDetailDto {
  return {
    resultId: "ResSample0001",
    respondent: {
      respondentId: "RspSample0001",
      name: "テストテスト 01",
      occupationCode: 10,
      kind: "applicant",
      diagnosisExperience: "first_time",
      teamCode: "A",
      isExcluded: false,
    },
    submittedAt: "2026-04-04T15:30:00Z",
    scoringVersion: scores.scoringVersion,
    scores,
    aiAnalysis: { status: "not_generated", startedAt: null, error: null, latest: null },
  };
}

const VIEW = buildResultDetailView(dtoOf());

/** 16の特性の平均（本人 − 平均 = +6.5・−1.6・0.04・−0.04・+1.5・−1.5・1.49、ほかは 0） */
const TRAIT_AVERAGES: TraitScores = Object.freeze({
  ...CONDUCTOR.traits,
  cooperativeness: 8.5, // 15 − 8.5 = +6.5（up）
  adaptability: 15.1, // 13.5 − 15.1 = −1.6（dn）
  deliberateness: 13.96, // 14 − 13.96 = 0.04（「0.0」・eq。K-44）
  humility: 13.04, // 13 − 13.04 = −0.04（「0.0」・eq。K-44）
  reflectiveness: 13, // 14.5 − 13 = +1.5（up）
  rule_compliance: 20, // 18.5 − 20 = −1.5（dn）
  persistence: 11.51, // 13 − 11.51 = 1.49（「+1.5」・eq）
});

/** 組織との相性の平均（本人は −3・0・11・−13・−7） */
const COMPATIBILITY_AVERAGES: CompatibilityScores = Object.freeze({
  adaptive_environment: 10, // 0 − 10 = −10 → 左の言葉
  adaptive_work: 0, // 0 − 0 → ほぼ同じ
  thinking_tendency: 2, // 11 − 2 = 9 → 右の言葉
  decision_making: -2, // 0 − 0（どちらも 0 に収める）→ ほぼ同じ
  stress_tolerance: 50, // 0 − 50 → 左の言葉
});

const READY_DTO: ComparisonDto = Object.freeze({
  resultId: "ResSample0001",
  scoringVersion: CONDUCTOR.scoringVersion,
  includesSubject: false,
  computedAt: "2026-11-10T00:00:00.000Z",
  scope: { kind: "organization" as const },
  populationSize: 12,
  traitAverages: TRAIT_AVERAGES,
  traitDiffs: TRAIT_AVERAGES,
  compatibilityAverages: COMPATIBILITY_AVERAGES,
  axisDeviations: COMPATIBILITY_AVERAGES,
  matchScore: 87.6,
  deviationScore: 68.7,
  grade: "B",
  position: "cooperative_leader",
});

const ORG = { kind: "organization" } as const;
const STATES: Readonly<Record<ComparisonState["kind"], ComparisonState>> = {
  none: { kind: "none" },
  loading: { kind: "loading", scope: ORG },
  ready: { kind: "ready", scope: ORG, comparison: READY_DTO },
  empty: { kind: "empty", scope: { kind: "team", teamCode: "A" } },
  error: { kind: "error", scope: ORG, message: "通信に失敗しました" },
};

const NONE_TEXT = "右上で比較組織を選ぶと表示されます";
const LOADING_TEXT = "データを読み込んでいます";
const EMPTY_TEXT = "「Aチーム」には比べられる回答がありません";
const RESTRICTED: PdfSectionVisibility = {
  ...FULL_VISIBILITY,
  showGrade: false,
  showMatchScore: false,
  showRisks: false,
  showAiAnalysis: false,
};
const noop = () => undefined;
const ACTIONS = {
  toggleFold: noop,
  openSection: noop,
  setFoldedAll: noop,
  setTraitSort: noop,
  setTraitHelp: noop,
};

// ---- HTML を読む補助

const render = (element: ReactElement) => renderToStaticMarkup(element);

/** marker（属性の文字など）を含む開きタグから、その要素の終わりまで */
function elementOf(html: string, marker: string, from = 0): string {
  const at = html.indexOf(marker, from);
  if (at < 0) throw new Error(`見つからない: ${marker}`);
  const start = html.lastIndexOf("<", at);
  const name = /^<([a-z0-9]+)/i.exec(html.slice(start))?.[1];
  if (!name) throw new Error(`タグが読めない: ${marker}`);
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] === "/") depth -= 1;
    else if (m[2] !== "/") depth += 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`閉じタグが無い: ${marker}`);
}

/** marker を含む要素をすべて（重ならないもの） */
function elementsOf(html: string, marker: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = html.indexOf(marker, from);
    if (at < 0) return out;
    const el = elementOf(html, marker, at);
    out.push(el);
    from = html.lastIndexOf("<", at) + el.length;
  }
}

/** 16の特性の一覧の行（div.tr・div.tr.hi・div.tr.lo） */
const traitRowsOf = (html: string): string[] =>
  [...html.matchAll(/<div class="tr(?: hi| lo)?">/g)].map((m) => elementOf(html, m[0], m.index));

/** 文字だけ（タグを除き、React がエスケープした文字を戻す） */
const textOf = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string): number => html.split(needle).length - 1;

/** 最初の開きタグ */
const openTag = (element: string): string => element.slice(0, element.indexOf(">") + 1);

// ---- 描く関数

const overview = (
  state: ComparisonState,
  visibility: PdfSectionVisibility = FULL_VISIBILITY,
  view: ResultDetailView = VIEW,
) =>
  render(
    createElement(OverviewSection, { view, comparison: state, visibility, variant: "screen" }),
  );

const traits = (
  state: ComparisonState,
  options: {
    readonly view?: ResultDetailView;
    readonly traitSort?: "score" | "diff" | "def";
    readonly traitHelp?: TraitKey | null;
    readonly variant?: "screen" | "print";
  } = {},
) =>
  render(
    createElement(TraitsSection, {
      view: options.view ?? VIEW,
      comparison: state,
      viewState: {
        ...DEFAULT_RESULT_VIEW_STATE,
        traitSort: options.traitSort ?? "score",
        traitHelp: options.traitHelp ?? null,
      },
      actions: ACTIONS,
      variant: options.variant ?? "screen",
    }),
  );

/** 印刷の形の本文（比較ありか未選択の initialComparison で包む） */
const printBody = (
  comparison: ComparisonDto | null,
  options: {
    readonly visibility?: PdfSectionVisibility;
    readonly aiArea?: ReactElement;
    readonly headActions?: { readonly similarity?: ReactElement; readonly download?: ReactElement };
  } = {},
) =>
  render(
    createElement(ComparisonProvider, {
      resultId: "ResSample0001",
      initialComparison: comparison,
      children: createElement(ResultDetailBody, {
        view: VIEW,
        variant: "print",
        visibility: options.visibility,
        aiArea: options.aiArea,
        headActions: options.headActions,
      }),
    }),
  );

describe("M7-result-18 概要と比較の状態（11-4 §2.6・§2.7）", () => {
  it("未選択・失敗: 評価の箱は「—」（.grade.no）、組織内のポジションと組織との合致度に「右上で比較組織を選ぶと表示されます」", () => {
    for (const kind of ["none", "error"] as const) {
      const html = overview(STATES[kind]);
      const grade = elementOf(html, 'id="rs-hyo"');
      expect(openTag(grade), kind).toContain('class="grade no"');
      expect(textOf(grade)).toBe("—");
      expect(count(html, NONE_TEXT), kind).toBe(2);
      const gat = elementOf(html, 'id="rs-gat"');
      expect(textOf(elementOf(gat, 'class="v no"'))).toBe("—");
      expect(textOf(elementOf(gat, 'class="empty"'))).toBe(NONE_TEXT);
      expect(gat).not.toContain('class="meter"');
      // ポジションの名前・絵は出さない
      expect(html).not.toContain("/images/positions/");
    }
  });

  it("読み込み中: 同じ 2 か所に「データを読み込んでいます」。0 人（Aチーム）: 「「Aチーム」には比べられる回答がありません」", () => {
    const loading = overview(STATES.loading);
    expect(count(loading, LOADING_TEXT)).toBe(2);
    expect(loading).not.toContain(NONE_TEXT);
    const empty = overview(STATES.empty);
    expect(count(empty, EMPTY_TEXT)).toBe(2);
    expect(textOf(elementOf(empty, 'id="rs-hyo"'))).toBe("—");
  });

  it("比較あり: 評価の文字、ポジションの名前と説明の 1 行目（先頭の・なし）と絵、合致度の数字・「%」・メーターの幅・「組織全体（12人）と比べた近さ」。数字とメーターは色分けしない", () => {
    const html = overview(STATES.ready);
    const grade = elementOf(html, 'id="rs-hyo"');
    expect(openTag(grade)).toContain('class="grade"');
    expect(textOf(grade)).toBe("B");
    const position = POSITION_DEFINITIONS.cooperative_leader;
    expect(textOf(elementOf(html, 'class="t"'))).toBe(position.label);
    expect(textOf(elementOf(html, 'class="s"'))).toBe(
      "責任者とスタッフの橋渡し役として活躍出来る方が多い",
    );
    expect(html).toContain('src="/images/positions/cooperative_leader.svg"');
    const gat = elementOf(html, 'id="rs-gat"');
    expect(openTag(gat)).toContain('class="card kpi"');
    expect(textOf(elementOf(gat, 'class="v"'))).toBe("88%");
    expect(elementOf(gat, 'class="v"')).toContain("<small>%</small>");
    expect(gat).toContain('style="width:88%"');
    expect(textOf(elementOf(gat, 'class="s"'))).toBe("組織全体（12人）と比べた近さ");
    // 合致度・評価に色の指定（style の color・段階のクラス）が無い（K-39 Q-03）
    expect(gat).not.toMatch(/color|t-low|t-mid|t-good/);
    expect(grade).not.toContain("style=");
    expect(html).not.toContain(NONE_TEXT);
  });

  it("タイプのカード: 絵（alt 空）・「タイプ」・タイプ名とキャラクター名・「{適性}に適性があります。」・タグ 3 つ", () => {
    const html = overview(STATES.none);
    const hero = elementOf(html, 'id="rs-hero"');
    expect(hero).toContain('src="/images/types/conductor.svg" alt=""');
    expect(textOf(elementOf(hero, 'class="type"'))).toBe(
      `${VIEW.type.label}${VIEW.type.characterName}`,
    );
    expect(textOf(elementOf(hero, 'class="nick"'))).toBe(VIEW.type.characterName);
    expect(textOf(elementOf(hero, 'class="lead"'))).toBe(`${VIEW.type.aptitude}に適性があります。`);
    expect(elementsOf(hero, 'class="tag"').map(textOf)).toEqual([
      `接し方${VIEW.tags.style}`,
      `育て方${VIEW.tags.learn}`,
      `優位感覚${VIEW.tags.sense}`,
    ]);
  });

  it("下段: いちばん高い特性・低い特性（大きい文字は「{特性名}　{点数}」、良い面と注意の札、ほかの特性を見るボタン）と、注意したいリスクの上位 3 件", () => {
    const html = overview(STATES.none);
    const sw = elementOf(html, 'id="rs-sw"');
    const cards = elementsOf(sw, 'class="card"');
    expect(cards.map((card) => textOf(elementOf(card, "<h3")))).toEqual([
      "いちばん高い特性",
      "いちばん低い特性",
      "注意したいリスク",
    ]);
    expect(textOf(elementOf(cards[0]!, 'class="big"'))).toBe("規則遵守力　18.5");
    expect(textOf(elementOf(cards[1]!, 'class="big"'))).toBe("謙虚さ　13");
    expect(elementsOf(cards[0]!, "<em").map(textOf)).toEqual(["良い面", "注意"]);
    expect(textOf(elementOf(cards[0]!, 'class="more"'))).toBe("ほかの特性が高い場合を見る　＞");
    expect(textOf(elementOf(cards[1]!, 'class="more"'))).toBe("ほかの特性が低い場合を見る　＞");
    expect(cards[0]!).toContain('<span class="cic"><svg');
    const risk = elementOf(sw, 'id="rs-risk1"');
    const rows = elementsOf(elementOf(risk, 'class="rk3"'), "<div>");
    expect(rows.map(textOf)).toEqual([
      "不注意からミスが発生する58%",
      "コミュニケーションが原因で業務に支障がでる53%",
      "苦情を強く主張する48%",
    ]);
    expect(rows[0]).toContain('class="dot d3"');
    expect(rows[0]).toContain('<b class="d3">58%</b>');
  });

  it("非表示の指定: showGrade・showMatchScore・showRisks が偽で #rs-hyo・#rs-gat・#rs-risk1 が無い（組織内のポジションと信頼係数のカードは残る）", () => {
    const html = overview(STATES.ready, RESTRICTED);
    expect(html).not.toContain('id="rs-hyo"');
    expect(html).not.toContain('id="rs-gat"');
    expect(html).not.toContain('id="rs-risk1"');
    expect(html).toContain("組織内のポジション");
    expect(html).toContain("協調性を重視するリーダータイプ");
    expect(html).toContain("信頼係数");
    expect(elementsOf(elementOf(html, 'id="rs-sw"'), 'class="card"')).toHaveLength(2);
  });

  it("偏差値・「（12 名）」・母集団の注記・人数の補足行の文が無い（K-39 Q-26・Q-27）", () => {
    const html = printBody(READY_DTO);
    for (const text of [
      "偏差値",
      "68.7",
      "（12 名）",
      "比較対象:",
      "参考値",
      "母集団に含まれていません",
      "比較できる回答データがありません",
      "計算値が 0 未満",
    ]) {
      expect(html, text).not.toContain(text);
    }
    expect(html).toContain("組織全体（12人）と比べた近さ");
  });
});

describe("M7-result-18 印刷の形の見出しの塊と目次（11-4 §2.18、11-5 §2.5.3・§2.5.4）", () => {
  const headActions = {
    similarity: createElement(
      "button",
      { type: "button", className: "rd-btn rd-btn--similar" },
      "類似分析",
    ),
    download: createElement("button", { type: "button", className: "rd-btn" }, "ダウンロード"),
  };

  it("「類似分析」「ダウンロード」のボタンと 1 段目の要素を置かない（headActions を渡しても。見えなくした要素も無い）。比較組織は動かない箱に名前", () => {
    for (const [comparison, label] of [
      [READY_DTO, "組織全体"],
      [null, "比較組織を選択"],
    ] as const) {
      const html = printBody(comparison, { headActions });
      const head = elementOf(html, 'id="rd-head"');
      expect(head).not.toContain("rd-btn");
      expect(head).not.toContain("類似分析");
      expect(head).not.toContain("ダウンロード");
      expect(head).not.toContain("visibility");
      expect(head).not.toContain("<select");
      // 子は見出しの行と受験情報の 1 行の 2 つだけ（1 段目の行は無い）
      expect(head.slice(head.indexOf(">") + 1).startsWith('<div class="rd-titlerow">')).toBe(true);
      const box = elementOf(head, 'class="rd-scope"');
      expect(openTag(box)).toBe('<span class="rd-scope" data-static="">');
      expect(textOf(box)).toBe(label);
      expect(textOf(elementOf(head, 'class="rd-title"'))).toBe("テストテスト 01様の診断結果");
      // 印刷の形の見出しは焦点を受けない（tabIndex -1 は「↑ 先頭へ」のある画面の形だけ。§2.5）
      expect(openTag(elementOf(head, 'class="rd-title"'))).toBe('<h1 class="rd-title">');
    }
  });

  it("目次: 固定しない表示（「目次」あり、氏名の欄と「↑ 先頭へ」なし、data-print）。描かない行き先のリンクは無く、強調は先頭（AI 解説があれば AI解説、無ければ概要）", () => {
    const aiArea = createElement("section", { id: "ai", className: "result-section" }, "AI");
    const full = printBody(READY_DTO, { aiArea });
    const wrap = elementOf(full, 'id="rsn-wrap"');
    expect(openTag(wrap)).toBe('<div id="rsn-wrap" data-print="">');
    const nav = elementOf(wrap, 'id="rsn"');
    expect(openTag(nav)).toContain('aria-label="このページの目次"');
    expect(openTag(nav)).not.toContain("stuck");
    expect(nav).not.toContain('class="who"');
    expect(nav).not.toContain('class="top"');
    expect(textOf(elementOf(nav, 'class="l"'))).toBe("目次");
    const links = elementsOf(nav, "<a ");
    expect(links.map(textOf)).toEqual([
      "AI解説",
      "概要",
      "16の特性",
      "リスク",
      "組織との相性",
      "人物像",
    ]);
    expect(links.map((a) => /href="([^"]*)"/.exec(a)?.[1])).toEqual([
      "#ai",
      "#rs-ov",
      "#rs-tr",
      "#rs-rk",
      "#rs-fit",
      "#rs-pf",
    ]);
    expect(openTag(links[0]!)).toContain('class="on"');
    expect(openTag(links[0]!)).toContain('aria-current="true"');
    expect(links.slice(1).every((a) => !openTag(a).includes("aria-current"))).toBe(true);
    // AI 解説の領域は目次と新しいレイアウトの間
    expect(full.indexOf('id="rsn-wrap"')).toBeLessThan(full.indexOf('id="ai"'));
    expect(full.indexOf('id="ai"')).toBeLessThan(full.indexOf('id="rs2"'));

    const restricted = printBody(READY_DTO, { visibility: RESTRICTED });
    const restrictedLinks = elementsOf(elementOf(restricted, 'id="rsn"'), "<a ");
    expect(restrictedLinks.map(textOf)).toEqual(["概要", "16の特性", "組織との相性", "人物像"]);
    expect(openTag(restrictedLinks[0]!)).toContain('aria-current="true"');
    expect(restricted).not.toContain('id="rs-rk"');
    expect(restricted).not.toContain('id="ai"');
  });

  it("新しいレイアウト: #rs2 の data-comparison と、5 つのセクションの見出しと説明（16の特性は比較ありで説明が替わる）。ポップアップは印刷の形では描かない", () => {
    const ready = printBody(READY_DTO);
    expect(openTag(elementOf(ready, 'id="rs2"'))).toBe('<div id="rs2" data-comparison="ready">');
    const sections = elementsOf(elementOf(ready, 'id="rs2"'), 'class="sec"');
    expect(sections.map((s) => /id="([^"]*)"/.exec(s)?.[1])).toEqual([
      "rs-ov",
      "rs-tr",
      "rs-rk",
      "rs-fit",
      "rs-pf",
    ]);
    expect(sections.map((s) => textOf(elementOf(s, "<h2")))).toEqual([
      "概要",
      "16の特性",
      "リスク",
      "組織との相性",
      "人物像",
    ]);
    expect(textOf(elementOf(sections[1]!, "<p>"))).toBe("0〜30点。線は比較組織の平均");
    const none = printBody(null);
    expect(openTag(elementOf(none, 'id="rs2"'))).toBe('<div id="rs2" data-comparison="none">');
    expect(textOf(elementOf(elementOf(none, 'id="rs-tr"'), "<p>"))).toBe(
      "0〜30点。右上で比較組織を選ぶと平均も表示",
    );
    expect(ready).not.toContain("<dialog");
    // たたむボタンは同じ見た目で描く（type button・読み上げの名前・aria-expanded・中身）
    const fold = elementOf(sections[0]!, 'class="rs-fold"');
    expect(openTag(fold)).toBe(
      '<button type="button" class="rs-fold" aria-label="この項目を開閉" aria-expanded="true">',
    );
    expect(fold).toContain(
      '<span class="t-c">たたむ</span><span class="t-o">ひらく</span><i>▴</i>',
    );
  });
});

describe("M7-result-19 16の特性（11-4 §2.8）と特性の詳細（§2.9）", () => {
  it("凡例: 本人だけ（比較あり以外）／本人と「組織全体の平均（12人）」（比較あり）。2 つ目の凡例は「サロン平均（組織全体）」／「サロン平均（右上で比較組織を選ぶと表示されます）」（0 人でも）", () => {
    for (const kind of ["none", "loading", "empty", "error"] as const) {
      const html = traits(STATES[kind]);
      expect(textOf(elementOf(html, 'class="legend"')), kind).toBe("本人");
      expect(textOf(elementOf(html, 'class="tlg"')), kind).toBe(
        "本人の点数サロン平均（右上で比較組織を選ぶと表示されます）最も高い最も低い",
      );
    }
    const ready = traits(STATES.ready);
    expect(textOf(elementOf(ready, 'class="legend"'))).toBe("本人組織全体の平均（12人）");
    expect(textOf(elementOf(ready, 'class="tlg"'))).toBe(
      "本人の点数サロン平均（組織全体）最も高い最も低い",
    );
  });

  it("並び替えのボタン: 比較ありだけ「平均との差」。選んでいるボタンに class on と aria-pressed。「平均との差」のまま比較あり以外は、どれも押されていない表示で項目順", () => {
    const ready = traits(STATES.ready, { traitSort: "diff" });
    const seg = elementsOf(elementOf(ready, 'class="seg"'), "<button");
    expect(seg.map(textOf)).toEqual(["点数の高い順", "平均との差", "項目順"]);
    expect(seg.map((b) => /aria-pressed="(\w+)"/.exec(b)?.[1])).toEqual(["false", "true", "false"]);
    expect(openTag(seg[1]!)).toContain('class="on"');
    const none = traits(STATES.none, { traitSort: "diff" });
    const segNone = elementsOf(elementOf(none, 'class="seg"'), "<button");
    expect(segNone.map(textOf)).toEqual(["点数の高い順", "項目順"]);
    expect(segNone.map((b) => /aria-pressed="(\w+)"/.exec(b)?.[1])).toEqual(["false", "false"]);
    expect(segNone.some((b) => openTag(b).includes('class="on"'))).toBe(false);
    const rowsNone = traitRowsOf(none);
    expect(
      rowsNone.map((row) => textOf(elementOf(row, 'class="n"')).replace(/最も(高|低)い$/, "")),
    ).toEqual(VIEW.traits.map((t) => t.label));
  });

  it("一覧: 点数の高い順の 16 行、差のバッジ（比較ありのとき。丸めない差で色、小数第 1 位で 0 の差は「0.0」: K-44）、最も高い・最も低い の札と行のクラス、目盛「0」「15」「30」", () => {
    const html = traits(STATES.ready);
    const rows = traitRowsOf(html);
    expect(rows).toHaveLength(16);
    // 名前の左の .tic はアイコンだけ（文字を持たない）
    for (const row of rows) {
      expect(row).toContain('<span class="tic"><svg');
      expect(textOf(elementOf(row, 'class="tic"'))).toBe("");
    }
    const labelOf = (row: string) =>
      textOf(elementOf(row, 'class="n"')).replace(/(最も高い|最も低い)$/, "");
    // 点数の高い順（同じ値は項目順。いちばん高い特性が先、いちばん低い特性が後）
    expect(rows.map(labelOf).slice(0, 3)).toEqual(["規則遵守力", "コミュニケーション力", "敏感さ"]);
    // 13 点の 3 項目は、いちばん低い特性（謙虚さ）を同じ値の最後にする
    expect(rows.map(labelOf).slice(13)).toEqual(["こだわり", "発想力", "謙虚さ"]);
    const hi = rows.find((row) => labelOf(row) === "規則遵守力")!;
    const lo = rows.find((row) => labelOf(row) === "謙虚さ")!;
    expect(openTag(hi)).toBe('<div class="tr hi">');
    expect(openTag(lo)).toBe('<div class="tr lo">');
    expect(hi).toContain('<span class="flag ep">最も高い</span>');
    expect(lo).toContain('<span class="flag en">最も低い</span>');
    expect(rows.filter((row) => openTag(row) === '<div class="tr">')).toHaveLength(14);
    // 差のバッジと色（丸めない差で決める）
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ["協力性", "+6.5", "up"],
      ["適応力", "-1.6", "dn"],
      ["優劣性", "0.0", "eq"],
      ["謙虚さ", "0.0", "eq"],
      ["反省力", "+1.5", "up"],
      ["規則遵守力", "-1.5", "dn"],
      ["こだわり", "+1.5", "eq"],
      ["感情の豊かさ", "0.0", "eq"],
    ];
    for (const [label, text, tone] of expected) {
      const row = rows.find((r) => labelOf(r) === label)!;
      expect(elementOf(row, 'class="df'), label).toBe(`<span class="df ${tone}">${text}</span>`);
    }
    for (const key of TRAIT_KEYS) {
      const t = VIEW.traits.find((x) => x.key === key)!;
      const row = rows.find((r) => labelOf(r) === t.label)!;
      const d = t.value - TRAIT_AVERAGES[key];
      expect(row).toContain(`<span class="df ${diffTone(d)}">${formatDiffBadge(d)}</span>`);
      expect(textOf(elementOf(row, 'class="val"'))).toBe(formatOneDecimal(t.value));
      // 棒の塗りの幅と平均の線の位置（0〜30 を 0〜100%）
      expect(row).toContain(`<i style="width:${(t.value / 30) * 100}%"></i>`);
      expect(row).toContain(
        `<u style="left:calc(${(TRAIT_AVERAGES[key] / 30) * 100}% - 1px)"></u>`,
      );
      expect(row).toContain('<span class="mid"></span>');
    }
    expect(textOf(elementOf(html, 'class="ax"'))).toBe("01530");
    expect(elementsOf(elementOf(html, 'class="ax"'), "<span").map(textOf)).toEqual([
      "0",
      "15",
      "30",
    ]);
    // 比較あり以外は差のバッジと平均の線が無い
    const none = traits(STATES.none);
    expect(none).not.toContain('class="df');
    expect(none).not.toContain("<u ");
  });

  it("全同点（16 項目が同じ値）: 札は「最も高い」だけ（協力性）で、最も低い行は無い", () => {
    const view = buildResultDetailView(
      dtoOf({ ...scoreAnswers(uniformAnswers(3)), aptitudeType: "conductor" }),
    );
    const html = traits(STATES.none, { view });
    expect(count(html, 'class="flag ep"')).toBe(1);
    expect(html).not.toContain('class="flag en"');
    expect(html).not.toContain('class="tr lo"');
    const first = traitRowsOf(html)[0]!;
    expect(openTag(first)).toBe('<div class="tr hi">');
    expect(textOf(first)).toContain("協力性");
  });

  it("印刷の形でも、比較ありのとき一覧に本人の値と差のバッジが出る（PDF でもレーダーの値を文字で読める。総論 8.3 の 20）。ボタンは同じ見た目で処理なし", () => {
    const html = traits(STATES.ready, { variant: "print" });
    expect(count(html, 'class="val"')).toBe(16);
    expect(count(html, 'class="df ')).toBe(16);
    expect(count(html, "<u ")).toBe(16);
    expect(count(elementOf(html, 'class="sk-b"'), "<button")).toBe(16);
    expect(count(elementOf(html, 'class="seg"'), "<button")).toBe(3);
    // 吹き出しの当たりの線は付けない
    expect(html).not.toContain('stroke-opacity="0"');
  });

  it("項目の説明: 16 のボタンを項目順に置き、開いている項目のボタンに class on と aria-pressed。枠に「{特性名}」「本人 {値}点」と 2 行の説明（優劣性は K-33）", () => {
    const html = traits(STATES.ready, { traitHelp: "deliberateness" });
    const buttons = elementsOf(elementOf(html, 'class="sk-b"'), "<button");
    expect(buttons.map(textOf)).toEqual(VIEW.traits.map((t) => t.label));
    const pressed = buttons.filter((b) => openTag(b).includes('aria-pressed="true"'));
    expect(pressed.map(textOf)).toEqual(["優劣性"]);
    expect(openTag(pressed[0]!)).toContain('class="on"');
    const panel = elementOf(html, 'class="sk-p"');
    expect(textOf(elementOf(panel, 'class="sk-n"'))).toBe("優劣性本人 14点");
    expect(textOf(elementOf(panel, 'class="sk-s"'))).toBe("本人 14点");
    expect(textOf(elementOf(panel, 'class="sk-d"'))).toBe(
      "物事を決める前に、どれだけじっくり考えるかを表します。",
    );
    expect(textOf(elementOf(panel, 'class="sk-h"'))).toBe(
      "高いと冷静で思慮深く、低いと判断が早い反面、早とちりしやすくなります。",
    );
    expect(textOf(elementOf(html, 'class="sk-t"'))).toBe(
      "項目をタップすると、どんな力かの説明が出ます。",
    );
    // 説明を開いても並びと並び替えのボタンは変わらない（§1.4 の 12）
    const seg = elementsOf(elementOf(html, 'class="seg"'), "<button");
    expect(openTag(seg[0]!)).toContain('class="on"');
    expect(traits(STATES.ready)).not.toContain('class="sk-p"');
  });

  it("レーダー: 比較ありで平均の多角形を描き、比較あり以外は描かない", () => {
    expect(traits(STATES.ready)).toContain('fill="rgba(22,163,74,.15)"');
    for (const kind of ["none", "loading", "empty", "error"] as const) {
      expect(traits(STATES[kind]), kind).not.toContain('fill="rgba(22,163,74,.15)"');
    }
  });

  it("特性の詳細: 小見出し h3「特性の詳細」と 5 枚のカード（対人関係・行動特性・業務対応・環境適応・情緒・精神面の順）。見出しの丸いアイコンと右下の透かし", () => {
    const html = traits(STATES.none);
    expect(elementOf(html, 'class="subh"')).toBe('<h3 class="subh">特性の詳細</h3>');
    const cards = elementsOf(elementOf(html, 'id="rs-det"'), 'class="card"');
    expect(cards.map((card) => textOf(elementOf(card, "<h4")))).toEqual([
      "対人関係",
      "行動特性",
      "業務対応",
      "環境適応",
      "情緒・精神面",
    ]);
    VIEW.details.forEach((detail, i) => {
      expect(elementsOf(cards[i]!, "<li").map(textOf)).toEqual(detail.sentences);
      expect(cards[i]!).toContain('<span class="wm" aria-hidden="true"><svg');
      expect(cards[i]!).toContain('<h4><span class="cic"><svg');
    });
    expect(elementsOf(cards[4]!, "<li").map(textOf)).toEqual([
      "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
      "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
    ]);
  });
});

describe("M7-result-19 リスク・組織との相性・人物像・2 つのポップアップ（11-4 §2.10〜§2.12・§2.15）", () => {
  it("リスク: 表示値の大きい順の 7 行（.rs.lv{段階}）に表示名・棒・「NN%」・段階の札。注記の文", () => {
    const view = buildResultDetailView(
      dtoOf({ ...CONDUCTOR, risks: { ...CONDUCTOR.risks, misconduct: 90, complaint: 12.4 } }),
    );
    const html = render(createElement(RiskSection, { view }));
    const rows = elementsOf(elementOf(html, 'class="risks"'), 'class="rs ');
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => /class="(rs lv\d)"/.exec(row)?.[1])).toEqual([
      "rs lv4",
      "rs lv3",
      "rs lv3",
      "rs lv3",
      "rs lv3",
      "rs lv2",
      "rs lv1",
    ]);
    expect(rows[0]).toBe(
      '<div class="rs lv4"><div class="n">不祥事が発生する</div><div class="bar"><i style="width:90%"></i></div><div class="v">90%</div><div class="lv">高い</div></div>',
    );
    expect(textOf(elementOf(rows[6]!, 'class="n"'))).toBe("苦情を強く主張する");
    expect(textOf(elementOf(rows[6]!, 'class="v"'))).toBe("12%");
    expect(rows.map((row) => textOf(elementOf(row, 'class="lv"')))).toEqual([
      RISK_LEVEL_STYLES[4].label,
      "注意",
      "注意",
      "注意",
      "注意",
      "やや低い",
      "低い",
    ]);
    expect(textOf(elementOf(html, 'class="note"'))).toBe(
      "色分けの目安：20％未満 低い／20〜40％ やや低い／40〜60％ 注意／60％以上 高い",
    );
  });

  it("組織との相性: 比較ありで一言と平均の印（%）、本人の印は 0〜100 に収めた位置（負の値は左端で注記なし）、凡例「組織全体の平均（12人）」とポジションの全行（先頭の・なし）", () => {
    const html = render(createElement(FitSection, { view: VIEW, comparison: STATES.ready }));
    expect(textOf(elementOf(html, 'class="fitlg"'))).toBe("本人組織全体の平均（12人）");
    const axes = elementsOf(elementOf(html, 'class="fit"'), 'class="fr"');
    expect(axes.map((axis) => textOf(elementOf(axis, 'class="h"')))).toEqual([
      "適応する環境組織より「個人優先型」寄り",
      "適応する業務組織とほぼ同じ",
      "思考の傾向組織より「客観的」寄り",
      "意思決定組織とほぼ同じ",
      "ストレス耐性組織より「ストレスを感じやすい」寄り",
    ]);
    const me = axes.map((axis) => /class="me" style="left:([^"]*)"/.exec(axis)?.[1]);
    const og = axes.map((axis) => /class="og" style="left:([^"]*)"/.exec(axis)?.[1]);
    expect(me).toEqual(["0%", "0%", "11%", "0%", "0%"]);
    expect(og).toEqual(["10%", "0%", "2%", "0%", "50%"]);
    // 線の行は role="img" で、本人の位置（0〜100 に収めた値。負の値は 0）を読み上げる（今の相性スライダーと同じ文。§2.11・§2.21）
    expect(
      axes.map((axis) => /<div class="row" role="img" aria-label="([^"]*)"/.exec(axis)?.[1]),
    ).toEqual([
      "適応する環境: 個人優先型 から 組織優先型 のうち 0",
      "適応する業務: 変化の少ない業務 から 変化の多い業務 のうち 0",
      "思考の傾向: 主観的 から 客観的 のうち 11",
      "意思決定: 依存的 から 主体的 のうち 0",
      "ストレス耐性: ストレスを感じやすい から ストレスを感じにくい のうち 0",
    ]);
    // 平均の印の後ろに本人の印（上に描く。z-index は CSS）
    for (const axis of axes)
      expect(axis.indexOf('class="og"')).toBeLessThan(axis.indexOf('class="me"'));
    expect(count(axes[0]!, 'class="tick"')).toBe(5);
    expect(axes[0]).toContain('<div class="l">個人優先型</div>');
    expect(axes[0]).toContain('<div class="r">組織優先型</div>');
    expect(html).not.toContain("計算値が 0 未満");
    expect(html).not.toMatch(/-3|−3|-13/);
    const note = elementOf(html, 'class="fitnote"');
    expect(textOf(elementOf(note, 'class="t"'))).toBe(
      "組織内のポジション：協調性を重視するリーダータイプ",
    );
    expect(elementsOf(note, "<li").map(textOf)).toEqual([
      "責任者とスタッフの橋渡し役として活躍出来る方が多い",
      "周りと協調性を保ちながらバランスを取って集団をリードするタイプ",
      "幹部候補として活躍が期待出来る",
    ]);
  });

  it("組織との相性: 比較あり以外は一言・平均の印・ポジションを出さず、凡例は比較なしの文言（0 人は比較組織名の文）", () => {
    for (const [kind, text] of [
      ["none", NONE_TEXT],
      ["loading", LOADING_TEXT],
      ["empty", EMPTY_TEXT],
      ["error", NONE_TEXT],
    ] as const) {
      const html = render(createElement(FitSection, { view: VIEW, comparison: STATES[kind] }));
      expect(textOf(elementOf(html, 'class="fitlg"')), kind).toBe(`本人${text}`);
      expect(html).toContain(`<span class="empty">${text}</span>`);
      expect(html).not.toContain('class="og"');
      expect(html).not.toContain('class="fitnote"');
      expect(count(html, 'class="me"')).toBe(5);
      expect(count(html, '<div class="row" role="img" aria-label="')).toBe(5);
      expect(html).toContain('aria-label="思考の傾向: 主観的 から 客観的 のうち 11"');
      expect(html).not.toContain("寄り");
    }
  });

  it("人物像: 絵（alt 空）・キャラクター名・タイプ名・特徴、向いている仕事（太字の適性と改行と適性職種）、本人へのアドバイス（空なら囲みなし）", () => {
    const html = render(createElement(ProfileSection, { view: VIEW }));
    const prof = elementOf(html, 'id="rs-prof"');
    const pic = elementOf(prof, 'class="pf-pic"');
    expect(pic).toContain('src="/images/types/conductor.svg" alt=""');
    expect(textOf(elementOf(pic, 'class="pf-nm"'))).toBe(VIEW.type.characterName);
    expect(textOf(elementOf(pic, 'class="pf-tp"'))).toBe(VIEW.type.label);
    const labels = elementsOf(prof, 'class="lbl"').map(textOf);
    expect(labels).toEqual(["特徴", "向いている仕事", "本人へのアドバイス"]);
    expect(prof).toContain(`<p>${VIEW.type.characteristics}</p>`);
    expect(prof).toContain(`<p><b>${VIEW.type.aptitude}</b>\n${VIEW.type.suitableJobs}</p>`);
    expect(textOf(elementOf(prof, 'class="call"'))).toBe(`本人へのアドバイス${VIEW.type.advice}`);
    const noAdvice = render(
      createElement(ProfileSection, { view: { ...VIEW, type: { ...VIEW.type, advice: "" } } }),
    );
    expect(noAdvice).not.toContain('class="call"');
    expect(noAdvice).not.toContain("本人へのアドバイス");
  });

  it("2 つのポップアップ: 見出し、列 3 つ（項目・ポジティブな面・ネガティブな面）、16 行が項目順。大きい場合の適応力のネガティブな面は「個性が弱い、主体性がない」（K-32 ⑩）", () => {
    const html = render(
      createElement(TraitHighlightPopups, { traits: VIEW.traits, open: null, onClose: noop }),
    );
    const dialogs = elementsOf(html, "<dialog");
    expect(dialogs).toHaveLength(2);
    expect(dialogs.map((d) => textOf(elementOf(d, 'class="dialog__title"')))).toEqual([
      "項目のポイントが大きい場合の特性",
      "項目のポイントが小さい場合の特性",
    ]);
    dialogs.forEach((dialog, i) => {
      expect(openTag(dialog)).toContain('class="dialog rd-pop"');
      expect(elementsOf(dialog, "<th ").map(textOf)).toEqual([
        "項目",
        "ポジティブな面",
        "ネガティブな面",
      ]);
      const rows = elementsOf(elementOf(dialog, "<tbody"), "<tr");
      expect(rows).toHaveLength(16);
      expect(rows.map((row) => textOf(elementOf(row, 'class="c-item"')))).toEqual(
        VIEW.traits.map((t) => t.label),
      );
      rows.forEach((row, j) => {
        const t = VIEW.traits[j]!;
        expect(textOf(elementOf(row, 'class="c-pos"'))).toBe(
          i === 0 ? t.highPositive : t.lowPositive,
        );
        expect(textOf(elementOf(row, 'class="c-neg"'))).toBe(
          i === 0 ? t.highNegative : t.lowNegative,
        );
      });
      // 閉じるボタンは × の線のアイコン（読み上げの名前「閉じる」）
      const close = elementOf(dialog, 'class="icon-btn"');
      expect(openTag(close)).toContain('aria-label="閉じる"');
      expect(close).toContain('<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>');
    });
    expect(textOf(elementOf(elementsOf(dialogs[0]!, "<tr")[2]!, 'class="c-neg"'))).toBe(
      "個性が弱い、主体性がない",
    );
  });
});

describe("M7-result-05 信頼係数の 2 か所の判定（描画。11-4 §2.4・§2.7.4）", () => {
  const withReliability = (raw: number): ResultDetailView => ({
    ...VIEW,
    reliability: raw,
    meta: { ...VIEW.meta, reliabilityRaw: raw },
  });
  const meta = (raw: number) =>
    render(createElement(ResultMetaLine, { meta: withReliability(raw).meta }));
  const card = (raw: number) =>
    elementsOf(
      overview(STATES.none, FULL_VISIBILITY, withReliability(raw)),
      'class="card kpi t-',
    )[0]!;

  it("受験情報の 1 行: 丸める前の値で判定（79.6 → 「80%」を b.mid と「結果は参考程度に」、39.6 → b.low、89.71 → 「90%」で通常の色・注記なし、0 → 項目なし）。role group と読み上げの名前", () => {
    const line79 = meta(79.6);
    expect(openTag(line79)).toBe('<div id="rsm" role="group" aria-label="受験の情報">');
    expect(elementsOf(line79, "<span>").map(textOf)).toEqual([
      "受験日2026/4/5",
      "職業責任者",
      "タイプコンダクター",
      "信頼係数80%結果は参考程度に",
    ]);
    expect(line79).toContain('<b class="mid">80%</b><span class="note">結果は参考程度に</span>');
    expect(meta(39.6)).toContain(
      '<b class="low">40%</b><span class="note">結果は参考程度に</span>',
    );
    const line89 = meta(89.71);
    expect(line89).toContain("<b>90%</b></span>");
    expect(line89).not.toContain('class="note"');
    const line0 = meta(0);
    expect(line0).not.toContain("信頼係数");
    expect(count(line0, "<span>")).toBe(3);
  });

  it("概要の信頼係数のカード: 表示値で判定（79.6 → 表示値 80 で t-good と「回答は信頼できます」、39.6 → 40 で t-mid、0 → 「0%」で t-low）", () => {
    const good = card(79.6);
    expect(openTag(good)).toBe('<div class="card kpi t-good">');
    expect(textOf(elementOf(good, 'class="v"'))).toBe("80%");
    expect(good).toContain('style="width:80%"');
    expect(textOf(elementOf(good, 'class="s"'))).toBe("回答は信頼できます");
    const mid = card(39.6);
    expect(openTag(mid)).toBe('<div class="card kpi t-mid">');
    expect(textOf(elementOf(mid, 'class="s"'))).toBe("結果は参考程度に見てください");
    const low = card(0);
    expect(openTag(low)).toBe('<div class="card kpi t-low">');
    expect(textOf(elementOf(low, 'class="v"'))).toBe("0%");
    expect(textOf(elementOf(low, 'class="s"'))).toBe("結果は参考程度に見てください");
    expect(openTag(card(89.71))).toBe('<div class="card kpi t-good">');
  });

  it("見出しの塊（印刷の形）にも同じ受験情報の 1 行が 3 段目に入る", () => {
    const html = render(
      createElement(ComparisonProvider, {
        resultId: "ResSample0001",
        initialComparison: null,
        children: createElement(ResultHead, { name: VIEW.name, meta: VIEW.meta, variant: "print" }),
      }),
    );
    const head = elementOf(html, 'id="rd-head"');
    expect(head.indexOf('class="rd-titlerow"')).toBeLessThan(head.indexOf('id="rsm"'));
    expect(textOf(elementOf(head, 'id="rsm"'))).toBe(
      "受験日2026/4/5職業責任者タイプコンダクター信頼係数79%結果は参考程度に",
    );
  });
});
