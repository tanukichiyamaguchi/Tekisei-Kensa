// E2E 用の設問情報。Playwright のローダーは JSON の import を扱えないため、設問マスタ（lib/masters/questions.ts）は
// import せず、ページ割り当ては question-layout.ts（純粋な TS）から、設問文は JSON を fs で読む
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  QUESTION_PAGE_LAYOUT,
  SCORED_QUESTION_COUNT,
  examPageNoOf,
} from "@/lib/masters/question-layout";

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

export const EXAM_PAGE_TOTAL =
  QUESTION_PAGE_LAYOUT.stepCount * QUESTION_PAGE_LAYOUT.pageSizes.length;

/** 通しページ番号 → 設問番号（昇順） */
export function questionNosOfPage(pageNo: number): readonly number[] {
  return Array.from({ length: SCORED_QUESTION_COUNT }, (_, i) => i + 1).filter(
    (q) => examPageNoOf(q) === pageNo,
  );
}

/** 出題しない Q145〜Q204 の設問文（決定事項 3） */
export const INACTIVE_QUESTION_TEXTS: readonly string[] = master.items
  .filter((q) => q.questionNo > SCORED_QUESTION_COUNT)
  .map((q) => q.text);
