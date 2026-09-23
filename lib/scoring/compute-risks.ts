import { evaluateAll } from "./evaluate";
import type { AnswerMap, RiskScores } from "./types";
import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";

/** リスク 7 項目（付録B §5、03 §5.5）。×5 後の値。負値をそのまま返す（表示で 0% にする） */
export function computeRisks(answers: AnswerMap): RiskScores {
  return evaluateAll(RISK_DEFINITIONS, answers, CHOICE_SCORE_TABLE);
}
