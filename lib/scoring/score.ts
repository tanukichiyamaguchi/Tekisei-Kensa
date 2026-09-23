// scoreAnswers の組み立て（03 §5.9）
import { computeAptitudeTypes } from "./compute-aptitude-types";
import { computeAptitudes } from "./compute-aptitudes";
import { computeCompatibility } from "./compute-compatibility";
import { computeReliability } from "./compute-reliability";
import { computeRisks } from "./compute-risks";
import { computeSocialStyles } from "./compute-social-styles";
import { computeTraits } from "./compute-traits";
import { pickFirstMax, rankKeys } from "./evaluate";
import { APTITUDE_KEYS, APTITUDE_TYPE_KEYS, SOCIAL_STYLE_KEYS } from "./types";
import type { AnswerMap, ScoreResult } from "./types";
import { assertAnswerMap } from "./validate-answers";
import { SCORING_VERSION } from "./version";

/** 受検 1 回分の回答を採点する。Q1〜Q144 必須、Q145〜 は無視。戻り値は凍結済み */
export function scoreAnswers(input: AnswerMap): ScoreResult {
  const answers = assertAnswerMap(input);
  const traits = computeTraits(answers);
  const compatibility = computeCompatibility(answers);
  const aptitudes = computeAptitudes(answers);
  const [aptitudeFirst, aptitudeSecond] = rankKeys(aptitudes, APTITUDE_KEYS) as [
    (typeof APTITUDE_KEYS)[number],
    (typeof APTITUDE_KEYS)[number],
  ];
  const risks = computeRisks(answers);
  const aptitudeTypeScores = computeAptitudeTypes(answers);
  const aptitudeType = pickFirstMax(aptitudeTypeScores, APTITUDE_TYPE_KEYS);
  const socialStyles = computeSocialStyles(aptitudeTypeScores);
  const socialStyle = pickFirstMax(socialStyles, SOCIAL_STYLE_KEYS);
  const reliability = computeReliability(answers);
  return Object.freeze({
    scoringVersion: SCORING_VERSION,
    traits,
    compatibility,
    aptitudes,
    aptitudeFirst,
    aptitudeSecond,
    risks,
    aptitudeTypeScores,
    aptitudeType,
    socialStyles,
    socialStyle,
    reliability,
  });
}
