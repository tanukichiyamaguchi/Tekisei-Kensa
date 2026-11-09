// ステップ番号 stepNo（1〜4）と設問番号の対応（11-1 §3.4.2・§3.5、04 D04-46）。
// 回答の保存（lib/services/answer-saving.ts）が使うため、画面用の lib/presentation/ ではなく lib/masters/ に置き、
// 画面のステップの定義は lib/presentation/exam-steps.ts が作る。
import { ACTIVE_QUESTIONS, QUESTION_STEP_SIZES } from "./questions";
import type { QuestionNo } from "@/lib/scoring/types";

/** ステップの数（4） */
export const EXAM_STEP_COUNT = QUESTION_STEP_SIZES.length;

/** stepNo に属する設問番号の集合（QuestionDefinition.step で判定。範囲外の stepNo は空集合） */
export function questionNosOfStep(stepNo: number): ReadonlySet<QuestionNo> {
  return new Set(ACTIVE_QUESTIONS.filter((q) => q.step === stepNo).map((q) => q.questionNo));
}
