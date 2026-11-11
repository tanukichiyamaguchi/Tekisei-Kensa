// P-01・P-02（03 §10.8）。項目一覧のポップアップの並べ替え（sortTraitsForList）は PR-7.8a で消した（2 つのポップアップは 16 行を
// 項目順。11-4 §2.15。一覧の並び替えは result-detail-rules.test.ts の M7-result-06）
import { describe, expect, it } from "vitest";

import { pickHighestTrait, pickLowestTrait } from "@/lib/presentation/trait-highlights";
import { scoreAnswers } from "@/lib/scoring/score";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

describe("最高・最低尺度", () => {
  it("P-01 周期回答: 最高 rule_compliance（18.5）、最低 humility（13。こだわり・発想力と同点 → 軸順で先）", () => {
    const { traits } = scoreAnswers(cyclicAnswers());
    expect(pickHighestTrait(traits)).toEqual({ key: "rule_compliance", value: 18.5 });
    expect(pickLowestTrait(traits)).toEqual({ key: "humility", value: 13 });
  });
  it("P-02 全尺度同値: 最高 = 最低 = cooperativeness", () => {
    const { traits } = scoreAnswers(uniformAnswers(3));
    expect(pickHighestTrait(traits).key).toBe("cooperativeness");
    expect(pickLowestTrait(traits).key).toBe("cooperativeness");
  });
});
