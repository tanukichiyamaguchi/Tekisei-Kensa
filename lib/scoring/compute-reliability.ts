import { choiceOf } from "./evaluate";
import type { AnswerMap } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { SCORED_QUESTION_NOS } from "@/lib/masters/questions";

export const RELIABILITY_QUESTION_COUNT = 144 as const;
export const RELIABILITY_SLOPE = 0.49 as const;
export const RELIABILITY_OFFSET = 100 as const;

/** 信頼係数（付録B §8、03 §5.8、D3-15）: max(0, (Σ reliability − 144) × 0.49 + 100)。Q1〜Q144 のみ */
export function computeReliability(answers: AnswerMap): number {
  let sum = 0;
  for (const q of SCORED_QUESTION_NOS) sum += CHOICE_SCORE_TABLE[choiceOf(answers, q)].reliability;
  const value = (sum - RELIABILITY_QUESTION_COUNT) * RELIABILITY_SLOPE + RELIABILITY_OFFSET;
  return value < 0 ? 0 : value;
}
