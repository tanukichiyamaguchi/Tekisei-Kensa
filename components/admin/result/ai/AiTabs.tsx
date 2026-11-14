"use client";
// AI 解説のタブの行（11-6 §2.2。参照元定義の Button D・Button H・Button「経年比較AI解説」。見た目は別表C の .ai-tabs・.ai-tab）。
// role="tablist"（読み上げの名前「AI解説の種類」）に、出すタブ（visibleTabs の順）を role="tab" のボタンで並べる。文字の左に sparkles
// （21px）。選んでいるタブは aria-selected="true"（グラデーションの地）、ほかは "false"（白の地。マウスを載せると見た目が変わる）。
// aria-controls はパネルの id（ai-panel-{種類}）、タブの id は ai-tab-{種類}（パネルの aria-labelledby）。選んでいるタブだけ tabIndex 0、
// ほかは -1。押すとそのタブを選ぶ（選んでいるタブを押しても何もしない）。キーボード: 左右の矢印で隣のタブへ焦点を移して選び（端では
// 止まり、折り返さない。§2.2 は「隣」だけ）、Home・End で先頭・末尾。焦点の枠は管理画面に共通の焦点の枠と同じ値（別表C）。
// タブの要素は tabRefs に入れる（AiArea が、押した生成ボタンが消えるときに選んでいるタブへ焦点を移すのに使う）
import type { KeyboardEvent, RefObject } from "react";

import { SparklesIcon } from "./ai-icons";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

/** タブの要素（種類ごと） */
export type AiTabRefs = RefObject<Partial<Record<AiAnalysisKind, HTMLButtonElement | null>>>;

export function AiTabs(props: {
  readonly tabs: readonly AiAnalysisKind[];
  readonly selected: AiAnalysisKind;
  readonly onSelect: (kind: AiAnalysisKind) => void;
  readonly tabRefs: AiTabRefs;
}) {
  const { tabs, selected, onSelect, tabRefs } = props;

  const choose = (kind: AiAnalysisKind) => {
    if (kind !== selected) onSelect(kind);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(index + 1, tabs.length - 1);
        break;
      case "ArrowLeft":
        next = Math.max(index - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const kind = tabs[next];
    if (kind === undefined) return;
    tabRefs.current[kind]?.focus();
    choose(kind);
  };

  return (
    <div className="ai-tabs" role="tablist" aria-label={AI_TEXTS.area.tabsLabel}>
      {tabs.map((kind, index) => {
        const on = kind === selected;
        return (
          <button
            key={kind}
            ref={(el) => {
              tabRefs.current[kind] = el;
            }}
            type="button"
            role="tab"
            id={`ai-tab-${kind}`}
            className="ai-tab"
            aria-selected={on}
            aria-controls={`ai-panel-${kind}`}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(kind)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <SparklesIcon />
            {AI_TEXTS.tabs[kind]}
          </button>
        );
      })}
    </div>
  );
}
