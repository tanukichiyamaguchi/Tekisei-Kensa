// 受検者画面のページのヘルパー（05 §10.1）。変換関数は lib/masters/exam-pages.ts をそのまま再エクスポートする。
import {
  EXAM_PAGE_COUNT,
  EXAM_PAGES_PER_STEP,
  questionNosOfPage,
  toPageInStep,
  toPageNo,
  toStep,
} from "@/lib/masters/exam-pages";
import { ACTIVE_QUESTIONS, QUESTION_BY_NO, QUESTION_PAGE_LAYOUT } from "@/lib/masters/questions";
import type { QuestionDefinition } from "@/lib/masters/types";
import type { QuestionNo } from "@/lib/scoring/types";

export { EXAM_PAGE_COUNT, EXAM_PAGES_PER_STEP, questionNosOfPage, toPageInStep, toPageNo, toStep };

/** 通しページ番号 1〜20 */
export type ExamPageNo = number;

export const EXAM_STEP_COUNT = QUESTION_PAGE_LAYOUT.stepCount; // 4
export const EXAM_QUESTION_COUNT = ACTIVE_QUESTIONS.length; // 144

export interface ExamPage {
  readonly pageNo: ExamPageNo;
  readonly step: 1 | 2 | 3 | 4;
  readonly pageInStep: 1 | 2 | 3 | 4 | 5;
  readonly questions: readonly QuestionDefinition[]; // questionNo 昇順、7 または 8 件
  readonly isFirst: boolean; // pageNo === 1（「戻る」を出さない）
  readonly isLast: boolean; // pageNo === 20（「回答を送信する」）
}

function isExamPageNo(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= EXAM_PAGE_COUNT;
}

/** URL の文字列 → 1〜20。それ以外は null（R-06 page_not_found の判定に使う） */
export function parseExamPageNo(raw: string): ExamPageNo | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const pageNo = Number(raw);
  return isExamPageNo(pageNo) ? pageNo : null;
}

/** pageNo → ページ定義。1〜20 以外は RangeError */
export function getExamPage(pageNo: ExamPageNo): ExamPage {
  if (!isExamPageNo(pageNo)) throw new RangeError(`ページ番号が範囲外です: ${pageNo}`);
  const step = toStep(pageNo) as ExamPage["step"];
  const pageInStep = toPageInStep(pageNo) as ExamPage["pageInStep"];
  return Object.freeze({
    pageNo,
    step,
    pageInStep,
    questions: Object.freeze(
      ACTIVE_QUESTIONS.filter((q) => q.step === step && q.page === pageInStep),
    ),
    isFirst: pageNo === 1,
    isLast: pageNo === EXAM_PAGE_COUNT,
  });
}

/** 設問番号が属する通しページ番号（E-03 の遷移先）。出題対象外は RangeError */
export function pageNoOfQuestion(questionNo: QuestionNo): ExamPageNo {
  const q = QUESTION_BY_NO.get(questionNo);
  if (!q || q.step === null || q.page === null) {
    throw new RangeError(`出題対象外の設問番号です: ${questionNo}`);
  }
  return toPageNo(q.step, q.page);
}

/** 保存済み回答から再開位置を求める（05 §6.2）: 未回答の設問を含む最初のページ。全問回答済みなら 20 */
export function resolveResumePageNo(answeredQuestionNos: ReadonlySet<QuestionNo>): ExamPageNo {
  const firstUnanswered = ACTIVE_QUESTIONS.find((q) => !answeredQuestionNos.has(q.questionNo));
  return firstUnanswered ? pageNoOfQuestion(firstUnanswered.questionNo) : EXAM_PAGE_COUNT;
}

/** 現在ページの未回答設問番号（昇順） */
export function unansweredOnPage(
  page: ExamPage,
  answers: ReadonlyMap<QuestionNo, number>,
): readonly QuestionNo[] {
  return page.questions.filter((q) => !answers.has(q.questionNo)).map((q) => q.questionNo);
}
