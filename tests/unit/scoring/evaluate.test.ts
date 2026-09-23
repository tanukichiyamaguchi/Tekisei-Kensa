// 共通評価器（03 §5.1）
import { describe, expect, it } from "vitest";

import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import type { IndicatorDefinition } from "@/lib/masters/types";
import { choiceOf, evaluateIndicator, pickFirstMax, rankKeys } from "@/lib/scoring/evaluate";

import { uniformAnswers } from "./helpers";

describe("evaluateIndicator", () => {
  const def: IndicatorDefinition<"x"> = {
    key: "x",
    terms: [
      { questionNo: 1, attribute: "score", sign: 1 },
      { questionNo: 2, attribute: "score_type", sign: -1 },
    ],
    constant: 3,
    multiplier: 2,
    clampMin: null,
  };
  it("項の合計 → 定数加算 → 乗数の順", () => {
    // 全問 1: (2 − 2 + 3) × 2 = 6
    expect(evaluateIndicator(def, uniformAnswers(1), CHOICE_SCORE_TABLE)).toBe(6);
    // 全問 5: (0 + 2 + 3) × 2 = 10
    expect(evaluateIndicator(def, uniformAnswers(5), CHOICE_SCORE_TABLE)).toBe(10);
  });
  it("clampMin 未満は下限値に置き換える", () => {
    const clamped = { ...def, constant: -20, clampMin: 0 };
    expect(evaluateIndicator(clamped, uniformAnswers(1), CHOICE_SCORE_TABLE)).toBe(0);
    expect(evaluateIndicator({ ...def, clampMin: 0 }, uniformAnswers(1), CHOICE_SCORE_TABLE)).toBe(
      6,
    );
  });
});

describe("choiceOf", () => {
  it("回答が無ければ RangeError（assertAnswerMap 済みの回答では起きない）", () => {
    expect(choiceOf(uniformAnswers(2), 5)).toBe(2);
    expect(() => choiceOf({}, 5)).toThrow(RangeError);
  });
});

describe("pickFirstMax / rankKeys", () => {
  const keys = ["a", "b", "c", "d"] as const;
  it("同点時は keys の先", () => {
    expect(pickFirstMax({ a: 1, b: 3, c: 3, d: 2 }, keys)).toBe("b");
    expect(pickFirstMax({ a: 0, b: 0, c: 0, d: 0 }, keys)).toBe("a");
    expect(pickFirstMax({ a: -5, b: -1, c: -3, d: -1 }, keys)).toBe("b");
  });
  it("keys が空なら RangeError", () => {
    expect(() => pickFirstMax({}, [])).toThrow(RangeError);
  });
  it("降順・同点は keys 順の安定ソート", () => {
    expect(rankKeys({ a: 1, b: 3, c: 3, d: 2 }, keys)).toEqual(["b", "c", "d", "a"]);
    expect(rankKeys({ a: 0, b: 0, c: 0, d: 0 }, keys)).toEqual(["a", "b", "c", "d"]);
  });
});
