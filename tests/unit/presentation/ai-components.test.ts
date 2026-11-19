// 11-6 §2.1〜§2.5・§2.11・§2.14・別表D（M7-ai-38・39 の描画の分と K-31 ⑤）。AI 解説の部品のうち、画面の状態の Context が要らない部品
// （アイコン・タブの行・生成前の案内・生成ボタン・生成中・失敗の枠・判定チップ・採用向けの表示・育成・定着の 8 項目の入力欄と表示）を
// renderToStaticMarkup で静的な HTML に描いて確かめる（DOM のライブラリは足さない。chart-components.test.ts と同じ作り）。アイコンの形は
// 11-6 の別表D の表を読んで比べる。育成・定着のパネル（TrainingPanel）は通知（ToastProvider）で包み、状態ごとに出す部品と並び（§2.3.5 の
// 表）を描いて確かめる。押したときの動き（未選択の確かめ・生成・読み直し・焦点）と領域（AiArea。画面の状態）は E2E（M7-ai-38・39・42 と
// D の段の a11y）で確かめる。見本の出力は架空の文
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validTrainingOutput } from "../ai/helpers";

import { AiFailureNotice } from "@/components/admin/result/ai/AiFailureNotice";
import { AiGenerateButton } from "@/components/admin/result/ai/AiGenerateButton";
import { AiGenerating } from "@/components/admin/result/ai/AiGenerating";
import {
  ChartIcon,
  ChatIcon,
  ChevronDownIcon,
  SparkIcon,
  SparklesIcon,
  SproutIcon,
  UserIcon,
  ZapIcon,
} from "@/components/admin/result/ai/ai-icons";
import { AiIntro } from "@/components/admin/result/ai/AiIntro";
import { AiTabs } from "@/components/admin/result/ai/AiTabs";
import { RecruitmentView } from "@/components/admin/result/ai/RecruitmentView";
import { TrainingContextForm } from "@/components/admin/result/ai/TrainingContextForm";
import { TrainingPanel } from "@/components/admin/result/ai/TrainingPanel";
import { TrainingView } from "@/components/admin/result/ai/TrainingView";
import { VerdictChips } from "@/components/admin/result/ai/VerdictChips";
import { ToastProvider } from "@/components/ui/Toast";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput, TrainingAiOutput } from "@/lib/ai/types";
import {
  TRAINING_CONTEXT_ITEMS,
  TRAINING_CONTEXT_KEYS,
  type TrainingContext,
  type TrainingContextKey,
} from "@/lib/masters/training-context";
import {
  EMPTY_TRAINING_CONTEXT_DRAFT,
  type TrainingContextDraft,
  type TrainingContextMode,
} from "@/lib/presentation/ai-area";
import { AI_TEXTS, aiFailureText } from "@/lib/presentation/ai-texts";
import type { TrainingAiDto } from "@/lib/services/dto/ai";

const SPEC = readFileSync(
  fileURLToPath(new URL("../../../docs/基本設計/11_参照元の更新/11-6_AI解説.md", import.meta.url)),
  "utf8",
);

// ---- HTML を読む補助（result-detail-sections.test.ts と同じ形）

/** marker を含む開きタグから、その要素の終わりまで */
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

/** 開きタグをすべて（要素名で） */
const tagsOf = (html: string, name: string): string[] =>
  html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
/** 最初の開きタグ */
const openTag = (element: string): string => element.slice(0, element.indexOf(">") + 1);
/** 文字だけ（タグを除き、React がエスケープした文字を戻す） */
const textOf = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
/** 子の要素を上から（直下だけ） */
function childElements(element: string): string[] {
  const inner = element.slice(element.indexOf(">") + 1, element.lastIndexOf("<"));
  const out: string[] = [];
  let pos = 0;
  while (pos < inner.length) {
    const lt = inner.indexOf("<", pos);
    if (lt < 0) break;
    const child = elementOf(inner, inner.slice(lt, inner.indexOf(">", lt) + 1), lt);
    out.push(child);
    pos = lt + child.length;
  }
  return out;
}
/** 要素の名前 */
const tagName = (element: string): string => /^<([a-z0-9]+)/i.exec(element)?.[1] ?? "";
/** 子の要素の開きタグの class を上から（直下だけ。class の無い要素は <要素の名前>） */
const childClasses = (element: string): string[] =>
  childElements(element).map((child) => attr(openTag(child), "class") ?? `<${tagName(child)}>`);

const render = <P extends object>(component: ComponentType<P>, props: P): string =>
  renderToStaticMarkup(createElement(component, props));
/** 引数の無い部品（アイコン・生成中） */
const renderPlain = (component: ComponentType): string =>
  renderToStaticMarkup(createElement(component));

// ---- 見本（架空の出力。形はスタブの出力と同じ）

const OUTPUT: AiAnalysisOutput = {
  summary: "テストテスト 01さんは、確認用の見本の人物です。",
  verdict: { sokusenryoku: "中", teichaku_risk: "低い", sougou: "要検討" },
  strengths: ["見本の強みの 1 件目です。", "見本の強みの 2 件目です。"],
  cautions: ["見本の注意点の 1 件目です。", "見本の注意点の 2 件目です。"],
  questions: [
    { q: "見本の面接質問の 1 件目です。", intent: "見本の見極めたいことの 1 件目です。" },
    { q: "見本の面接質問の 2 件目です。", intent: "見本の見極めたいことの 2 件目です。" },
    { q: "見本の面接質問の 3 件目です。", intent: "見本の見極めたいことの 3 件目です。" },
  ],
  retention: {
    levers: [
      { label: "関わり方", text: "見本の関わり方の説明です。" },
      { label: "任せ方", text: "見本の任せ方の説明です。" },
      { label: "認め方", text: "見本の認め方の説明です。" },
      { label: "伸ばし方", text: "見本の伸ばし方の説明です。" },
    ],
    sign: "見本の辞めそうなサインです。",
    action: "見本の引き止めの一手です。",
  },
};

/** 判定の値を変えた出力（スキーマに無い値・空の値も入れる） */
const withVerdict = (
  verdict: Record<keyof AiAnalysisOutput["verdict"], string>,
): AiAnalysisOutput => ({ ...OUTPUT, verdict }) as unknown as AiAnalysisOutput;

// ---- アイコン（§2.14・別表D）

const ICONS: Readonly<Record<string, ComponentType>> = {
  SparkIcon,
  SparklesIcon,
  ChartIcon,
  UserIcon,
  ChatIcon,
  ZapIcon,
  SproutIcon,
  ChevronDownIcon,
};

/** 別表D の表の行（名前・描き方・線の幅・path の d） */
const ICON_ROWS = [
  ...SPEC.slice(SPEC.indexOf("## 別表D ")).matchAll(
    /^\| `(\w+Icon)`(?:（[^|]*）)? \| (塗り|線) \| ([^|]+) \| (.+) \|$/gm,
  ),
].map((m) => ({
  name: m[1]!,
  fill: m[2] === "塗り",
  strokeWidth: m[3]!.trim(),
  paths: m[4]!.split("／").map((d) => d.trim().replace(/^`|`$/g, "")),
}));

