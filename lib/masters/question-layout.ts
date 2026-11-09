// 設問のステップの区切り（11-1 §2.4.1・§3.5、03 §2.3）。
// 生成スクリプト・lib/masters/questions.ts・受験画面（Client Component）・E2E が参照するため、生成物に依存しない独立ファイルに置く。
// 値を変えたら pnpm masters:generate で questions.json を再生成する。

/** 採点対象（出題対象）の設問数 */
export const SCORED_QUESTION_COUNT = 144 as const;

/** 4 ステップの問数: Q1〜41、Q42〜82、Q83〜123、Q124〜144（K-39 Q-11。各ステップを 1 画面に並べる） */
export const QUESTION_STEP_SIZES = [41, 41, 41, 21] as const;

export type QuestionStep = 1 | 2 | 3 | 4;

/** 出題対象の設問番号（1〜144）→ ステップ。範囲外は RangeError */
export function stepOf(questionNo: number): QuestionStep {
  if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > SCORED_QUESTION_COUNT) {
    throw new RangeError(`出題対象外の設問番号です: ${questionNo}`);
  }
  let last = 0;
  for (const [index, size] of QUESTION_STEP_SIZES.entries()) {
    last += size;
    if (questionNo <= last) return (index + 1) as QuestionStep;
  }
  // QUESTION_STEP_SIZES の合計が SCORED_QUESTION_COUNT と違うときだけ来る（masters.test.ts が合計を確かめる）
  throw new RangeError(`出題対象外の設問番号です: ${questionNo}`);
}
