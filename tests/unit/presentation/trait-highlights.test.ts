// P-01・P-02（03 §10.8）
import { describe, expect, it } from "vitest";

import {
  pickHighestTrait,
  pickLowestTrait,
  sortTraitsForList,
} from "@/lib/presentation/trait-highlights";
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
  it("一覧ポップアップ: 値の降順、同点は軸順", () => {
    const { traits } = scoreAnswers(cyclicAnswers());
    const list = sortTraitsForList(traits);
    expect(list).toHaveLength(16);
    expect(list[0]).toEqual({ key: "rule_compliance", value: 18.5 });
    expect(list.map((x) => x.key).slice(-3)).toEqual(["humility", "persistence", "creativity"]);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1]!.value).toBeGreaterThanOrEqual(list[i]!.value);
    }
  });
});