describe("（ID なし）アイコン（11-6 §2.14・別表D。K-05）", () => {
  it("別表D の 8 個（SparkIcon・SparklesIcon・ChartIcon・UserIcon・ChatIcon・ZapIcon・SproutIcon・ChevronDownIcon）を名前で export している", () => {
    expect(ICON_ROWS.map((row) => row.name)).toEqual(Object.keys(ICONS));
  });

  it("どれも viewBox 0 0 24 24・幅と高さ 1em・aria-hidden・クラス ai-ico（稲妻と芽は ai-ico--zap・ai-ico--sprout も、山形は svg 自身に ai-chev も）。線は currentColor の線（端と角は丸）、塗りは currentColor の塗り。path の d と線の幅は別表D のまま。style の属性は無い", () => {
    const extraClass: Readonly<Record<string, string>> = {
      ZapIcon: "ai-ico--zap",
      SproutIcon: "ai-ico--sprout",
      ChevronDownIcon: "ai-chev",
    };
    for (const row of ICON_ROWS) {
      const html = renderPlain(ICONS[row.name]!);
      const svg = tagsOf(html, "svg")[0]!;
      expect(attr(svg, "viewBox"), row.name).toBe("0 0 24 24");
      expect(attr(svg, "width"), row.name).toBe("1em");
      expect(attr(svg, "height"), row.name).toBe("1em");
      expect(attr(svg, "aria-hidden"), row.name).toBe("true");
      const extra = extraClass[row.name];
      const className = extra === undefined ? "ai-ico" : `ai-ico ${extra}`;
      expect(attr(svg, "class"), row.name).toBe(className);
      if (row.fill) {
        expect(attr(svg, "fill"), row.name).toBe("currentColor");
        expect(attr(svg, "stroke"), row.name).toBeUndefined();
        expect(row.strokeWidth, row.name).toBe("—");
      } else {
        expect(attr(svg, "fill"), row.name).toBe("none");
        expect(attr(svg, "stroke"), row.name).toBe("currentColor");
        expect(attr(svg, "stroke-width"), row.name).toBe(row.strokeWidth);
        expect(attr(svg, "stroke-linecap"), row.name).toBe("round");
        expect(attr(svg, "stroke-linejoin"), row.name).toBe("round");
      }
      expect(
        tagsOf(html, "path").map((tag) => attr(tag, "d")),
        row.name,
      ).toEqual(row.paths);
      expect(html, row.name).not.toContain("style=");
    }
  });
});

// ---- タブの行（§2.2）

const tabs = (kinds: readonly AiAnalysisKind[], selected: AiAnalysisKind) =>
  render(AiTabs, { tabs: kinds, selected, onSelect: () => undefined, tabRefs: { current: {} } });

describe("M7-ai-38 の描画の分 AiTabs（§2.2。タブの ARIA）", () => {
  it("role=tablist・読み上げの名前「AI解説の種類」に、visibleTabs の順の role=tab のボタン（文字は採用向けAI解説・育成・定着AI解説、左に sparkles）", () => {
    const html = tabs(["recruitment", "training"], "recruitment");
    const list = openTag(html);
    expect(attr(list, "class")).toBe("ai-tabs");
    expect(attr(list, "role")).toBe("tablist");
    expect(attr(list, "aria-label")).toBe("AI解説の種類");
    const buttons = tagsOf(html, "button");
    expect(buttons).toHaveLength(2);
    expect(buttons.map((tag) => attr(tag, "role"))).toEqual(["tab", "tab"]);
    expect(buttons.map((tag) => attr(tag, "type"))).toEqual(["button", "button"]);
    expect(buttons.map((tag) => attr(tag, "class"))).toEqual(["ai-tab", "ai-tab"]);
    expect(buttons.map((tag) => attr(tag, "id"))).toEqual([
      "ai-tab-recruitment",
      "ai-tab-training",
    ]);
    expect(buttons.map((tag) => attr(tag, "aria-controls"))).toEqual([
      "ai-panel-recruitment",
      "ai-panel-training",
    ]);
    expect(
      [elementOf(html, 'id="ai-tab-recruitment"'), elementOf(html, 'id="ai-tab-training"')].map(
        textOf,
      ),
    ).toEqual(["採用向けAI解説", "育成・定着AI解説"]);
    expect(tagsOf(elementOf(html, 'id="ai-tab-training"'), "svg")).toHaveLength(1);
  });

  it("選んでいるタブだけ aria-selected=true・tabIndex 0、ほかは false・-1", () => {
    const first = tagsOf(tabs(["recruitment", "training"], "recruitment"), "button");
    expect(first.map((tag) => [attr(tag, "aria-selected"), attr(tag, "tabindex")])).toEqual([
      ["true", "0"],
      ["false", "-1"],
    ]);
    const second = tagsOf(tabs(["recruitment", "training"], "training"), "button");
    expect(second.map((tag) => [attr(tag, "aria-selected"), attr(tag, "tabindex")])).toEqual([
      ["false", "-1"],
      ["true", "0"],
    ]);
  });
});

// ---- 生成前の案内（§2.3.1・§2.4.2・§2.5.2）

describe("M7-ai-38 の描画の分 AiIntro（生成前の案内）", () => {
  it("採用向け: 見出し h2.ih-t「AI 採用アドバイザー」と副題、特徴 3 行（太字と説明。アイコンはグラフ・人・吹き出し）。四角とアイコンは aria-hidden。枠と警告は無い", () => {
    const html = render(AiIntro, { kind: "recruitment" });
    expect(attr(openTag(html), "class")).toBe("ai-intro");
    expect(openTag(elementOf(html, 'class="ih-t"'))).toBe('<h2 class="ih-t">');
    expect(textOf(elementOf(html, 'class="ih-t"'))).toBe("AI 採用アドバイザー");
    expect(textOf(elementOf(html, 'class="ih-s"'))).toBe(
      "診断結果を、面接と採用判断で使える形に変換します",
    );
    expect(attr(openTag(elementOf(html, 'class="ih-sp"')), "aria-hidden")).toBe("true");
    const feats = elementOf(html, 'class="feats"');
    expect(childClasses(feats)).toEqual(["feat", "feat", "feat"]);
    const texts = AI_TEXTS.intro.recruitment.features;
    let from = 0;
    for (const feature of texts) {
      const t = elementOf(feats, 'class="fi-t"', from);
      const d = elementOf(feats, 'class="fi-d"', feats.indexOf(t, from));
      expect(textOf(t)).toBe(feature.title);
      expect(textOf(d)).toBe(feature.description);
      from = feats.indexOf(d, from) + d.length;
    }
    expect(texts.map((feature) => feature.title)).toEqual([
      "即戦力性・離職リスク・総合判定",
      "この人物の要約と、強み・注意点",
      "面接で深掘りすべき質問",
    ]);
    const icons = [
      ...feats.matchAll(/<span class="fi" aria-hidden="true">(<svg[\s\S]*?<\/svg>)/g),
    ].map((m) => m[1]!);
    expect(icons).toEqual([renderPlain(ChartIcon), renderPlain(UserIcon), renderPlain(ChatIcon)]);
    expect(html).not.toContain('class="need"');
    expect(html).not.toContain('class="warn"');
  });

  it("育成・定着: 根に ai-intro--training、特徴のアイコンは稲妻・芽・吹き出し、続けて枠（太字 b）と警告（「！」の丸は aria-hidden、太字 b）", () => {
    const html = render(AiIntro, { kind: "training" });
    expect(attr(openTag(html), "class")).toBe("ai-intro ai-intro--training");
    expect(textOf(elementOf(html, 'class="ih-t"'))).toBe("AI 育成・定着アドバイザー");
    expect(textOf(elementOf(html, 'class="ih-s"'))).toBe(
      "すでに働いているスタッフを、どう育て、どう定着させるか",
    );
    const feats = elementOf(html, 'class="feats"');
    const icons = [
      ...feats.matchAll(/<span class="fi" aria-hidden="true">(<svg[\s\S]*?<\/svg>)/g),
    ].map((m) => m[1]!);
    expect(icons).toEqual([renderPlain(ZapIcon), renderPlain(SproutIcon), renderPlain(ChatIcon)]);
    const need = elementOf(html, 'class="need"');
    expect(openTag(need)).toBe('<p class="need">');
    expect(textOf(need)).toBe(
      "下の8項目にご記入いただくことで、その方の今の状況に合わせた内容を生成します。すべて選択式で、20秒ほどで完了します。",
    );
    expect(textOf(elementOf(need, "<b>"))).toBe("その方の今の状況に合わせた内容");
    const warn = elementOf(html, 'class="warn"');
    const mark = elementOf(warn, 'class="warn-i"');
    expect(openTag(mark)).toBe('<span class="warn-i" aria-hidden="true">');
    expect(textOf(mark)).toBe("！");
    const body = elementOf(warn, "<p>");
    expect(textOf(body)).toBe(
      "一度生成した内容は、あとから修正できません。生成前に入力内容をご確認ください。",
    );
    expect(textOf(elementOf(body, "<b>"))).toBe("あとから修正できません");
    // 並び: 見出しの行 → 特徴 → 枠 → 警告
    expect(childClasses(html)).toEqual(["ih", "feats", "need", "warn"]);
  });
});

