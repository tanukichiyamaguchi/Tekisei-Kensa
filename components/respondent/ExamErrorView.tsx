// R-06 続けられないとき・予期しない失敗（11-1 §2.6）。R-05 と同じ狭い枠（アイコンなし）。
// "use client" を付けない純表示部品で、Server・Client の両方から使う（D05-36）。
// 画面を開いたときの表示（session_unavailable は X-05）。操作の途中で続けられなくなったときは SessionUnavailableView（E-04）
import type { ExamErrorKind } from "@/lib/presentation/exam-types";
import { EXAM_TEXTS, type ExamTextId } from "@/lib/presentation/exam-texts";

const TEXTS: Readonly<Record<ExamErrorKind, { heading: ExamTextId; body: ExamTextId }>> = {
  session_unavailable: { heading: "X-04", body: "X-05" },
  unexpected: { heading: "X-08", body: "X-09" },
};

export interface ExamErrorViewProps {
  readonly kind: ExamErrorKind;
}

export function ExamErrorView({ kind }: ExamErrorViewProps) {
  const { heading, body } = TEXTS[kind];
  return (
    <section className="exam-frame-narrow" data-testid={`exam-error-${kind}`}>
      <div className="exam-error">
        <h1 className="exam-title exam-title--center">{EXAM_TEXTS[heading]}</h1>
        <p className="exam-error__text">{EXAM_TEXTS[body]}</p>
      </div>
    </section>
  );
}
