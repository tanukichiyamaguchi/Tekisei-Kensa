"use client";
// ステップ表示（11-1 §2.4.3）。[先頭の線][番号 1〜4][末尾の線]。今のステップ・済んだステップ・先のステップで丸の色を変える。
// 丸とラベルは飾り（値は見出しの「Step n」と、行の読み上げ「ステップ n / 4」でも出す）。丸を押しても何も起きない
import type { Ref } from "react";

import { examTextStepIndicatorLabel, examTextStepLabel } from "@/lib/presentation/exam-texts";
import type { ExamStepNo } from "@/lib/presentation/exam-steps";

export interface StepIndicatorProps {
  /** 今のステップ（1〜4） */
  readonly current: ExamStepNo;
  /** ステップの数（4） */
  readonly stepCount: number;
  /** 行の要素（「次へ」で次のステップを出したとき、行が画面の上に来るようにスクロールする） */
  readonly ref?: Ref<HTMLDivElement> | undefined;
}

type StepState = "done" | "current" | "future";

const stateOf = (stepNo: number, current: number): StepState =>
  stepNo < current ? "done" : stepNo === current ? "current" : "future";

export function StepIndicator({ current, stepCount, ref }: StepIndicatorProps) {
  const steps = Array.from({ length: stepCount }, (_, i) => i + 1);
  return (
    <div
      ref={ref}
      className="exam-steps"
      role="img"
      aria-label={examTextStepLabel(current)}
      data-testid="step-indicator"
      data-current={current}
    >
      {/* 先頭の線は常に主色、末尾の線は今が最後のステップのときだけ主色 */}
      <span className="exam-steps__edge" data-on="true" aria-hidden="true" />
      <div className="exam-steps__numbers" aria-hidden="true">
        {steps.map((stepNo) => (
          <div
            key={stepNo}
            className="exam-steps__cell"
            data-state={stateOf(stepNo, current)}
            data-testid={`step-${stepNo}`}
          >
            {/* セルの左の線は番号 ≦ 今、右の線は番号 < 今のとき主色 */}
            <span
              className="exam-steps__line exam-steps__line--left"
              data-on={stepNo <= current ? "true" : "false"}
            />
            <div className="exam-steps__item">
              <span className="exam-steps__circle">{stepNo}</span>
              <span className="exam-steps__label">{examTextStepIndicatorLabel(stepNo)}</span>
            </div>
            <span
              className="exam-steps__line exam-steps__line--right"
              data-on={stepNo < current ? "true" : "false"}
            />
          </div>
        ))}
      </div>
      <span
        className="exam-steps__edge"
        data-on={current === stepCount ? "true" : "false"}
        aria-hidden="true"
      />
    </div>
  );
}
