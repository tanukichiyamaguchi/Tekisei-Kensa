// 通しページ番号 pageNo（1〜20）と step / page の変換（04 §4.4、D04-46）。
// service は lib/presentation/ を import しないため lib/masters/ に置き、05 の lib/presentation/exam-pages.ts が再エクスポートする。
import { ACTIVE_QUESTIONS, QUESTION_PAGE_LAYOUT } from "./questions";
import type { QuestionNo } from "@/lib/scoring/types";

export const EXAM_PAGES_PER_STEP = QUESTION_PAGE_LAYOUT.pageSizes.length; // 5
export const EXAM_PAGE_COUNT = QUESTION_PAGE_LAYOUT.stepCount * EXAM_PAGES_PER_STEP; // 20

/** ceil(pageNo / 5) */
export function toStep(pageNo: number): number {
  return Math.ceil(pageNo / EXAM_PAGES_PER_STEP);
}
/** ((pageNo − 1) mod 5) + 1 */
export function toPageInStep(pageNo: number): number {
  return ((pageNo - 1) % EXAM_PAGES_PER_STEP) + 1;
}
/** (step − 1) × 5 + pageInStep */
export function toPageNo(step: number, pageInStep: number): number {
  return (step - 1) * EXAM_PAGES_PER_STEP + pageInStep;
}
/** pageNo に属する設問番号の集合（QuestionDefinition.step / page で判定。範囲外の pageNo は空集合） */
export function questionNosOfPage(pageNo: number): ReadonlySet<QuestionNo> {
  const step = toStep(pageNo);
  const page = toPageInStep(pageNo);
  return new Set(
    ACTIVE_QUESTIONS.filter((q) => q.step === step && q.page === page).map((q) => q.questionNo),
  );
}
