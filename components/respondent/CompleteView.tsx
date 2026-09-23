// R-05 完了（05 §5.5）。固定文言のみ。結果・氏名・日時は表示しない
import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

import { PageHeading } from "./PageHeading";

export function CompleteView() {
  return (
    <section className="exam-complete" data-testid="complete-view">
      <span className="exam-complete-icon" aria-hidden="true">
        ✓
      </span>
      <PageHeading>{EXAM_TEXTS["C-01"]}</PageHeading>
      <p>{EXAM_TEXTS["C-02"]}</p>
    </section>
  );
}
