import raw from "./data/choice-scores.json";
import type { ChoiceScoreTable } from "./types";
import { parseChoiceScoreTable } from "./validate";

/** 選択肢ごとの配点属性 9 種（付録B §1、00 §1.9）。キーは choice_code（1 = そう思う） */
export const CHOICE_SCORE_TABLE: ChoiceScoreTable = parseChoiceScoreTable(raw);
