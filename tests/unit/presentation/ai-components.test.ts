// 11-6 §2.1〜§2.4・§2.11・§2.14・別表D（M7-ai-38 の描画の分と K-31 ⑤）。AI 解説の部品のうち、通知（Toast）と画面の状態の Context が要らない
// 部品（アイコン・タブの行・生成前の案内・生成ボタン・生成中・失敗の枠・判定チップ・採用向けの表示）を renderToStaticMarkup で静的な HTML に
// 描いて確かめる（DOM のライブラリは足さない。chart-components.test.ts と同じ作り）。アイコンの形は 11-6 の別表D の表を読んで比べる。
// パネル・領域（AiArea。生成・読み直し・焦点・画面の状態）は E2E（M7-ai-38・42 と D の段の a11y）で確かめる。見本の出力は架空の文
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
import { VerdictChips } from "@/components/admin/result/ai/VerdictChips";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput } from "@/lib/ai/types";
import { AI_TEXTS, aiFailureText } from "@/lib/presentation/ai-texts";

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
/** 子の要素の開きタグの class を上から（直下だけ） */
function childClasses(element: string): string[] {
  const inner = element.slice(element.indexOf(">") + 1, element.lastIndexOf("<"));
  const out: string[] = [];
  let pos = 0;
  while (pos < inner.length) {
    const lt = inner.indexOf("<", pos);
    if (lt < 0) break;
    const child = elementOf(inner, inner.slice(lt, inner.indexOf(">", lt) + 1), lt);
    out.push(attr(openTag(child), "class") ?? `<${/^<([a-z0-9]+)/i.exec(child)?.[1] ?? ""}>`);
    pos = lt + child.length;
  }
  return out;
}

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

  it("どれも viewBox 0 0 24 24・幅と高さ 1em・aria-hidden・クラス ai-ico（稲妻と芽は ai-ico--zap・ai-ico--sprout も）。線は currentColor の線（端と角は丸）、塗りは currentColor の塗り。path の d と線の幅は別表D のまま。style の属性は無い", () => {
    for (const row of ICON_ROWS) {
      const html = renderPlain(ICONS[row.name]!);
      const svg = tagsOf(html, "svg")[0]!;
      expect(attr(svg, "viewBox"), row.name).toBe("0 0 24 24");
      expect(attr(svg, "width"), row.name).toBe("1em");
      expect(attr(svg, "height"), row.name).toBe("1em");
      expect(attr(svg, "aria-hidden"), row.name).toBe("true");
      const className =
        row.name === "ZapIcon"
          ? "ai-ico ai-ico--zap"
          : row.name === "SproutIcon"
            ? "ai-ico ai-ico--sprout"
            : "ai-ico";
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
