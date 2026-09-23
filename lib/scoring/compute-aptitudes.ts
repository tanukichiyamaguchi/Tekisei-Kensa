import { evaluateAll } from "./evaluate";
import type { AnswerMap, AptitudeScores } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";

/** 資質 4 型（付録B §4、03 §5.4）。型ごとに下限 0 でクランプ済み */
export function computeAptitudes(answers: AnswerMap): AptitudeScores {
  return evaluateAll(APTITUDE_DEFINITIONS, answers, CHOICE_SCORE_TABLE);
}
