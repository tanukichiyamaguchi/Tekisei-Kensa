// 合成回答（03 §10.2 の生成器と同じ規則）。シード・運用確認用。Q1〜Q144 の全問を埋める
import type { AnswerMap, ChoiceCode, QuestionNo } from "../../lib/scoring/types";

const SCORED = 144;

function build(choiceOf: (q: number) => ChoiceCode): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= SCORED; q += 1) answers[q] = choiceOf(q);
  return answers;
}

/** 全問 choice */
export function uniformAnswers(choice: ChoiceCode): AnswerMap {
  return build(() => choice);
}

/** 周期回答 Q(q) = ((q − 1) mod 5) + 1 */
export function cyclicAnswers(): AnswerMap {
  return build((q) => (((q - 1) % 5) + 1) as ChoiceCode);
}

/** 固定シードの疑似乱数（mulberry32）による回答。同じ seed なら同じ回答 */
export function randomAnswers(seed: number): AnswerMap {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return build(() => (Math.floor(random() * 5) + 1) as ChoiceCode);
}
