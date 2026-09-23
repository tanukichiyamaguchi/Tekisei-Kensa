// P-03・P-04（03 §10.8）
import { describe, expect, it } from "vitest";

import { clampForRadar, clampForSlider, clampPercent } from "@/lib/presentation/negative-values";
import {
  formatDecimal,
  formatDeviationScore,
  formatPercent,
  formatStep,
  toDisplayPercent,
} from "@/lib/presentation/rounding";

describe("P-03 丸め（03 §9.2）", () => {
  it.each([
    [37.5, "38%"],
    [89.71, "90%"],
    [89.71000000000001, "90%"],
    [49.84, "50%"],
    [-5, "0%"],
    [100, "100%"],
    [0.5, "1%"],
  ])("formatPercent(%f) → %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });
  it.each([
    [22.5, "22.5"],
    [27, "27"],
    [0, "0"],
    [28.75, "28.75"],
    [68.75, "68.75"],
    [122.5, "122.5"],
  ])("formatStep(%f) → %s", (value, expected) => {
    expect(formatStep(value)).toBe(expected);
  });
  it("formatDecimal は末尾の 0 を除き、-0 を 0 にする", () => {
    expect(formatDecimal(89.71000000000001, 2)).toBe("89.71");
    expect(formatDecimal(-0.001, 2)).toBe("0");
    expect(formatDecimal(10, 0)).toBe("10");
  });
  it("toDisplayPercent は 0〜100 の整数", () => {
    expect(toDisplayPercent(120)).toBe(100);
    expect(toDisplayPercent(-40)).toBe(0);
    expect(toDisplayPercent(78.685)).toBe(79);
  });
  it("偏差値は小数第 1 位", () => {
    expect(formatDeviationScore(68.689)).toBe("68.7");
    expect(formatDeviationScore(69.189)).toBe("69.2");
    expect(formatDeviationScore(50)).toBe("50.0");
  });
});

describe("P-04 負値（03 §8.4）", () => {
  it("相性 −7 → スライダー位置 0、リスク −40 → 0%、スタイル −14.5 → レーダー 0", () => {
    expect(clampForSlider(-7)).toBe(0);
    expect(formatPercent(-40)).toBe("0%");
    expect(clampPercent(-40)).toBe(0);
    expect(clampForRadar(-14.5)).toBe(0);
  });
  it("正の値はそのまま（スライダー・ゲージは 100 で頭打ち）", () => {
    expect(clampForSlider(83)).toBe(83);
    expect(clampForSlider(101)).toBe(100);
    expect(clampPercent(37.5)).toBe(37.5);
    expect(clampForRadar(28.75)).toBe(28.75);
  });
});
