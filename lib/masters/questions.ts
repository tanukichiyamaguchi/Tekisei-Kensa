import raw from "./data/questions.json";
import { SCORED_QUESTION_COUNT } from "./question-layout";
import type { QuestionDefinition } from "./types";
import { parseQuestionDefinitions } from "./validate";
import type { QuestionNo } from "@/lib/scoring/types";

export { QUESTION_PAGE_LAYOUT, SCORED_QUESTION_COUNT } from "./question-layout";

/** 設問マスタ 204 件（questionNo 昇順）。設問文は付録A の転記そのまま（03 §4.3） */
export const QUESTIONS: readonly QuestionDefinition[] = parseQuestionDefinitions(raw);

export const QUESTION_BY_NO: ReadonlyMap<QuestionNo, QuestionDefinition> = new Map(
  QUESTIONS.map((q) => [q.questionNo, q]),
);

/** 採点対象の設問番号 [1, 2, …, 144] */
export const SCORED_QUESTION_NOS: readonly QuestionNo[] = Object.freeze(
  Array.from({ length: SCORED_QUESTION_COUNT }, (_, i) => i + 1),
);

/** 出題する設問（isActive = true の 144 件） */
export const ACTIVE_QUESTIONS: readonly QuestionDefinition[] = Object.freeze(
  QUESTIONS.filter((q) => q.isActive),
);
