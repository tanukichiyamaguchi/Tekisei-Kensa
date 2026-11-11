// P-03・P-04（03 §10.8）、M7-result-01〜03（11-4 §5.1。結果詳細の小数第 1 位の表示・差のバッジ・吹き出しの差）
import { describe, expect, it } from "vitest";

import { clampForRadar, clampForSlider, clampPercent } from "@/lib/presentation/negative-values";
import {
  diffTone,
  formatDecimal,
  formatDiffBadge,
  formatOneDecimal,
  formatPercent,
  formatStep,
  formatTooltipDiff,
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

describe("M7-result-01 formatOneDecimal（小数第 1 位の表示。11-4 §0.4）", () => {
  it.each([
    [26.25, "26.3"],
    [25, "25"],
    [16.5, "16.5"],
    [7, "7"],
    [0.05, "0.1"],
    [-0.25, "-0.2"],
    [-0.04, "0"],
    [-1.5, "-1.5"],
  ])("formatOneDecimal(%f) → %s", (value, expected) => {
    expect(formatOneDecimal(value)).toBe(expected);
  });

  it("末尾の 0 を付けず、-0 を「0」にする（0〜30 の 0.25 刻みと −0.25〜0 で確かめる）", () => {
    for (let i = 0; i <= 120; i += 1) {
      const text = formatOneDecimal(i / 4);
      expect(text, String(i / 4)).toMatch(/^\d+(\.\d)?$/);
      expect(text.endsWith(".0"), String(i / 4)).toBe(false);
    }
    expect(formatOneDecimal(-0)).toBe("0");
    expect(formatOneDecimal(-0.01)).toBe("0");
  });
});

describe("M7-result-02 formatDiffBadge・diffTone（差のバッジ。11-4 §2.8.5。K-44）", () => {
  it.each([
    [6.5, "+6.5", "up"],
    [-1.6, "-1.6", "dn"],
    [1.5, "+1.5", "up"],
    [-1.5, "-1.5", "dn"],
    [1.49, "+1.5", "eq"], // 文字は丸め、色は丸めない差で決める
    [0, "0.0", "eq"],
    [0.04, "0.0", "eq"], // 小数第 1 位で 0 になる差は符号を付けない（K-44。参照元は "+0.0"）
    [-0.04, "0.0", "eq"], // 同じ（参照元は "-0.0"）
    [0.05, "+0.1", "eq"], // 0.05 という数は内部では 0.05 よりわずかに大きく、toFixed(1) は "0.1"
    [-0.05, "-0.1", "eq"],
  ])("formatDiffBadge(%f) → %s、diffTone → %s", (diff, text, tone) => {
    expect(formatDiffBadge(diff)).toBe(text);
    expect(diffTone(diff)).toBe(tone);
  });

  it("−0.05 より大きく 0.05 より小さい差は、どれも符号なしの「0.0」（「+0.0」「-0.0」を出さない）", () => {
    for (let i = -49; i <= 49; i += 1) {
      expect(formatDiffBadge(i / 1000), String(i / 1000)).toBe("0.0");
    }
    expect(formatDiffBadge(-0)).toBe("0.0");
  });
});

describe("M7-result-03 formatTooltipDiff（吹き出しの差。11-4 §2.8.3）", () => {
  // 引数は formatOneDecimal を数にした値（吹き出しの「本人 {m}点」「サロン平均 {o}点」の m と o）
  it.each([
    [26.5, 20, "+6.5"],
    [14, 15.6, "-1.6"],
    [20, 20, "0"],
    [16.5, 16, "+0.5"],
  ])("formatTooltipDiff(%f, %f) → %s", (m, o, expected) => {
    expect(formatTooltipDiff(m, o)).toBe(expected);
  });

  it("丸めた m と o の差を、もう一度小数第 1 位に丸める（26.25 と 19.96 → 26.3 と 20 → +6.3）", () => {
    const m = Number(formatOneDecimal(26.25));
    const o = Number(formatOneDecimal(19.96));
    expect([m, o]).toEqual([26.3, 20]);
    expect(formatTooltipDiff(m, o)).toBe("+6.3");
    expect(formatTooltipDiff(15.6, 15.6)).toBe("0");
  });
});
