"use client";
// R-03 上部のステップ表示・ページ表示・全体進捗バー（05 §5.3.4、§8）
import {
  EXAM_TEXTS,
  examTextAnswered,
  examTextPageInStep,
  examTextStep,
  examTextStepLabel,
} from "@/lib/presentation/exam-texts";

import { PageHeading } from "./PageHeading";

export interface ProgressHeaderProps {
  readonly step: number;
  readonly pageInStep: number;
  readonly answered: number;
  readonly total: number;
  readonly stepCount: number;
}

export function ProgressHeader({
  step,
  pageInStep,
  answered,
  total,
  stepCount,
}: ProgressHeaderProps) {
  return (
    <div className="exam-progress" data-testid="progress-header">
      <div className="exam-progress-row">
        <PageHeading>
          <span aria-hidden="true">{examTextStep(step)}</span>
          <span className="visually-hidden">{examTextStepLabel(step)}</span>
          <span className="exam-step-dots" aria-hidden="true">
            {Array.from({ length: stepCount }, (_, i) => (
              <span key={i} className={`exam-step-dot${i < step ? " exam-step-dot--done" : ""}`} />
            ))}
          </span>
        </PageHeading>
        <span className="exam-muted" data-testid="page-in-step">
          {examTextPageInStep(pageInStep)}
        </span>
      </div>
      <div className="exam-progress-bar">
        <progress max={total} value={answered} aria-label={EXAM_TEXTS["Q-05"]} />
        <span className="exam-muted" data-testid="answered-count">
          {examTextAnswered(answered)}
        </span>
      </div>
      <p className="exam-muted" style={{ margin: 0 }}>
        {EXAM_TEXTS["Q-00"]}
      </p>
    </div>
  );
}
