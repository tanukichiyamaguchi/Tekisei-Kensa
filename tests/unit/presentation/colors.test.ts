// X-08（06 §10.6）
import { describe, expect, it } from "vitest";

import {
  BAND_COLORS,
  bandOf,
  gradeColor,
  matchScoreColor,
  reliabilityColor,
  riskColor,
} from "@/lib/presentation/colors";

describe("X-08 色規則", () => {
  it.each([
    [0, "very_low"],
    [19, "very_low"],
    [20, "low"],
    [39, "low"],
    [40, "middle"],
    [59, "middle"],
    [60, "high"],
    [79, "high"],
    [80, "very_high"],
    [100, "very_high"],
  ])("bandOf(%i) → %s", (value, band) => {
    expect(bandOf(value)).toBe(band);
  });
  it("リスク・合致度は高いほど赤、信頼係数は高いほど緑系", () => {
    expect(riskColor(80)).toBe("#d32f2f");
    expect(riskColor(10)).toBe("#8ecae6");
    expect(matchScoreColor(90)).toBe("#d32f2f");
    expect(reliabilityColor(80)).toBe("#1b7f4b");
    expect(reliabilityColor(90)).toBe("#1b7f4b");
    expect(reliabilityColor(70)).toBe("#7cb342");
    expect(reliabilityColor(50)).toBe("#d4a600");
    expect(reliabilityColor(30)).toBe("#ff8000");
    expect(reliabilityColor(0)).toBe("#d32f2f");
  });
  it("評価レター A 赤 / B 橙 / C 緑 / D 黄 / E 薄い青", () => {
    expect(["A", "B", "C", "D", "E"].map((g) => gradeColor(g as "A"))).toEqual([
      BAND_COLORS.very_high,
      BAND_COLORS.high,
      BAND_COLORS.low,
      BAND_COLORS.middle,
      BAND_COLORS.very_low,
    ]);
  });
});
