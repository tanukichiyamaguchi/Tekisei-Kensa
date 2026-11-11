"use client";
// 結果詳細の本文（11-4 §2.1・§2.18・§3.6）。画面の状態の Provider の中に、見出しの塊（受験情報の 1 行を含む）・目次・AI 解説の領域・
// 新しいレイアウト（#rs2）を兄弟で並べる（画面では .rd-body の間 16px が効く）。ComparisonProvider の内側で使う。
// 画面（variant="screen"）は結果詳細のページが ResultDetailFrame の中に key={resultId} で置き、人が替わると作り直す。印刷用ページ
// （variant="print"。11-5）は枠を使わずに置き、initialViewState（省くと既定）と visibility（非表示の PDF）で描く。
// aiArea は AI 解説の領域（id ai を渡す側が持つ。PR-7.8a は今の AiAnalysisSection、印刷は AI 解説の印刷の塊。11-6 の PR-7.9 が
// 置き換える）。headActions は見出しの塊のボタン（画面の形だけ。類似分析は PR-7.14）
import type { ReactNode } from "react";

import { ResultHead, type ResultHeadActions } from "./ResultHead";
import { ResultLayout, renderedSectionIds } from "./ResultLayout";
import { ResultToc, type ResultTocTarget } from "./ResultToc";
import { ResultViewStateProvider, type ResultDetailVariant } from "./ResultViewStateContext";
import { FULL_VISIBILITY, type PdfSectionVisibility } from "@/lib/pdf/visibility";
import { RESULT_DETAIL_TEXTS, RESULT_SECTIONS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import type { ResultViewState } from "@/lib/presentation/result-view-state";

import "./result-detail.css";

/** 目次のリンク: AI 解説の領域（あるとき）と、描いているセクション（§2.5。描かない行き先のリンクは置かない） */
function tocTargets(hasAiArea: boolean, visibility: PdfSectionVisibility): ResultTocTarget[] {
  const sections = renderedSectionIds(visibility).flatMap((id) => {
    const text = RESULT_SECTIONS.find((section) => section.id === id);
    return text ? [{ id, label: text.title }] : [];
  });
  return hasAiArea ? [{ id: "ai", label: RESULT_DETAIL_TEXTS.toc.ai }, ...sections] : sections;
}

export function ResultDetailBody(props: {
  readonly view: ResultDetailView;
  readonly variant: ResultDetailVariant;
  /** 印刷の形の初めの画面の状態（11-5。PR-7.8a は渡さず既定） */
  readonly initialViewState?: ResultViewState | undefined;
  /** 非表示の PDF の指定（省くと画面と同じ全表示） */
  readonly visibility?: PdfSectionVisibility | undefined;
  /** AI 解説の領域（id ai を持つ要素） */
  readonly aiArea?: ReactNode;
  readonly headActions?: ResultHeadActions | undefined;
}) {
  const { view, variant } = props;
  const visibility = props.visibility ?? FULL_VISIBILITY;
  const hasAiArea = props.aiArea !== undefined && props.aiArea !== null;
  return (
    <ResultViewStateProvider variant={variant} initialViewState={props.initialViewState}>
      <ResultHead
        name={view.name}
        meta={view.meta}
        variant={variant}
        headActions={props.headActions}
      />
      <ResultToc
        name={view.name}
        examDate={view.meta.examDate}
        targets={tocTargets(hasAiArea, visibility)}
        variant={variant}
      />
      {hasAiArea ? props.aiArea : null}
      <ResultLayout view={view} variant={variant} visibility={visibility} />
    </ResultViewStateProvider>
  );
}
