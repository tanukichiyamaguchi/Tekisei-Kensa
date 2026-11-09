"use client";
// 5 択のラジオボタン（11-1 §2.4.4）。縦 1 列（そう思う〜そう思わない。choice_code 1〜5 の順）。行の幅いっぱいを押せる label。
// input type="radio" を appearance: none にして円を描く（exam.css）。矢印キーで選べる。value は choice_code
import { CHOICE_OPTIONS } from "@/lib/presentation/exam-choices";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

export interface ChoiceRadioGroupProps {
  readonly questionNo: QuestionNo;
  readonly value: ChoiceCode | null;
  /** 未回答の印（Q-02）の要素の id。印が出ていないときは undefined */
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
      {CHOICE_OPTIONS.map((option) => (
        <label
          key={option.code}
          className="exam-choice"
          htmlFor={choiceInputId(questionNo, option.code)}
        >
          <input
            id={choiceInputId(questionNo, option.code)}
            className="exam-choice__input"
            type="radio"
            name={`q${questionNo}`}
            value={option.code}
            checked={value === option.code}
            aria-describedby={describedBy}
            onChange={() => onChange(option.code)}
            data-testid={`choice-${questionNo}-${option.code}`}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
