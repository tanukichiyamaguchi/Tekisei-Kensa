// 性能 PF-01・PF-02（03 §10.9、08 §3.9）
import { describe, expect, it } from "vitest";

import { compareWithPopulation } from "@/lib/scoring/compare";
import { scoreAnswers } from "@/lib/scoring/score";
import type { PopulationMember } from "@/lib/scoring/types";

import { randomAnswers, seededRandom } from "./helpers";

describe("性能", () => {
  it("PF-01 scoreAnswers 1 件あたり平均 5 ms 未満（1,000 件、ウォームアップ 100 件を除く）", () => {
    const random = seededRandom(1);
    const answers = Array.from({ length: 1100 }, () => randomAnswers(random));
    for (const a of answers.slice(0, 100)) scoreAnswers(a);
    const start = performance.now();
    for (const a of answers.slice(100)) scoreAnswers(a);
    const average = (performance.now() - start) / 1000;
    expect(average).toBeLessThan(5);
  });

  it("PF-02 compareWithPopulation（母集団 1,000 件）10 ms 未満", () => {
    const random = seededRandom(2);
    const population: PopulationMember[] = Array.from({ length: 1000 }, () => {
      const r = scoreAnswers(randomAnswers(random));
      return { traits: r.traits, compatibility: r.compatibility };
    });
    const subject = population[0]!;
    for (let i = 0; i < 10; i += 1)
      compareWithPopulation(subject, population, { kind: "organization" });
    const runs = 20;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1)
      compareWithPopulation(subject, population, { kind: "organization" });
    const average = (performance.now() - start) / runs;
    expect(average).toBeLessThan(10);
  });
});
