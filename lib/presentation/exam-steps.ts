// 受験画面のステップのヘルパー（11-1 §2.4.1・§2.4.6・§2.4.8・§3.5）。
// 設問マスタ（JSON）を読むので、受験画面の部品（Client Component）は型だけを import type で使い、
// 設問番号 → ステップは lib/masters/question-layout.ts の stepOf、設問の表記は exam-texts.ts の examTextQuestion を使う
// （設問文を読み込まない）
import { EXAM_STEP_COUNT, questionNosOfStep } from "@/lib/masters/exam-steps";
import { stepOf } from "@/lib/masters/question-layout";
import { ACTIVE_QUESTIONS } from "@/lib/masters/questions";
import type { QuestionDefinition } from "@/lib/masters/types";
import type { QuestionNo } from "@/lib/scoring/types";

import { examTextQuestion } from "./exam-texts";

export { EXAM_STEP_COUNT, questionNosOfStep };

/** ステップ番号 1〜4 */
export type ExamStepNo = 1 | 2 | 3 | 4;

export interface ExamStep {
  readonly stepNo: ExamStepNo;
  readonly questions: readonly QuestionDefinition[]; // 設問番号の昇順。41・41・41・21 件
  readonly guideTextId: "Q-G1" | "Q-G2" | "Q-G3" | "Q-G4"; // 案内文（11-1 §2.4.1）
  readonly isLast: boolean; // stepNo === 4（「送信する」を出す）
}

const STEP_NOS: readonly ExamStepNo[] = [1, 2, 3, 4];

const GUIDE_TEXT_IDS: Readonly<Record<ExamStepNo, ExamStep["guideTextId"]>> = {
  1: "Q-G1",
  2: "Q-G2",
  3: "Q-G3",
  4: "Q-G4",
};

/** 4 ステップの定義（Q145 以降は含まない。決定事項 3） */
export const EXAM_STEPS: readonly ExamStep[] = Object.freeze(
  STEP_NOS.map((stepNo) =>
    Object.freeze({
      stepNo,
      questions: Object.freeze(ACTIVE_QUESTIONS.filter((q) => q.step === stepNo)),
      guideTextId: GUIDE_TEXT_IDS[stepNo],
      isLast: stepNo === EXAM_STEP_COUNT,
    }),
  ),
);

/** stepNo → ステップの定義。1〜4 以外は RangeError */
export function getExamStep(stepNo: ExamStepNo): ExamStep {
  const step = EXAM_STEPS.find((s) => s.stepNo === stepNo);
  if (!step) throw new RangeError(`ステップ番号が範囲外です: ${stepNo}`);
  return step;
}

/** 設問番号が属するステップ（11-1 §2.4.7 の ANSWERS_INCOMPLETE の行き先）。出題対象外は RangeError */
export function stepNoOfQuestion(questionNo: QuestionNo): ExamStepNo {
  return stepOf(questionNo);
}

/**
 * 画面を開いたときのステップ（11-1 §2.4.8、K-41）: 未回答の設問がある最初のステップ。全問回答済みなら 4。
 * 途中までの回答は保存したまま表示する
 */
export function resolveCurrentStepNo(answered: ReadonlySet<QuestionNo>): ExamStepNo {
  const firstUnanswered = ACTIVE_QUESTIONS.find((q) => !answered.has(q.questionNo));
  return firstUnanswered ? stepOf(firstUnanswered.questionNo) : 4;
}

/** ステップの未回答の設問番号（昇順。11-1 §2.4.6） */
export function unansweredInStep(
  step: ExamStep,
  answers: ReadonlyMap<QuestionNo, number>,
): readonly QuestionNo[] {
  return step.questions.filter((q) => !answers.has(q.questionNo)).map((q) => q.questionNo);
}

/** 設問の表記 Q-N「{番号}. {設問文}」（11-1 §2.4.4。設問文は加工しない。書式は exam-texts.ts の examTextQuestion） */
export function questionLabel(questionNo: QuestionNo, text: string): string {
  return examTextQuestion(questionNo, text);
}
