// 設問のステップ・ページ割り当て（05 §5.3.2 D05-01、00 D-08、03 §2.3）。
// 生成スクリプトと lib/masters/questions.ts の双方が参照するため、生成物に依存しない独立ファイルに置く。
// 値を変えたら pnpm masters:generate で questions.json を再生成する。

/** 採点対象（出題対象）の設問数 */
export const SCORED_QUESTION_COUNT = 144 as const;

/** 1 ステップ 36 問、ページ構成 7・7・7・7・8 問 */
export const QUESTION_PAGE_LAYOUT = {
  stepCount: 4,
  questionsPerStep: 36,
  pageSizes: [7, 7, 7, 7, 8],
} as const;

export type QuestionStep = 1 | 2 | 3 | 4;
export type QuestionPage = 1 | 2 | 3 | 4 | 5;

/** 出題対象の設問番号（1〜144）からステップとページを求める */
export function stepAndPageOf(questionNo: number): { step: QuestionStep; page: QuestionPage } {
  if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > SCORED_QUESTION_COUNT) {
    throw new RangeError(`出題対象外の設問番号です: ${questionNo}`);
  }
  const index = questionNo - 1;
  const step = Math.floor(index / QUESTION_PAGE_LAYOUT.questionsPerStep) + 1;
  let offset = index % QUESTION_PAGE_LAYOUT.questionsPerStep;
  let page = 1;
  for (const size of QUESTION_PAGE_LAYOUT.pageSizes) {
    if (offset < size) break;
    offset -= size;
    page += 1;
  }
  return { step: step as QuestionStep, page: page as QuestionPage };
}

/**
 * 出題対象の設問番号 → 通しページ番号 1〜20（05 §5.3.1）。
 * 設問文を読み込まずに求められるため、ブラウザ側（E-03 の遷移先）でも使う
 */
export function examPageNoOf(questionNo: number): number {
  const { step, page } = stepAndPageOf(questionNo);
  return (step - 1) * QUESTION_PAGE_LAYOUT.pageSizes.length + page;
}
