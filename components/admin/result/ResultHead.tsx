"use client";
// 見出しの塊 #rd-head（11-4 §2.3.2）。縦に 3 段: 1 段目「類似分析」のボタン（PR-7.14 が headActions.similarity で渡す。無ければ段ごと
// 置かない）、2 段目 見出しの文字 h1「{氏名}様の診断結果」と、比較組織のプルダウン・「ダウンロード」（headActions.download）、
// 3 段目 受験情報の 1 行。1 行に入らない幅では、ボタンをプルダウンの下の行に回して右に寄せる（CSS。別表D の 2）。
// 印刷の形（variant="print"）は 2 つのボタンと 1 段目を描かず（要素を置かず、場所も詰める。headActions があっても描かない。
// 総論 8.3 の 3、11-5 §2.5.4）、比較組織は画面と同じ見た目の動かない箱に、選んでいる比較組織の名前（未選択は「比較組織を選択」）を
// 描く（§2.18、11-5 §4.4 (1)）。画面の形の h1 は「↑ 先頭へ」のあとに焦点を受ける（tabIndex -1。輪郭は出さない。§2.5。1.1 版）
import { Suspense, type ReactNode } from "react";

import { useComparison } from "./ComparisonProvider";
import { ComparisonScopeSelect } from "./ComparisonScopeSelect";
import { ResultMetaLine } from "./ResultMetaLine";
import type { ResultDetailVariant } from "./ResultViewStateContext";
import { formatScopeLabel } from "@/lib/presentation/comparison-view";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";

/** 見出しの塊のボタン（画面の形だけ。押したときの処理は 11-5 の部品） */
export interface ResultHeadActions {
  /** 1 段目の「類似分析」（PR-7.14） */
  readonly similarity?: ReactNode;
  /** 2 段目の「ダウンロード」 */
  readonly download?: ReactNode;
}

export function ResultHead(props: {
  readonly name: string;
  readonly meta: ResultDetailView["meta"];
  readonly variant: ResultDetailVariant;
  readonly headActions?: ResultHeadActions | undefined;
}) {
  const comparison = useComparison();
  const screen = props.variant === "screen";
  return (
    <div id="rd-head">
      {screen && props.headActions?.similarity ? props.headActions.similarity : null}
      <div className="rd-titlerow">
        {/* 画面の形は「↑ 先頭へ」のあとに焦点を受ける（tabIndex -1。輪郭は出さない。§2.5、別表D の 2） */}
        <h1 className="rd-title" tabIndex={screen ? -1 : undefined}>
          {RESULT_DETAIL_TEXTS.title(props.name)}
        </h1>
        <div className="rd-tools">
          {screen ? (
            <>
              <Suspense>
                <ComparisonScopeSelect />
              </Suspense>
              {props.headActions?.download}
            </>
          ) : (
            <span className="rd-scope" data-static="">
              {comparison.kind === "none"
                ? RESULT_DETAIL_TEXTS.selectComparison
                : formatScopeLabel(comparison.scope)}
            </span>
          )}
        </div>
      </div>
      <ResultMetaLine meta={props.meta} />
    </div>
  );
}
