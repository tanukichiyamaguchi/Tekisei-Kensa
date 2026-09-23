// R-06 無効リンク・エラー表示（05 §5.6）。"use client" を付けない純表示部品で、Server・Client の両方から使う（D05-36）
import type { ExamErrorKind } from "@/lib/presentation/exam-types";
import { EXAM_TEXTS, type ExamTextId } from "@/lib/presentation/exam-texts";

const TEXTS: Readonly<Record<ExamErrorKind, { heading: ExamTextId; body: ExamTextId }>> = {
  organization_not_found: { heading: "X-01", body: "X-02" },
  organization_closed: { heading: "X-01", body: "X-03" },
  session_unavailable: { heading: "X-04", body: "X-05" },
  page_not_found: { heading: "X-06", body: "X-07" },
  unexpected: { heading: "X-08", body: "X-09" },
};

export interface ExamErrorViewProps {
  readonly kind: ExamErrorKind;
}

export function ExamErrorView({ kind }: ExamErrorViewProps) {
  const { heading, body } = TEXTS[kind];
  return (
    <section className="exam-error" data-testid={`exam-error-${kind}`}>
      <h1 className="exam-heading">{EXAM_TEXTS[heading]}</h1>
      <p>{EXAM_TEXTS[body]}</p>
    </section>
  );
}
