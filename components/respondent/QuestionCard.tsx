"use client";
// 設問 1 問（05 §5.3.4、§8）。fieldset + legend（「Q51 設問文」）、未回答で「次へ」を押した後は赤枠と Q-02
import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

import { ChoiceRadioGroup } from "./ChoiceRadioGroup";

export interface QuestionCardProps {
  readonly questionNo: QuestionNo;
  readonly text: string;
  readonly value: ChoiceCode | null;
  readonly showUnansweredError: boolean;
  readonly onChange: (code: ChoiceCode) => void;
}

export function QuestionCard({
  questionNo,
  text,
  value,
  showUnansweredError,
  onChange,
}: QuestionCardProps) {
  const errorId = `q${questionNo}-error`;
  return (
    <fieldset
      id={`question-${questionNo}`}
      className={`exam-question${showUnansweredError ? " exam-question--error" : ""}`}
      aria-describedby={showUnansweredError ? errorId : undefined}
      data-testid={`question-${questionNo}`}
      data-unanswered-error={showUnansweredError ? "true" : undefined}
    >
      <legend>
        <span className="exam-question-no">Q{questionNo}</span>
        {/* 設問文は加工しない（03 §4.3） */}
        {text}
      </legend>
      {showUnansweredError ? (
        <p id={errorId} className="exam-field-error" style={{ marginBottom: 8 }}>
          {EXAM_TEXTS["Q-02"]}
        </p>
      ) : null}
      <ChoiceRadioGroup
        questionNo={questionNo}
        value={value}
        describedBy={showUnansweredError ? errorId : undefined}
        onChange={onChange}
      />
    </fieldset>
  );
}
