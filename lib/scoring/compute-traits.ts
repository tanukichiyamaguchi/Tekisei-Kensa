import { evaluateAll } from "./evaluate";
import type { AnswerMap, TraitScores } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";

/** 16 尺度（付録B §2、03 §5.2）。優劣性も同じ式で計算し、固定値で上書きしない（要件定義書 §11 の 1 番） */
export function computeTraits(answers: AnswerMap): TraitScores {
  return evaluateAll(TRAIT_DEFINITIONS, answers, CHOICE_SCORE_TABLE);
}
