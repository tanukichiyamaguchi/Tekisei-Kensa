"use client";
// 下部固定の「戻る」「次へ」「回答を送信する」と未回答件数（05 §5.3.4、§5.3.6）
import type { Ref } from "react";

import { EXAM_TEXTS, examTextUnanswered } from "@/lib/presentation/exam-texts";

export interface PageNavProps {
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly unansweredCount: number;
  readonly busy: boolean;
  readonly onBack: () => void;
  /** isLast のときは送信確認を開く */
  readonly onNext: () => void;
  readonly nextButtonRef?: Ref<HTMLButtonElement> | undefined;
}

export function PageNav({
  isFirst,
  isLast,
  unansweredCount,
  busy,
  onBack,
  onNext,
  nextButtonRef,
}: PageNavProps) {
  const hasUnanswered = unansweredCount > 0;
  return (
    <nav className="exam-nav" aria-label="ページ移動" data-testid="page-nav">
      {hasUnanswered ? (
        <p id="exam-unanswered" className="exam-nav-unanswered" data-testid="unanswered-count">
          {examTextUnanswered(unansweredCount)}
        </p>
      ) : null}
      <div className={`exam-nav-buttons${isFirst ? " exam-nav-buttons--single" : ""}`}>
        {isFirst ? null : (
          <button
            type="button"
            className="exam-button exam-button--secondary"
            aria-disabled={busy ? true : undefined}
            onClick={onBack}
            data-testid="back-button"
          >
            {EXAM_TEXTS["B-04"]}
          </button>
        )}
        <button
          ref={nextButtonRef}
          type="button"
          className="exam-button"
          aria-disabled={hasUnanswered || busy ? true : undefined}
          aria-describedby={hasUnanswered ? "exam-unanswered" : undefined}
          onClick={onNext}
          data-testid={isLast ? "submit-button" : "next-button"}
        >
          {isLast ? EXAM_TEXTS["B-05"] : EXAM_TEXTS["B-03"]}
        </button>
      </div>
    </nav>
  );
}
