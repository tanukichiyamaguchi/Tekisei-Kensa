"use client";
// 生成ボタン（11-6 §2.3.2。参照元定義の Button B・Button E。見た目は別表C の .ai-gen-btn）。文字の左に sparkles（21px）。押せない状態は
// 押せないボタン（disabled の属性）で、種類が有効でないとき（§2.7.4。PR-7.9 の育成・定着）と、404 の後（再読み込みまで。06 §3.5.9）。
// 有効でないときは、ボタンのすぐ後に「この AI 解説は準備中です。」（.ai-note。アプリだけの文）を出す（div にして、p の既定の余白で生成の
// 入口の間 12px が広がらないようにする）。失敗のあとも同じ文言のボタンで作り直す（参照元に「再試行」のボタンは無い。§2.15）
import type { MouseEvent } from "react";

import { SparklesIcon } from "./ai-icons";
import type { AiStartKind } from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

export function AiGenerateButton(props: {
  readonly kind: AiStartKind;
  /** 生成できる設定か（§2.7.4。採用向けはいつも true） */
  readonly enabled: boolean;
  /** 有効でも押せないとき（404 の後） */
  readonly disabled?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="ai-gen-btn"
        disabled={!props.enabled || props.disabled === true}
        onClick={props.onClick}
      >
        <SparklesIcon />
        {AI_TEXTS.generate[props.kind]}
      </button>
      {props.enabled ? null : <div className="ai-note">{AI_TEXTS.notReady}</div>}
    </>
  );
}
