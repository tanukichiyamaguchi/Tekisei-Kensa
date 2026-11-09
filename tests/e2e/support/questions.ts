// E2E 用の設問情報。Playwright のローダーは JSON の import を扱えないため、設問マスタ（lib/masters/questions.ts）は
// import せず、ステップの区切りは question-layout.ts（純粋な TS）の stepOf から、設問文は JSON を fs で読む
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { QUESTION_STEP_SIZES, SCORED_QUESTION_COUNT, stepOf } from "@/lib/masters/question-layout";

interface QuestionItem {
  readonly questionNo: number;
  readonly text: string;
}

const master = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../lib/masters/data/questions.json", import.meta.url)),
    "utf8",
  ),
) as { readonly items: readonly QuestionItem[] };

/** ステップの数（4） */
export const EXAM_STEP_TOTAL = QUESTION_STEP_SIZES.length;

/** ステップ番号 → 設問番号（昇順） */
export function questionNosOfStep(stepNo: number): readonly number[] {
  return Array.from({ length: SCORED_QUESTION_COUNT }, (_, i) => i + 1).filter(
    (q) => stepOf(q) === stepNo,
  );
}

/** 出題しない Q145〜Q204 の設問文（決定事項 3） */
export const INACTIVE_QUESTION_TEXTS: readonly string[] = master.items
  .filter((q) => q.questionNo > SCORED_QUESTION_COUNT)
  .map((q) => q.text);