// ---- 生成ボタン（§2.3.2）

describe("M7-ai-38 の描画の分 AiGenerateButton（生成ボタン）", () => {
  it("有効: 押せるボタン（type button・.ai-gen-btn・sparkles と「採用向けAI解説を生成」）で、準備中の注記は無い", () => {
    const html = render(AiGenerateButton, { kind: "recruitment", enabled: true });
    const button = elementOf(html, "<button");
    expect(openTag(button)).toBe('<button type="button" class="ai-gen-btn">');
    expect(textOf(button)).toBe("採用向けAI解説を生成");
    expect(tagsOf(button, "svg")).toHaveLength(1);
    expect(html).not.toContain("ai-note");
  });

  it("有効でない: 押せないボタン（disabled）と、すぐ後に div.ai-note「この AI 解説は準備中です。」", () => {
    const html = render(AiGenerateButton, { kind: "training", enabled: false });
    const button = elementOf(html, "<button");
    expect(attr(openTag(button), "disabled")).toBe("");
    expect(textOf(button)).toBe("育成・定着AI解説を生成");
    expect(html.slice(button.length)).toBe('<div class="ai-note">この AI 解説は準備中です。</div>');
  });

  it("有効でも 404 の後（disabled）は押せない。準備中の注記は出さない", () => {
    const html = render(AiGenerateButton, { kind: "recruitment", enabled: true, disabled: true });
    expect(attr(openTag(elementOf(html, "<button")), "disabled")).toBe("");
    expect(html).not.toContain("ai-note");
  });
});

// ---- 生成中（§2.3.3）

describe("M7-ai-38 の描画の分 AiGenerating（生成中）", () => {
  it("role=status は .ai-load-card（見出しと 2 行の説明を含む）。輪（svg.spinner viewBox 0 0 50 50、中心 (25, 25)・半径 20・塗りなし・線の幅 5 の track と arc、中央に「✦」）と点 3 つは aria-hidden", () => {
    const html = renderPlain(AiGenerating);
    expect(openTag(html)).toBe('<div class="ai-loading">');
    const card = elementOf(html, 'class="ai-load-card"');
    expect(openTag(card)).toBe('<div class="ai-load-card" role="status">');
    expect(childClasses(card)).toEqual(["ring", "ttl", "sub", "dots"]);
    const ring = elementOf(card, 'class="ring"');
    expect(attr(openTag(ring), "aria-hidden")).toBe("true");
    const svg = tagsOf(ring, "svg")[0]!;
    expect(attr(svg, "class")).toBe("spinner");
    expect(attr(svg, "viewBox")).toBe("0 0 50 50");
    const circles = tagsOf(ring, "circle");
    expect(circles.map((tag) => attr(tag, "class"))).toEqual(["track", "arc"]);
    for (const circle of circles) {
      expect([attr(circle, "cx"), attr(circle, "cy"), attr(circle, "r")]).toEqual([
        "25",
        "25",
        "20",
      ]);
      expect(attr(circle, "fill")).toBe("none");
      expect(attr(circle, "stroke-width")).toBe("5");
    }
    expect(elementOf(ring, 'class="spark"')).toContain(renderPlain(SparkIcon));
    expect(textOf(elementOf(card, 'class="ttl"'))).toBe("AIが解説を作成しています");
    expect(elementOf(card, 'class="sub"')).toBe(
      '<div class="sub">スコアを読み込み、人物の要約・面接のアドバイスを生成中…<br/>完了まで30~90秒ほどお待ちください</div>',
    );
    const dots = elementOf(card, 'class="dots"');
    expect(openTag(dots)).toBe('<div class="dots" aria-hidden="true">');
    expect(tagsOf(dots, "span")).toHaveLength(3);
  });
});

// ---- 失敗の枠（§2.3.4）

describe("M7-ai-38・42 の描画の分 AiFailureNotice（失敗の枠）", () => {
  it("div.ai-fail（role=alert）に、T-18 に続けた理由の文", () => {
    const html = render(AiFailureNotice, {
      text: `${AI_TEXTS.failed}${aiFailureText("invalid_json")}`,
    });
    expect(openTag(html)).toBe('<div class="ai-fail" role="alert">');
    expect(textOf(html)).toBe(
      "AI解説の生成に失敗しました。AI の応答を解釈できませんでした。再試行してください",
    );
  });

  it("10 分たっても終わらないときは T-29", () => {
    const html = render(AiFailureNotice, { text: AI_TEXTS.pollingTimeout });
    expect(textOf(html)).toBe("時間内に完了しませんでした。ページを再読み込みしてください");
  });
});

// ---- 判定チップと採用向けの表示（§2.4.3・§2.4.4）

