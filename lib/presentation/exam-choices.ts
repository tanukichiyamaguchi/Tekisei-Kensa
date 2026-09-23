// 5 件法の選択肢（05 §10.2、00 §1.9）。表示順 = choice_code 順
import type { ChoiceCode } from "@/lib/scoring/types";

export interface ChoiceOption {
  readonly code: ChoiceCode;
  readonly label: string; // 付録A の文言
}

export const CHOICE_OPTIONS: readonly ChoiceOption[] = [
  { code: 1, label: "そう思う" },
  { code: 2, label: "どちらかと言えばそう思う" },
  { code: 3, label: "どちらでもない" },
  { code: 4, label: "どちらかと言えばそう思わない" },
  { code: 5, label: "そう思わない" },
] as const;

export function isChoiceCode(value: unknown): value is ChoiceCode {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}
