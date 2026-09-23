// 回答の検証（03 §2.1）。Q1〜Q144 が揃い、値が 1〜5 の整数であることを確認する。
import { InvalidAnswerMapError } from "./errors";
import type { AnswerMap, ChoiceCode, QuestionNo } from "./types";
import { SCORED_QUESTION_NOS } from "@/lib/masters/questions";

function isChoiceCode(value: unknown): value is ChoiceCode {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/**
 * Q1〜Q144 が揃い、値が 1〜5 であることを検証する。失敗時は InvalidAnswerMapError。
 * キーは Number(key) で正規化する（Firestore の map は文字列キーで読み戻されるため）。
 * Q145〜Q204 と 1〜204 以外のキーは無視する（決定事項 3、D3-14）。
 */
export function assertAnswerMap(input: Readonly<Record<string | number, unknown>>): AnswerMap {
  const byNo = new Map<QuestionNo, unknown>();
  for (const [key, value] of Object.entries(input)) byNo.set(Number(key), value);

  const answers: Record<QuestionNo, ChoiceCode> = {};
  const missing: QuestionNo[] = [];
  const invalid: Array<{ questionNo: QuestionNo; value: unknown }> = [];
  for (const questionNo of SCORED_QUESTION_NOS) {
    if (!byNo.has(questionNo)) {
      missing.push(questionNo);
      continue;
    }
    const value = byNo.get(questionNo);
    if (isChoiceCode(value)) answers[questionNo] = value;
    else invalid.push({ questionNo, value });
  }
  if (missing.length > 0 || invalid.length > 0) throw new InvalidAnswerMapError(missing, invalid);
  return Object.freeze(answers);
}