describe("M7-ai-38 の描画の分 VerdictChips（判定チップ。§2.4.4）", () => {
  const chips = (output: AiAnalysisOutput) => {
    const html = render(VerdictChips, { verdict: output.verdict });
    return [...html.matchAll(/<div class="vchip ([a-z]+)">/g)].map((m) => {
      const chip = elementOf(html, m[0], m.index);
      return {
        tone: m[1],
        label: textOf(elementOf(chip, 'class="vk"')),
        value: textOf(elementOf(chip, 'class="vv"')),
        dot: openTag(elementOf(chip, 'class="vdot"')),
      };
    });
  };

  it("順は即戦力性 → 離職リスク → 総合判定。見本（中・低い・要検討）は mid・good・warn。値の前の点は aria-hidden", () => {
    expect(chips(OUTPUT)).toEqual([
      {
        tone: "mid",
        label: "即戦力性",
        value: "中",
        dot: '<span class="vdot" aria-hidden="true">',
      },
      {
        tone: "good",
        label: "離職リスク",
        value: "低い",
        dot: '<span class="vdot" aria-hidden="true">',
      },
      {
        tone: "warn",
        label: "総合判定",
        value: "要検討",
        dot: '<span class="vdot" aria-hidden="true">',
      },
    ]);
  });

  it("値を変えた出力: 非常に高い → good、やや高い → warn、非推奨 → bad。空の値は「-」で mid", () => {
    const changed = withVerdict({
      sokusenryoku: "非常に高い",
      teichaku_risk: "やや高い",
      sougou: "非推奨",
    });
    expect(chips(changed).map((chip) => [chip.tone, chip.value])).toEqual([
      ["good", "非常に高い"],
      ["warn", "やや高い"],
      ["bad", "非推奨"],
    ]);
    const empty = withVerdict({ sokusenryoku: "", teichaku_risk: "", sougou: "" });
    expect(chips(empty).map((chip) => [chip.tone, chip.value])).toEqual([
      ["mid", "-"],
      ["mid", "-"],
      ["mid", "-"],
    ]);
  });
});

