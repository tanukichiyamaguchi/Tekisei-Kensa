// AnswersField（文字列キー）↔ AnswerMap（数値キー）（02 §5.5）。1〜144 が揃っていることは検証しない（03 の assertAnswerMap が行う）
import type { AnswersField } from "@/lib/db/types";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

export function toAnswerMap(answers: AnswersField): Readonly<Record<number, number>> {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(answers)) out[Number(key)] = value;
  return out;
}

export function toAnswersField(
  answers: Readonly<Partial<Record<QuestionNo, ChoiceCode>>>,
): AnswersField {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value !== undefined) out[String(Number(key))] = value;
  }
  return out;
}
