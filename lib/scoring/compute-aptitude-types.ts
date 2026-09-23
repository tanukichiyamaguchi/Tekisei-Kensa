import { evaluateAll } from "./evaluate";
import type { AnswerMap, AptitudeTypeScores } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";

/** 適性タイプ 16 種の得点（付録B §6、03 §5.6）。負値をそのまま返す */
export function computeAptitudeTypes(answers: AnswerMap): AptitudeTypeScores {
  return evaluateAll(APTITUDE_TYPE_DEFINITIONS, answers, CHOICE_SCORE_TABLE);
}
