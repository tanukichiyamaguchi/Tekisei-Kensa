"use client";
// 5 件法のラジオ（05 §2.4、§8）。縦積み、行全体をタップできる label。value は choice_code
import { CHOICE_OPTIONS } from "@/lib/presentation/exam-choices";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

export interface ChoiceRadioGroupProps {
  readonly questionNo: QuestionNo;
  readonly value: ChoiceCode | null;
  readonly describedBy?: string | undefined;
  readonly onChange: (code: ChoiceCode) => void;
}

export const choiceInputId = (questionNo: number, code: number) => `q${questionNo}-c${code}`;

export function ChoiceRadioGroup({
  questionNo,
  value,
  describedBy,
  onChange,
}: ChoiceRadioGroupProps) {
  return (
    <div className="exam-choices">
      {CHOICE_OPTIONS.map((option) => {
        const checked = value === option.code;
        return (
          <label
            key={option.code}
            className={`exam-choice${checked ? " exam-choice--checked" : ""}`}
            htmlFor={choiceInputId(questionNo, option.code)}
          >
            <input
              id={choiceInputId(questionNo, option.code)}
              type="radio"
              name={`q${questionNo}`}
              value={option.code}
              checked={checked}
              aria-describedby={describedBy}
              onChange={() => onChange(option.code)}
              data-testid={`choice-${questionNo}-${option.code}`}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
