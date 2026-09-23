import { evaluateAll } from "./evaluate";
import type { AnswerMap, CompatibilityScores } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";

/** 相性 5 軸（付録B §3、03 §5.3）。負値をそのまま返す */
export function computeCompatibility(answers: AnswerMap): CompatibilityScores {
  return evaluateAll(COMPATIBILITY_DEFINITIONS, answers, CHOICE_SCORE_TABLE);
}
