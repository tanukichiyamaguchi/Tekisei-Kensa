// 合成回答の生成ヘルパー（03 §10.2）
import type { AnswerMap, ChoiceCode, QuestionNo } from "@/lib/scoring/types";

const SCORED = 144;

/** Q1〜Q144 が全て choice */
export function uniformAnswers(choice: ChoiceCode): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= SCORED; q += 1) answers[q] = choice;
  return answers;
}

/** Q(q) = ((q − 1) mod 5) + 1 */
export function cyclicAnswers(): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= SCORED; q += 1) answers[q] = (((q - 1) % 5) + 1) as ChoiceCode;
  return answers;
}

export function withOverrides(
  base: AnswerMap,
  overrides: Partial<Record<QuestionNo, ChoiceCode>>,
): AnswerMap {
  return { ...base, ...overrides } as AnswerMap;
}

/** 「どちらでもない」の数（Q1〜Q144） */
export function neutralCount(answers: AnswerMap): number {
  let n = 0;
  for (let q = 1; q <= SCORED; q += 1) if (answers[q] === 3) n += 1;
  return n;
}

/** 固定シードの疑似乱数（mulberry32）。T-10・性能テストで使う */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomAnswers(random: () => number): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= SCORED; q += 1) answers[q] = (Math.floor(random() * 5) + 1) as ChoiceCode;
  return answers;
}

/** 許容誤差 1e-9 の比較（03 §7.6） */
export const EPS = 1e-9;
