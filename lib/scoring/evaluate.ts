// 共通評価器（03 §5.1）。付録B の各式はすべてこの 1 関数で評価する。丸めない。
import type { AnswerMap, ChoiceCode, QuestionNo } from "./types";
import type { ChoiceScoreTable, IndicatorDefinition } from "@/lib/masters/types";

/** assertAnswerMap 済みの回答から選択肢を取り出す（欠落は assertAnswerMap が先に弾くため到達しない） */
export function choiceOf(answers: AnswerMap, questionNo: QuestionNo): ChoiceCode {
  const choice = answers[questionNo];
  if (choice === undefined) throw new RangeError(`Q${questionNo} の回答がありません`);
  return choice;
}

/** 評価順は「項の合計 → 定数加算 → 乗数 → 下限クランプ」 */
export function evaluateIndicator<K extends string>(
  def: IndicatorDefinition<K>,
  answers: AnswerMap,
  table: ChoiceScoreTable,
): number {
  let sum = 0;
  for (const term of def.terms) {
    sum += term.sign * table[choiceOf(answers, term.questionNo)][term.attribute];
  }
  const value = (sum + def.constant) * def.multiplier;
  return def.clampMin !== null && value < def.clampMin ? def.clampMin : value;
}

/** 最大値を持つキーを返す。同点時は keys の並び順で先のもの（厳密な > で比較する） */
export function pickFirstMax<K extends string>(
  scores: Readonly<Record<K, number>>,
  keys: readonly K[],
): K {
  const [first, ...rest] = keys;
  if (first === undefined) throw new RangeError("keys が空です");
  let best = first;
  for (const k of rest) if (scores[k] > scores[best]) best = k;
  return best;
}

/** 値の降順、同点時は keys の並び順で安定ソートしたキー配列を返す */
export function rankKeys<K extends string>(
  scores: Readonly<Record<K, number>>,
  keys: readonly K[],
): readonly K[] {
  return [...keys].sort((a, b) => scores[b] - scores[a] || keys.indexOf(a) - keys.indexOf(b));
}

/** 定義の配列を評価して Record にする（各 compute-*.ts の共通部分） */
export function evaluateAll<K extends string>(
  defs: readonly IndicatorDefinition<K>[],
  answers: AnswerMap,
  table: ChoiceScoreTable,
): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>;
  for (const def of defs) out[def.key] = evaluateIndicator(def, answers, table);
  return Object.freeze(out);
}
