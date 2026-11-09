"use client";
// 設問 1 問（11-1 §2.4.4・§2.4.6）。fieldset と legend（「{番号}. {設問文}」）。
// 未回答の印は「次へ」「送信する」を押して未回答があったときだけ出す: 設問文を赤くし、すぐ下に Q-02（選択肢と aria-describedby で結ぶ）
import { EXAM_TEXTS, examTextQuestion } from "@/lib/presentation/exam-texts";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

import { ChoiceRadioGroup } from "./ChoiceRadioGroup";

export interface QuestionCardProps {
  readonly questionNo: QuestionNo;
  readonly text: string;
  readonly value: ChoiceCode | null;
  readonly showUnanswered: boolean;
  readonly onChange: (code: ChoiceCode) => void;
}

export function QuestionCard({
  questionNo,
  text,
  value,
  showUnanswered,
  onChange,
}: QuestionCardProps) {
  const errorId = `q${questionNo}-error`;
  return (
    <fieldset
      id={`question-${questionNo}`}
      className={`exam-question${showUnanswered ? " exam-question--unanswered" : ""}`}
      data-testid={`question-${questionNo}`}
      data-unanswered={showUnanswered ? "true" : undefined}
    >
      {/* 設問文は設問マスタ（付録A）のまま加工しない（K-11） */}
      <legend className="exam-question__text">{examTextQuestion(questionNo, text)}</legend>
      {showUnanswered ? (
        <p id={errorId} className="exam-question__error">
          {EXAM_TEXTS["Q-02"]}
        </p>
      ) : null}
      <ChoiceRadioGroup
        questionNo={questionNo}
        value={value}
        describedBy={showUnanswered ? errorId : undefined}
        onChange={onChange}
      />
    </fieldset>
  );
}