describe("M7-ai-38 の描画の分 RecruitmentView（採用向けの表示。§2.4.3）", () => {
  const html = render(RecruitmentView, { output: OUTPUT });
  const body = elementOf(html, 'class="ai-body"');
  /** 節を包む要素（クラスなし。本文の 3 つ目の子で、本文の中で最初の属性の無い div） */
  const sectionsOf = (fragment: string) => elementOf(fragment, "<div>");

  it("カードの見出し帯: 「✦」（aria-hidden）と h2「AI 採用・育成アドバイザー」", () => {
    expect(openTag(html)).toBe('<div class="ai-rec">');
    const head = elementOf(html, 'class="ai-head"');
    expect(childClasses(head)).toEqual(["spark", "<h2>"]);
    expect(attr(openTag(elementOf(head, 'class="spark"')), "aria-hidden")).toBe("true");
    expect(textOf(elementOf(head, "<h2>"))).toBe("AI 採用・育成アドバイザー");
  });

  it("本文の並び: 注意書き（p の要素）→ 判定チップ → 節を包む要素 → 末尾（T-09）", () => {
    expect(childClasses(body)).toEqual(["ai-caution", "verdict", "<div>", "ai-foot"]);
    const caution = elementOf(body, 'class="ai-caution"');
    expect(openTag(caution)).toBe('<p class="ai-caution">');
    expect(textOf(caution)).toBe(
      "ご注意：この解説は「個人」だけを見た結果です。採用の判断では、「概要」で比較組織を選んだときに出る「組織との合致度」が高い人ほど、採用しやすい目安になります。",
    );
    expect(textOf(elementOf(body, 'class="ai-foot"'))).toBe(
      "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は責任者が内容をご確認のうえご活用ください。",
    );
  });

  it("節の並び: 要約 → 強み・注意点 → 質問 → 接し方（と辞めそうなサイン）。最後の節が包む要素の最後の子（下の余白 0）", () => {
    const sections = sectionsOf(body);
    expect(childClasses(sections)).toEqual(["ai-sec", "ai-sec", "ai-sec", "ai-sec"]);
    const labels = [...sections.matchAll(/<h3 class="ai-label">/g)].map((m) =>
      textOf(elementOf(sections, m[0], m.index)),
    );
    expect(labels).toEqual([
      "この人物の要約",
      "面接で深掘りすべき質問",
      "長く働いてもらうための接し方・育て方",
    ]);
    expect(textOf(elementOf(sections, 'class="ai-p"'))).toBe(OUTPUT.summary);
    // 強み・注意点（h4 と箇条書き）
    const strength = elementOf(sections, 'class="mini strength"');
    expect(textOf(elementOf(strength, "<h4>"))).toBe("◎ このサロンで活きる強み");
    expect(tagsOf(strength, "li")).toHaveLength(2);
    const caution = elementOf(sections, 'class="mini caution"');
    expect(textOf(elementOf(caution, "<h4>"))).toBe("△ 採用前に見極めたい注意点");
    expect(textOf(elementOf(caution, 'class="ilist"'))).toBe(OUTPUT.cautions.join(""));
    // 質問（番号 1 から、「見極め：」と intent）
    const questions = elementOf(sections, 'class="qlist"');
    expect([...questions.matchAll(/<span class="qn">(\d+)<\/span>/g)].map((m) => m[1])).toEqual([
      "1",
      "2",
      "3",
    ]);
    const intent = elementOf(questions, 'class="qintent"');
    expect(textOf(elementOf(intent, 'class="e"'))).toBe("見極め：");
    expect(textOf(intent)).toBe(`見極め：${OUTPUT.questions[0]!.intent}`);
    // 接し方の札と本文、辞めそうなサイン（h4 と「サイン」「一手」）
    const levers = elementOf(sections, 'class="alist"');
    expect([...levers.matchAll(/<span class="ahead">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual([
      "関わり方",
      "任せ方",
      "認め方",
      "伸ばし方",
    ]);
    const alert = elementOf(sections, 'class="retain-alert"');
    expect(openTag(elementOf(alert, 'class="ra-head"'))).toBe('<h4 class="ra-head">');
    expect(textOf(elementOf(alert, 'class="ra-head"'))).toBe(
      "⚠ 辞めそうなサイン ＆ 引き止めの一手",
    );
    expect(
      [...alert.matchAll(/<div class="ra-row">/g)].map((m) =>
        textOf(elementOf(alert, m[0], m.index)),
      ),
    ).toEqual([`サイン${OUTPUT.retention.sign}`, `一手${OUTPUT.retention.action}`]);
    // 最後の節は包む要素の最後の子（:last-child で下の余白 0。§2.4.3）
    expect(sections.endsWith("</section></div>")).toBe(true);
  });

  it("生成日時は出さない。見出しの段は帯 h2・節 h3・箱 h4", () => {
    expect(html).not.toContain("生成日時");
    expect(tagsOf(html, "h2")).toHaveLength(1);
    expect(tagsOf(html, "h3")).toHaveLength(3);
    expect(tagsOf(html, "h4")).toHaveLength(3);
  });

  it("summary が空なら要約の節は無い（3 つの節）。値が空の文字は「-」", () => {
    const empty = render(RecruitmentView, {
      output: {
        ...OUTPUT,
        summary: "",
        strengths: [""],
        questions: [{ q: "", intent: "" }],
        retention: { ...OUTPUT.retention, sign: "", action: "" },
      },
    });
    const sections = sectionsOf(elementOf(empty, 'class="ai-body"'));
    expect(childClasses(sections)).toEqual(["ai-sec", "ai-sec", "ai-sec"]);
    expect(empty).not.toContain("この人物の要約");
    expect(textOf(elementOf(elementOf(empty, 'class="mini strength"'), "<li>"))).toBe("-");
    expect(textOf(elementOf(empty, 'class="qtext"'))).toBe("-");
    expect(textOf(elementOf(empty, 'class="qintent"'))).toBe("見極め：-");
    expect([...empty.matchAll(/<p class="ra-v">([^<]*)<\/p>/g)].map((m) => m[1])).toEqual([
      "-",
      "-",
    ]);
  });

  it("K-31 ⑤: 出力の文のタグや & は文字として逃がして描く（タグにならない）", () => {
    const unsafe = render(RecruitmentView, {
      output: {
        ...OUTPUT,
        summary: "<b>x</b> & <img src=x onerror=alert(1)>",
        strengths: ["<script>alert(1)</script>"],
      },
    });
    expect(unsafe).not.toContain("<b>x</b>");
    expect(unsafe).not.toContain("<img");
    expect(unsafe).not.toContain("<script>");
    expect(unsafe).toContain("&lt;b&gt;x&lt;/b&gt; &amp; &lt;img src=x onerror=alert(1)&gt;");
    expect(textOf(elementOf(unsafe, 'class="ai-p"'))).toBe(
      "<b>x</b> & <img src=x onerror=alert(1)>",
    );
  });
});

// ---- 育成・定着（§2.5）

/** 8 項目の見本（架空。マスタのコード） */
const CONTEXT: TrainingContext = {
  tenure: "year_2",
  evaluation: "meets",
  expectedRole: "trainer",
  recentState: "low_energy",
  relationship: "specific_mismatch",
  wish: "skill_up",
  changeSinceJoining: "unchanged",
  concern: "few_reports",
};

/** 選択欄（id ai-ctx-{キー}）の開きタグと、選ばれている選択肢の値 */
function selectOf(html: string, key: TrainingContextKey): { tag: string; selected: string[] } {
  const select = elementOf(html, `id="ai-ctx-${key}"`);
  return {
    tag: openTag(select),
    selected: tagsOf(select, "option")
      .filter((tag) => attr(tag, "selected") !== undefined)
      .map((tag) => attr(tag, "value") ?? ""),
  };
}

const contextForm = (props: {
  readonly values?: TrainingContextDraft;
  readonly invalid?: readonly TrainingContextKey[];
  readonly mode?: TrainingContextMode;
}) =>
  render(TrainingContextForm, {
    values: props.values ?? EMPTY_TRAINING_CONTEXT_DRAFT,
    invalid: new Set(props.invalid ?? []),
    mode: props.mode ?? "editable",
    onChange: () => undefined,
    selectRefs: { current: {} },
  });

describe("M7-ai-39 の描画の分 TrainingContextForm（8 項目の入力欄。§2.5.3）", () => {
  it("箱 .ai-ctx に h2.ai-ctx-h「現場の状況を入力（8項目）」と 2 行 × 4 項目。項目は label.ai-ctx-label（for）と .ai-ctx-sel（select#ai-ctx-{キー} と山形 svg.ai-ico.ai-chev）", () => {
    const html = contextForm({});
    expect(openTag(html)).toBe('<div class="ai-ctx">');
    expect(childClasses(html)).toEqual(["ai-ctx-h", "ai-ctx-row", "ai-ctx-row"]);
    const heading = elementOf(html, 'class="ai-ctx-h"');
    expect(openTag(heading)).toBe('<h2 class="ai-ctx-h">');
    expect(textOf(heading)).toBe("現場の状況を入力（8項目）");
    const rows = [...html.matchAll(/<div class="ai-ctx-row">/g)].map((m) =>
      elementOf(html, m[0], m.index),
    );
    expect(rows.map(childClasses)).toEqual([
      ["ai-ctx-item", "ai-ctx-item", "ai-ctx-item", "ai-ctx-item"],
      ["ai-ctx-item", "ai-ctx-item", "ai-ctx-item", "ai-ctx-item"],
    ]);
    // 行と列は TRAINING_CONTEXT_KEYS の並び（1 行目は勤続年数〜最近の様子）
    const ids = rows.map((row) => tagsOf(row, "select").map((tag) => attr(tag, "id")));
    expect(ids).toEqual([
      TRAINING_CONTEXT_KEYS.slice(0, 4).map((key) => `ai-ctx-${key}`),
      TRAINING_CONTEXT_KEYS.slice(4).map((key) => `ai-ctx-${key}`),
    ]);
    // 項目: ラベル（for で選択欄に結び付く）→ 選択欄の箱（選択欄 → 山形）
    const items = rows.flatMap((row) => childElements(row));
    items.forEach((item, i) => {
      const key = TRAINING_CONTEXT_KEYS[i]!;
      const [label, sel] = childElements(item);
      expect(openTag(label!), key).toBe(`<label class="ai-ctx-label" for="ai-ctx-${key}">`);
      expect(textOf(label!), key).toBe(TRAINING_CONTEXT_ITEMS[key].label);
      expect(openTag(sel!), key).toBe('<div class="ai-ctx-sel">');
      const [select, chevron] = childElements(sel!);
      expect([tagName(select!), attr(openTag(select!), "id")], key).toEqual([
        "select",
        `ai-ctx-${key}`,
      ]);
      expect(chevron, key).toBe(renderPlain(ChevronDownIcon));
      expect(attr(openTag(chevron!), "class"), key).toBe("ai-ico ai-chev");
      expect(childElements(item), key).toHaveLength(2);
      expect(childElements(sel!), key).toHaveLength(2);
    });
    expect(items).toHaveLength(8);
    // 必須の属性は付けない（仕様に無い。未選択は押したときに確かめる。§2.5.4）
    expect(tagsOf(html, "select").some((tag) => attr(tag, "required") !== undefined)).toBe(false);
  });

  it("選択肢は §2.5.3 の表の並び（マスタの表示名とコード）で、先頭は値が空の「選択してください」（disabled でない）", () => {
    const html = contextForm({});
    for (const key of TRAINING_CONTEXT_KEYS) {
      const options = tagsOf(elementOf(html, `id="ai-ctx-${key}"`), "option");
      expect(
        options.map((tag) => attr(tag, "value")),
        key,
      ).toEqual(["", ...TRAINING_CONTEXT_ITEMS[key].options.map((o) => o.code)]);
      const texts = [
        ...elementOf(html, `id="ai-ctx-${key}"`).matchAll(/<option[^>]*>([^<]*)<\/option>/g),
      ].map((m) => textOf(m[1]!));
      expect(texts, key).toEqual([
        "選択してください",
        ...TRAINING_CONTEXT_ITEMS[key].options.map((o) => o.label),
      ]);
      expect(
        options.some((tag) => attr(tag, "disabled") !== undefined),
        key,
      ).toBe(false);
    }
    // 見本: 勤続年数の 3 つ目は「3年~5年」（「~」は半角）
    expect(textOf(elementOf(html, 'value="years_3_5"'))).toBe("3年~5年");
  });

  it("値が空の欄だけ class に is-placeholder（選んだ欄は class が無い）。選んだ値の選択肢が選ばれている", () => {
    const values: TrainingContextDraft = {
      ...EMPTY_TRAINING_CONTEXT_DRAFT,
      tenure: "year_2",
      wish: "unknown",
    };
    const html = contextForm({ values });
    for (const key of TRAINING_CONTEXT_KEYS) {
      const { tag, selected } = selectOf(html, key);
      const chosen = values[key];
      expect(attr(tag, "class"), key).toBe(chosen === "" ? "is-placeholder" : undefined);
      expect(selected, key).toEqual([chosen]);
    }
  });

  it('aria-invalid="true" は invalid のキーの欄だけ（ほかの欄には属性が無い）', () => {
    const invalid: TrainingContextKey[] = ["evaluation", "relationship", "concern"];
    const html = contextForm({ invalid });
    for (const key of TRAINING_CONTEXT_KEYS) {
      expect(attr(selectOf(html, key).tag, "aria-invalid"), key).toBe(
        invalid.includes(key) ? "true" : undefined,
      );
    }
    expect(tagsOf(contextForm({}), "select").some((tag) => tag.includes("aria-invalid"))).toBe(
      false,
    );
  });

  it("mode: editable は選べる。locked（生成中）・saved（生成済み）は disabled で、値は出したまま", () => {
    for (const mode of ["editable", "locked", "saved"] as const) {
      const html = contextForm({ values: CONTEXT, mode });
      for (const key of TRAINING_CONTEXT_KEYS) {
        const { tag, selected } = selectOf(html, key);
        expect(attr(tag, "disabled"), `${mode} ${key}`).toBe(mode === "editable" ? undefined : "");
        expect(selected, `${mode} ${key}`).toEqual([CONTEXT[key]]);
      }
    }
  });
});

describe("M7-ai-39 の描画の分 TrainingView（育成・定着の表示。§2.5.5）", () => {
  const OUTPUT_T = validTrainingOutput();
  const html = render(TrainingView, { output: OUTPUT_T });
  const body = elementOf(html, 'class="body"');
  /** 節を包む要素（クラスなし。本文の 2 つ目の子） */
  const sectionsOf = (fragment: string) => elementOf(fragment, "<div>");
  /** 節（section.sec）を上から */
  const sectionList = (fragment: string) =>
    [...fragment.matchAll(/<section class="sec">/g)].map((m) => elementOf(fragment, m[0], m.index));
  const chipsOf = (output: TrainingAiOutput) => {
    const rendered = render(TrainingView, { output });
    return [...rendered.matchAll(/<div class="chip ([a-z]+)">/g)].map((m) => {
      const chip = elementOf(rendered, m[0], m.index);
      return {
        tone: m[1],
        label: textOf(elementOf(chip, 'class="k"')),
        value: textOf(elementOf(chip, 'class="v"')),
        dot: openTag(elementOf(chip, 'class="dot"')),
      };
    });
  };
  /** 出力の一部を変えた形（スキーマに無い値・空の配列も入れる） */
  const withOutput = (patch: (o: TrainingAiOutput) => object): TrainingAiOutput =>
    patch(validTrainingOutput()) as unknown as TrainingAiOutput;

  it("カードの見出し帯: 「✦」（aria-hidden）・h2「AI 育成・定着アドバイザー」・札「在籍スタッフ向け」の順", () => {
    expect(openTag(html)).toBe('<div class="ai-ik">');
    expect(childClasses(elementOf(html, 'class="card"'))).toEqual(["head", "body"]);
    const head = elementOf(html, 'class="head"');
    expect(childClasses(head)).toEqual(["sp", "<h2>", "tag"]);
    expect(attr(openTag(elementOf(head, 'class="sp"')), "aria-hidden")).toBe("true");
    expect(elementOf(head, 'class="sp"')).toContain(renderPlain(SparkIcon));
    expect(textOf(elementOf(head, "<h2>"))).toBe("AI 育成・定着アドバイザー");
    expect(textOf(elementOf(head, 'class="tag"'))).toBe("在籍スタッフ向け");
  });

  it("本文の並び: 判定チップ → 節を包む要素 → 末尾。チップは期待役割へのマッチ度 → 離職リスク → サポートの必要度で、見本（高い・中・低い）は good・mid・good。点は aria-hidden", () => {
    expect(childClasses(body)).toEqual(["chips", "<div>", "foot"]);
    expect(chipsOf(OUTPUT_T)).toEqual([
      {
        tone: "good",
        label: "期待役割へのマッチ度",
        value: "高い",
        dot: '<span class="dot" aria-hidden="true">',
      },
      {
        tone: "mid",
        label: "離職リスク",
        value: "中",
        dot: '<span class="dot" aria-hidden="true">',
      },
      {
        tone: "good",
        label: "サポートの必要度",
        value: "低い",
        dot: '<span class="dot" aria-hidden="true">',
      },
    ]);
    expect(textOf(elementOf(body, 'class="foot"'))).toBe(
      "※ 診断スコア（16特性・ソーシャルスタイル・資質タイプ）と、ご入力いただいた勤務状況をもとにAIが自動生成しています。",
    );
    expect(openTag(elementOf(body, 'class="foot"'))).toBe('<p class="foot">');
  });

  it("判定チップ: 値を変えた出力（低い → warn、非常に高い → warn、「やや高い」→ mid）と、空の値は「-」で mid（bad は使わない）", () => {
    const changed = withOutput((o) => ({
      ...o,
      verdict: { match: "低い", risk: "非常に高い", support: "やや高い" },
    }));
    expect(chipsOf(changed).map((chip) => [chip.tone, chip.value])).toEqual([
      ["warn", "低い"],
      ["warn", "非常に高い"],
      ["mid", "やや高い"],
    ]);
    const empty = withOutput((o) => ({ ...o, verdict: { match: "", risk: "", support: "" } }));
    expect(chipsOf(empty).map((chip) => [chip.tone, chip.value])).toEqual([
      ["mid", "-"],
      ["mid", "-"],
      ["mid", "-"],
    ]);
  });

  it("節の並びと見出しの段: 1.〜4. の節の見出しが h3（.lab。棒は aria-hidden）、原因の枠・箱・ステップの見出しは h4、帯は h2。最後の節が包む要素の最後の子（下の余白 0）", () => {
    const sections = sectionsOf(body);
    expect(childClasses(sections)).toEqual(["sec", "sec", "sec", "sec"]);
    const labels = [...sections.matchAll(/<h3 class="lab">/g)].map((m) =>
      textOf(elementOf(sections, m[0], m.index)),
    );
    expect(labels).toEqual([
      "1. すぐに手を打つべき理由と、その一手",
      "2. 期待役割に向けて",
      "3. 日常の接し方（○と×）",
      "4. 次回の1on1で聞くこと",
    ]);
    expect(elementOf(sections, '<h3 class="lab">')).toContain(
      '<span class="bar" aria-hidden="true"></span>',
    );
    expect(tagsOf(html, "h2")).toHaveLength(1);
    expect(tagsOf(html, "h3")).toHaveLength(4);
    expect(tagsOf(html, "h4")).toEqual([
      '<h4 class="hyp-h">',
      "<h4>",
      "<h4>",
      '<h4 class="fill-h">',
    ]);
    expect(sections.endsWith("</section></div>")).toBe(true);
    expect(html).not.toContain("生成日時");
  });

  it("1. 理由の枠 → 原因の枠（見出しと、札「可能性 高」hi・「可能性 中」mi・「診断外」lo と本文）→ 一手の箱（札 label と本文）", () => {
    const [urgent] = sectionList(sectionsOf(body));
    expect(childClasses(urgent!)).toEqual(["lab", "why", "hyp", "gap"]);
    expect(openTag(elementOf(urgent!, 'class="why"'))).toBe('<p class="why">');
    expect(textOf(elementOf(urgent!, 'class="why"'))).toBe(OUTPUT_T.urgent.why);
    const hyp = elementOf(urgent!, 'class="hyp"');
    expect(textOf(elementOf(hyp, 'class="hyp-h"'))).toBe("考えられる原因と、その確からしさ");
    const rows = [...hyp.matchAll(/<div class="hy">/g)].map((m) => {
      const row = elementOf(hyp, m[0], m.index);
      return [
        attr(openTag(elementOf(row, 'class="hk')), "class"),
        textOf(elementOf(row, 'class="hk')),
        textOf(elementOf(row, 'class="hv"')),
      ];
    });
    expect(rows).toEqual([
      ["hk hi", "可能性 高", OUTPUT_T.urgent.hypotheses[0]!.text],
      ["hk mi", "可能性 中", OUTPUT_T.urgent.hypotheses[1]!.text],
      ["hk lo", "診断外", OUTPUT_T.urgent.hypotheses[2]!.text],
    ]);
    const gap = elementOf(urgent!, 'class="gap"');
    expect(
      [...gap.matchAll(/<div class="gr">/g)].map((m) => {
        const row = elementOf(gap, m[0], m.index);
        return [textOf(elementOf(row, 'class="gk"')), textOf(elementOf(row, 'class="gv"'))];
      }),
    ).toEqual(OUTPUT_T.urgent.actions.map((a) => [a.label, a.text]));
    // 札の文字が空の一手も、札（空）と本文を出す（§2.5.5 の表に条件が無い）
    expect(gap).toContain('<span class="gk"></span>');
  });

  it("2. 理由の枠 → 足りている・欠けている（h4 と箇条書き）→ ステップの見出しとステップ（札 badge・title・target は空でなければ札・本文・say と note は空でなければ）→ 前提の確認", () => {
    const [, role] = sectionList(sectionsOf(body));
    expect(childClasses(role!)).toEqual(["lab", "why", "two", "fill-h", "scenes", "cond"]);
    expect(textOf(elementOf(role!, 'class="why"'))).toBe(OUTPUT_T.role.why);
    const have = elementOf(role!, 'class="mini a"');
    expect(textOf(elementOf(have, "<h4>"))).toBe("◎ 足りている");
    expect(tagsOf(have, "li")).toHaveLength(OUTPUT_T.role.have.length);
    expect(textOf(elementOf(have, 'class="ilist"'))).toBe(OUTPUT_T.role.have.join(""));
    const lack = elementOf(role!, 'class="mini b"');
    expect(textOf(elementOf(lack, "<h4>"))).toBe("△ 欠けている");
    expect(textOf(elementOf(lack, 'class="ilist"'))).toBe(OUTPUT_T.role.lack.join(""));
    expect(textOf(elementOf(role!, 'class="fill-h"'))).toBe("このように進めてください");
    const scenes = elementOf(role!, 'class="scenes"');
    const steps = [...scenes.matchAll(/<div class="scene">/g)].map((m) =>
      elementOf(scenes, m[0], m.index),
    );
    expect(steps).toHaveLength(2);
    // STEP 1: target・say・note あり
    const [first, second] = OUTPUT_T.role.steps;
    expect(childClasses(steps[0]!)).toEqual(["scene-t", "scene-b", "say", "chk"]);
    const title1 = elementOf(steps[0]!, 'class="scene-t"');
    expect(title1).toBe(
      `<div class="scene-t"><span class="sn">${first!.badge}</span>${first!.title}<span class="tgt">${first!.target}</span></div>`,
    );
    expect(textOf(elementOf(steps[0]!, 'class="scene-b"'))).toBe(first!.body);
    expect(textOf(elementOf(steps[0]!, 'class="say"'))).toBe(first!.say);
    expect(textOf(elementOf(steps[0]!, 'class="chk"'))).toBe(first!.note);
    // STEP 2: target・say・note が空なら出さない
    expect(childClasses(steps[1]!)).toEqual(["scene-t", "scene-b"]);
    expect(elementOf(steps[1]!, 'class="scene-t"')).toBe(
      `<div class="scene-t"><span class="sn">${second!.badge}</span>${second!.title}</div>`,
    );
    expect(textOf(elementOf(role!, 'class="cond"'))).toBe(OUTPUT_T.role.cond);
  });

  it("3. 日常の接し方: 札 scene と、「○ 」+ ok と「× 」+ ng（記号と本文の全体が b。間は改行）、say は空でなければ緑の引用。4. 1on1: 番号 1 から・q・intent（「見極め：」は無い）", () => {
    const [, , daily, oneonone] = sectionList(sectionsOf(body));
    const rows = [...daily!.matchAll(/<div class="f">/g)].map((m) =>
      elementOf(daily!, m[0], m.index),
    );
    expect(rows).toHaveLength(OUTPUT_T.daily.length);
    OUTPUT_T.daily.forEach((item, i) => {
      const row = rows[i]!;
      expect(childClasses(row)).toEqual(["fh", "ft"]);
      expect(textOf(elementOf(row, 'class="fh"'))).toBe(item.scene);
      const ft = elementOf(row, 'class="ft"');
      const say = item.say === "" ? "" : `<p class="say">${item.say}</p>`;
      expect(ft).toBe(`<div class="ft"><b>○ ${item.ok}</b><br/><b>× ${item.ng}</b>${say}</div>`);
    });
    const questions = elementOf(oneonone!, 'class="qlist"');
    expect([...questions.matchAll(/<span class="qn">(\d+)<\/span>/g)].map((m) => m[1])).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(
      [...questions.matchAll(/<p class="qt">([^<]*)<\/p><p class="qi">([^<]*)<\/p>/g)].map((m) => [
        m[1],
        m[2],
      ]),
    ).toEqual(OUTPUT_T.oneonone.map((item) => [item.q, item.intent]));
    expect(oneonone).not.toContain("見極め");
  });

  it("空の値: 理由・前提が空なら枠が無く、原因・一手・ステップが 0 なら無く、daily・oneonone が 0 なら 3.・4. の節が無い。1.・2. の節の見出しと足りている・欠けている の箱はいつも出る", () => {
    const empty = withOutput((o) => ({
      ...o,
      urgent: { why: "", hypotheses: [], actions: [] },
      role: { ...o.role, why: "", have: [], lack: [], steps: [], cond: "" },
      daily: [],
      oneonone: [],
    }));
    const rendered = render(TrainingView, { output: empty });
    const sections = sectionList(sectionsOf(elementOf(rendered, 'class="body"')));
    expect(sections).toHaveLength(2);
    expect(childClasses(sections[0]!)).toEqual(["lab"]);
    expect(childClasses(sections[1]!)).toEqual(["lab", "two"]);
    expect(childClasses(elementOf(sections[1]!, 'class="two"'))).toEqual(["mini a", "mini b"]);
    expect(rendered).not.toContain("考えられる原因と、その確からしさ");
    expect(rendered).not.toContain("このように進めてください");
    expect(rendered).not.toContain("3. 日常の接し方");
    expect(rendered).not.toContain("4. 次回の1on1で聞くこと");
    // 末尾はいつも出る
    expect(childClasses(elementOf(rendered, 'class="body"'))).toEqual(["chips", "<div>", "foot"]);
  });

  it("K-31 ⑤: 出力の文（say を含む）のタグや & は文字として逃がして描く（タグにならない）", () => {
    const unsafe = withOutput((o) => ({
      ...o,
      urgent: { ...o.urgent, why: "<b>x</b> & <img src=x onerror=alert(1)>" },
      role: {
        ...o.role,
        steps: [{ ...o.role.steps[0]!, say: "<script>alert(1)</script>" }],
      },
      daily: [{ ...o.daily[0]!, ok: "<i>ok</i>", say: "<a href=x>say</a>" }],
    }));
    const rendered = render(TrainingView, { output: unsafe });
    expect(rendered).not.toContain("<b>x</b>");
    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("<i>");
    expect(rendered).not.toContain("<a ");
    expect(rendered).toContain("&lt;b&gt;x&lt;/b&gt; &amp; &lt;img src=x onerror=alert(1)&gt;");
    expect(textOf(elementOf(rendered, 'class="why"'))).toBe(
      "<b>x</b> & <img src=x onerror=alert(1)>",
    );
    expect(textOf(elementOf(rendered, 'class="say"'))).toBe("<script>alert(1)</script>");
  });
});

describe("M7-ai-38・39 の描画の分 TrainingPanel（育成・定着のパネル。§2.3.5 の表。通知の Provider で包む）", () => {
  const dto = (overrides: Partial<TrainingAiDto>): TrainingAiDto => ({
    status: "not_generated",
    startedAt: null,
    error: null,
    enabled: true,
    context: null,
    latest: null,
    ...overrides,
  });
  const panel = (initial: TrainingAiDto, selected = true): string => {
    const html = renderToStaticMarkup(
      createElement(ToastProvider, {
        children: createElement(TrainingPanel, {
          resultId: "result-1",
          initial,
          selected,
          focusTab: () => undefined,
        }),
      }),
    );
    return elementOf(html, 'id="ai-panel-training"');
  };
  /** 8 項目の選択欄がすべて選べるか（disabled が無い）・すべて選べないか */
  const selectsDisabled = (html: string): boolean[] =>
    tagsOf(html, "select").map((tag) => attr(tag, "disabled") !== undefined);

  it("パネル: role=tabpanel・aria-labelledby=ai-tab-training・data-status。選んでいないときは hidden", () => {
    const tag = openTag(panel(dto({})));
    expect(attr(tag, "class")).toBe("ai-panel");
    expect(attr(tag, "role")).toBe("tabpanel");
    expect(attr(tag, "aria-labelledby")).toBe("ai-tab-training");
    expect(attr(tag, "data-status")).toBe("not_generated");
    expect(attr(tag, "hidden")).toBeUndefined();
    expect(attr(openTag(panel(dto({}), false)), "hidden")).toBe("");
  });

  it("not_generated で有効でない（本番で確認の前。§2.7.4）: 案内 → 8 項目（選べる）→ 押せない生成ボタン → 「この AI 解説は準備中です。」。生成中・失敗の枠・表示は無い", () => {
    const html = panel(dto({ enabled: false }));
    const start = elementOf(html, 'class="ai-start ai-start--training"');
    expect(childClasses(start)).toEqual([
      "ai-intro ai-intro--training",
      "ai-ctx",
      "ai-gen-btn",
      "ai-note",
    ]);
    expect(selectsDisabled(start)).toEqual(Array(8).fill(false));
    expect(attr(openTag(elementOf(start, "<button")), "disabled")).toBe("");
    expect(textOf(elementOf(start, 'class="ai-note"'))).toBe("この AI 解説は準備中です。");
    expect(childClasses(html)).toEqual(["ai-start ai-start--training"]);
  });

  it("not_generated で有効: 生成ボタンは押せ、準備中の注記は無い。8 項目は未選択（is-placeholder）で、不正の表示は無い", () => {
    const html = panel(dto({}));
    const start = elementOf(html, 'class="ai-start ai-start--training"');
    expect(childClasses(start)).toEqual(["ai-intro ai-intro--training", "ai-ctx", "ai-gen-btn"]);
    expect(attr(openTag(elementOf(start, "<button")), "disabled")).toBeUndefined();
    expect(textOf(elementOf(start, "<button"))).toBe("育成・定着AI解説を生成");
    expect(tagsOf(start, "select").map((tag) => attr(tag, "class"))).toEqual(
      Array(8).fill("is-placeholder"),
    );
    expect(start).not.toContain("aria-invalid");
  });

  it("generating（別の画面で始まっている）: 案内 → 8 項目（選べない）と、その下に生成中。生成ボタンは無い", () => {
    const html = panel(dto({ status: "generating", startedAt: "2026-11-19T00:00:00.000Z" }));
    expect(childClasses(html)).toEqual(["ai-start ai-start--training", "ai-loading"]);
    const start = elementOf(html, 'class="ai-start ai-start--training"');
    expect(childClasses(start)).toEqual(["ai-intro ai-intro--training", "ai-ctx"]);
    expect(selectsDisabled(start)).toEqual(Array(8).fill(true));
  });

  it("failed: 案内 → 8 項目（選べる）→ 失敗の枠（T-18 と理由）→ 生成ボタン", () => {
    const html = panel(dto({ status: "failed", error: "invalid_json" }));
    expect(childClasses(html)).toEqual(["ai-start ai-start--training"]);
    const start = elementOf(html, 'class="ai-start ai-start--training"');
    expect(childClasses(start)).toEqual([
      "ai-intro ai-intro--training",
      "ai-ctx",
      "ai-fail",
      "ai-gen-btn",
    ]);
    expect(selectsDisabled(start)).toEqual(Array(8).fill(false));
    expect(textOf(elementOf(start, 'class="ai-fail"'))).toBe(
      "AI解説の生成に失敗しました。AI の応答を解釈できませんでした。再試行してください",
    );
  });

  it("completed: 生成の入口は 8 項目だけ（保存した値で選べない）、その下に表示。案内と生成ボタンは無い", () => {
    const html = panel(
      dto({
        status: "completed",
        context: CONTEXT,
        latest: {
          aiAnalysisId: "ai-analysis-1",
          provider: "stub",
          model: "claude-opus-5-5",
          promptVersion: "training-v1",
          generatedAt: "2026-11-19T00:00:00.000Z",
          reliability: 82.5,
          output: validTrainingOutput(),
        },
      }),
    );
    expect(childClasses(html)).toEqual(["ai-start ai-start--training", "ai-ik"]);
    const start = elementOf(html, 'class="ai-start ai-start--training"');
    expect(childClasses(start)).toEqual(["ai-ctx"]);
    expect(selectsDisabled(start)).toEqual(Array(8).fill(true));
    for (const key of TRAINING_CONTEXT_KEYS) {
      expect(selectOf(start, key).selected, key).toEqual([CONTEXT[key]]);
    }
    expect(html).not.toContain("ai-gen-btn");
  });
});
