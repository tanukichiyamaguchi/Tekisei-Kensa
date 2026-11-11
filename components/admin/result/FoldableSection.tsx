"use client";
// 折りたためるセクション（11-4 §2.16・§2.2）。section#{id}.sec（たたんでいれば .sec.fold）に、見出しの行 .sec-h（h2・説明・たたむボタン）と
// 中身を置く。見出しの行のどこを押しても 1 回だけ開閉する（ボタンには処理を付けず、押すと見出しの行の処理で切り替わる。Enter・Space も
// ボタンの click として届く）。ボタンは type="button"・aria-label「この項目を開閉」・aria-expanded で、中身は「たたむ」「ひらく」と
// 矢印「▴」（見せ分けとたたんだときの隠し方は CSS。別表D の 5）。印刷の形は onToggle を渡さず、同じ位置と見た目で描くだけ（§2.18）
import type { ReactNode } from "react";

import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultSectionId } from "@/lib/presentation/result-view-state";

export function FoldableSection(props: {
  readonly id: ResultSectionId;
  readonly title: string;
  readonly description: string;
  readonly folded: boolean;
  /** 見出しの行を押したとき（印刷の形は渡さない） */
  readonly onToggle?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const t = RESULT_DETAIL_TEXTS.fold;
  return (
    <section id={props.id} className={props.folded ? "sec fold" : "sec"}>
      <div className="sec-h" onClick={props.onToggle}>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <button
          type="button"
          className="rs-fold"
          aria-label={t.label}
          aria-expanded={!props.folded}
        >
          <span className="t-c">{t.close}</span>
          <span className="t-o">{t.open}</span>
          <i>{t.mark}</i>
        </button>
      </div>
      {props.children}
    </section>
  );
}
