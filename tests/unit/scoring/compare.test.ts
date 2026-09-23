// 比較計算のテスト T-12〜T-14（03 §10.7）
import { describe, expect, it } from "vitest";

import {
  compareWithPopulation,
  computeAxisDeviations,
  decideGrade,
  decidePosition,
  GRADE_RULES,
  POSITION_RULES,
  THRESHOLD_EPSILON,
} from "@/lib/scoring/compare";
import { EmptyPopulationError } from "@/lib/scoring/errors";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ComparisonScope, PopulationMember } from "@/lib/scoring/types";
import { COMPATIBILITY_KEYS, TRAIT_KEYS } from "@/lib/scoring/types";

import { EPS, uniformAnswers } from "./helpers";

const ORG: ComparisonScope = { kind: "organization" };

function member(choice: 1 | 2 | 3 | 4 | 5): PopulationMember {
  const r = scoreAnswers(uniformAnswers(choice));
  return { traits: r.traits, compatibility: r.compatibility };
}

describe("T-12 母集団 2 件の合成例", () => {
  const subject = member(1);
  const result = compareWithPopulation(subject, [member(1), member(3)], ORG);

  it("平均 16 尺度 15.5、差分 0.5 × 16 → 合致度 96", () => {
    for (const k of TRAIT_KEYS) {
      expect(result.traitAverages[k]).toBe(15.5);
      expect(result.traitDiffs[k]).toBe(0.5);
    }
    expect(result.matchScore).toBe(96);
  });
  it("平均 5 軸 (40, 50, 50, 30, −30)、偏差 (70, 75, 75, 65, 35) → 偏差値 64、評価 A、strong_leader", () => {
    expect(COMPATIBILITY_KEYS.map((k) => result.compatibilityAverages[k])).toEqual([
      40, 50, 50, 30, -30,
    ]);
    expect(COMPATIBILITY_KEYS.map((k) => result.axisDeviations[k])).toEqual([70, 75, 75, 65, 35]);
    expect(result.deviationScore).toBe(64);
    expect(result.grade).toBe("A");
    expect(result.position).toBe("strong_leader");
  });
  it("populationSize と scope を返し、結果は凍結されている", () => {
    expect(result.populationSize).toBe(2);
    expect(result.scope).toEqual(ORG);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.traitAverages)).toBe(true);
  });
  it("母集団の配列をフィルタも重複排除もしない（同じ要素 2 件は 2 件として平均）", () => {
    const r = compareWithPopulation(subject, [member(1), member(1), member(3)], {
      kind: "team",
      teamCode: "Z",
    });
    expect(r.populationSize).toBe(3);
    expect(r.traitAverages.cooperativeness).toBeCloseTo((16 + 16 + 15) / 3, 12);
    expect(r.scope).toEqual({ kind: "team", teamCode: "Z" });
  });
});

describe("T-13 母集団 0 件・1 件", () => {
  it("0 件は EmptyPopulationError（scope を持つ）", () => {
    const scope: ComparisonScope = { kind: "team", teamCode: "A" };
    let caught: unknown;
    try {
      compareWithPopulation(member(1), [], scope);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EmptyPopulationError);
    expect((caught as EmptyPopulationError).scope).toEqual(scope);
    expect((caught as EmptyPopulationError).name).toBe("EmptyPopulationError");
  });
  it("1 件（本人のみ）: 差分全 0、合致度 100、偏差値 50、評価 B、cooperative_leader", () => {
    const self = member(2);
    const r = compareWithPopulation(self, [self], ORG);
    for (const k of TRAIT_KEYS) expect(r.traitDiffs[k]).toBe(0);
    expect(r.matchScore).toBe(100);
    expect(r.deviationScore).toBe(50);
    expect(r.grade).toBe("B");
    expect(r.position).toBe("cooperative_leader");
    expect(r.populationSize).toBe(1);
  });
});

describe("合致度の下限と思考の傾向の偏差", () => {
  it("差分合計が 200 を超えると合致度は 0（負にならない）", () => {
    const low = member(5);
    const high: PopulationMember = {
      traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, 30])) as PopulationMember["traits"],
      compatibility: low.compatibility,
    };
    // 差分 16 × 16 = 256 → 100 − 128 < 0
    expect(compareWithPopulation(low, [high], ORG).matchScore).toBe(0);
  });
  it("思考の傾向の偏差は受検者自身の思考の傾向を使う（要件定義書 §11 の 2 番）", () => {
    const subject = {
      adaptive_environment: 0,
      adaptive_work: 0,
      thinking_tendency: 28,
      decision_making: 0,
      stress_tolerance: 0,
    };
    const averages = { adaptive_environment: 0, adaptive_work: 0, thinking_tendency: 21.61, decision_making: 0, stress_tolerance: 0 }; // prettier-ignore
    expect(computeAxisDeviations(subject, averages).thinking_tendency).toBeCloseTo(53.195, 9);
  });
});

describe("T-14 評価・立ち位置の境界（THRESHOLD_EPSILON = 1e-9）", () => {
  it("規則の定義（付録B §9・§10）", () => {
    expect(THRESHOLD_EPSILON).toBe(1e-9);
    expect(GRADE_RULES.map((r) => [r.grade, r.minMatch, r.minDeviation])).toEqual([
      ["A", 80, 60],
      ["B", 70, 50],
      ["C", 60, 40],
      ["D", 60, 30],
    ]);
    expect(POSITION_RULES.map((r) => [r.key, r.minDeviation])).toEqual([
      ["strong_leader", 60],
      ["cooperative_leader", 50],
      ["follower", 40],
      ["passive_follower", 30],
      ["unfit", null],
    ]);
  });

  const gradeCases: Array<[string, number, number, string]> = [
    ["閾値ちょうど (80, 60)", 80, 60, "A"],
    ["閾値ちょうど (60, 30)", 60, 30, "D"],
    ["ε の内側 (80 − 1e-10, 60)", 80 - 1e-10, 60, "A"],
    ["ε の内側 (60, 30 − 1e-10)", 60, 30 - 1e-10, "D"],
    ["ε の内側 (60 − 1e-10, 60)", 60 - 1e-10, 60, "C"],
    ["ε の外側 (79.99, 60)", 79.99, 60, "B"],
    ["ε の外側 (60, 29.99)", 60, 29.99, "E"],
    ["ε の外側 (59.99, 60)", 59.99, 60, "E"],
    ["(70, 50)", 70, 50, "B"],
    ["(69.99, 50)", 69.99, 50, "C"],
    ["(100, 39.99)", 100, 39.99, "D"],
  ];
  it.each(gradeCases)("評価 %s → %s", (_, match, deviation, grade) => {
    expect(decideGrade(match, deviation)).toBe(grade);
  });

  const positionCases: Array<[number, string]> = [
    [60, "strong_leader"],
    [60 - 1e-10, "strong_leader"],
    [59.99, "cooperative_leader"],
    [50, "cooperative_leader"],
    [49.99, "follower"],
    [40, "follower"],
    [39.99, "passive_follower"],
    [30, "passive_follower"],
    [29.99, "unfit"],
    [-100, "unfit"],
  ];
  it.each(positionCases)("立ち位置 偏差値 %f → %s", (deviation, position) => {
    expect(decidePosition(deviation)).toBe(position);
  });

  it("浮動小数の誤差で真値が閾値ちょうどになるケース（合致度 60 相当）", () => {
    const almost = 100 - 0.5 * (80 + EPS / 10);
    expect(decideGrade(almost, 40)).toBe("C");
  });
});
