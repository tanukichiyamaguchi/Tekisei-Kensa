// M7-result-04・05（11-4 §5.1。X-08 の置き換え）: リスクの 4 段階（riskLevel・RISK_LEVEL_STYLES。表示値の降順の並びは
// result-detail-rules.test.ts の rankRisks）と、信頼係数の 3 段階（reliabilityTone・RELIABILITY_TONE_COLORS。受験情報の 1 行と
// 概要のカードの描いた表示は部品のテスト）。4 段階の名前・色・太さと信頼係数の色の期待値は 11-4 §2.10・§2.7.5・§2.7.4 を読んで作る
// （組織内分類の M7-zaiseki-04 と同じ書き方）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  RELIABILITY_TONE_COLORS,
  reliabilityTone,
  RISK_LEVEL_STYLES,
  riskLevel,
  type RiskLevel,
} from "@/lib/presentation/colors";
import { toDisplayPercent } from "@/lib/presentation/rounding";

const SPEC = readFileSync(
  fileURLToPath(
    new URL("../../../docs/基本設計/11_参照元の更新/11-4_結果詳細.md", import.meta.url),
  ),
  "utf8",
);

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

const HEX = "(#[0-9A-F]{6})";

/** §2.10 の段階と色の表（段階・行の地・左の線・札の地／文字・棒の塗り・数字・名前の太さ） */
const RISK_TABLE = [
  ...between(SPEC, "### 2.10 ", "### 2.11 ").matchAll(
    new RegExp(
      `^\\| (低い|やや低い|注意|高い) \\| [^|]+ \\| ${HEX} \\| ${HEX} \\| ${HEX}／${HEX} \\| ${HEX} \\| ${HEX} \\| (\\d+) \\|$`,
      "gm",
    ),
  ),
].map((m) => ({
  label: m[1]!,
  rowBackground: m[2]!,
  line: m[3]!,
  badgeBackground: m[4]!,
  badgeText: m[5]!,
  bar: m[6]!,
  value: m[7]!,
  nameWeight: Number(m[8]),
}));

/** §2.7.5 の注意したいリスクの点と数字の色（「低い 点 #16A34A・数字 #157E3C、やや低い #EAB308・#9C5F07、…」） */
const OVERVIEW_COLORS = between(
  between(SPEC, "#### 2.7.5 ", "### 2.8 "),
  "点と数字の色はリスクの段階（§2.10）で決める: ",
  "。",
)
  .replace("点と数字の色はリスクの段階（§2.10）で決める: ", "")
  .split("、")
  .map((part) => {
    const m = new RegExp(`^(低い|やや低い|注意|高い) (?:点 )?${HEX}・(?:数字 )?${HEX}$`).exec(part);
    if (!m) throw new Error(`読めない: ${part}`);
    return { label: m[1]!, point: m[2]!, value: m[3]! };
  });

/** §2.7.4 の信頼係数の表（範囲・色・一文） */
const RELIABILITY_TABLE = [
  ...between(SPEC, "#### 2.7.4 ", "#### 2.7.5 ").matchAll(
    new RegExp(`^\\| (40 未満|40 以上 80 未満|80 以上) \\| ${HEX} \\| (.+) \\|$`, "gm"),
  ),
].map((m) => ({ range: m[1]!, color: m[2]!, sentence: m[3]! }));

const LEVELS: readonly RiskLevel[] = [1, 2, 3, 4];

describe("M7-result-04 riskLevel・RISK_LEVEL_STYLES（リスクの 4 段階。11-4 §2.10）", () => {
  it.each([
    [0, 1],
    [19, 1],
    [20, 2],
    [39, 2],
    [40, 3],
    [59, 3],
    [60, 4],
    [100, 4],
  ])("riskLevel(%i) → %i", (value, level) => {
    expect(riskLevel(value)).toBe(level);
  });

  it("段階は表示値（toDisplayPercent）で決める: 19.5 → 表示値 20 → やや低い、−5 → 0 → 低い、57.5 → 58 → 注意", () => {
    expect(toDisplayPercent(19.5)).toBe(20);
    expect(riskLevel(toDisplayPercent(19.5))).toBe(2);
    expect(toDisplayPercent(-5)).toBe(0);
    expect(riskLevel(toDisplayPercent(-5))).toBe(1);
    expect(riskLevel(toDisplayPercent(57.5))).toBe(3);
    expect(riskLevel(toDisplayPercent(59.5))).toBe(4); // 表示値 60
  });

  it("4 段階の名前・行の地・左の線・札の地と文字・棒・数字・名前の太さが §2.10 の表と一致する（札の地の低い・高いは K-49）", () => {
    expect(RISK_TABLE).toHaveLength(4);
    for (const [i, level] of LEVELS.entries()) {
      // 表に無いのは概要の数字（overviewValue。次のテスト）だけ
      expect(RISK_LEVEL_STYLES[level], String(level)).toEqual({
        ...RISK_TABLE[i],
        overviewValue: RISK_LEVEL_STYLES[level].overviewValue,
      });
    }
    expect(RISK_LEVEL_STYLES[1].badgeBackground).toBe("#12883E"); // 参照元 #16A34A
    expect(RISK_LEVEL_STYLES[4].badgeBackground).toBe("#EB1515"); // 参照元 #EF4444
  });

  it("概要の注意したいリスクの点は棒の塗り、数字は overviewValue（§2.7.5。低い・やや低いは K-49 の色）", () => {
    expect(OVERVIEW_COLORS.map((c) => c.label)).toEqual(["低い", "やや低い", "注意", "高い"]);
    for (const [i, level] of LEVELS.entries()) {
      const style = RISK_LEVEL_STYLES[level];
      expect([style.label, style.bar, style.overviewValue], String(level)).toEqual([
        OVERVIEW_COLORS[i]!.label,
        OVERVIEW_COLORS[i]!.point,
        OVERVIEW_COLORS[i]!.value,
      ]);
    }
    // 低い・やや低いの数字はリスクの行（value）と違う色、注意・高いは同じ色
    expect(RISK_LEVEL_STYLES[1].overviewValue).not.toBe(RISK_LEVEL_STYLES[1].value);
    expect(RISK_LEVEL_STYLES[2].overviewValue).not.toBe(RISK_LEVEL_STYLES[2].value);
    expect(RISK_LEVEL_STYLES[3].overviewValue).toBe(RISK_LEVEL_STYLES[3].value);
    expect(RISK_LEVEL_STYLES[4].overviewValue).toBe(RISK_LEVEL_STYLES[4].value);
  });

  it("定数は書き換えられない", () => {
    expect(Object.isFrozen(RISK_LEVEL_STYLES)).toBe(true);
    for (const level of LEVELS) expect(Object.isFrozen(RISK_LEVEL_STYLES[level])).toBe(true);
  });
});

describe("M7-result-05 reliabilityTone・RELIABILITY_TONE_COLORS（信頼係数の 3 段階。11-4 §2.4・§2.7.4）", () => {
  it.each([
    [39.99, "low"],
    [40, "mid"],
    [79.99, "mid"],
    [80, "good"],
    [0, "low"],
    [100, "good"],
  ])("reliabilityTone(%f) → %s", (value, tone) => {
    expect(reliabilityTone(value)).toBe(tone);
  });

  it("受験情報の 1 行は丸める前の値、概要のカードは表示値で判定する（境目の近くで色が合わないのは参照元どおり）", () => {
    // 79.6: 受験情報は #B45309、概要は表示値 80 で #15805E
    expect(reliabilityTone(79.6)).toBe("mid");
    expect(toDisplayPercent(79.6)).toBe(80);
    expect(reliabilityTone(toDisplayPercent(79.6))).toBe("good");
    // 39.6: 受験情報は #B42318、概要は表示値 40 で #B45309
    expect(reliabilityTone(39.6)).toBe("low");
    expect(reliabilityTone(toDisplayPercent(39.6))).toBe("mid");
    // 89.71: どちらも 90%・#15805E 側（受験情報の値は通常の色）
    expect(toDisplayPercent(89.71)).toBe(90);
    expect(reliabilityTone(89.71)).toBe("good");
    expect(reliabilityTone(toDisplayPercent(89.71))).toBe("good");
    // 0: 概要は「0%」と #B42318
    expect(reliabilityTone(toDisplayPercent(0))).toBe("low");
  });

  it("3 段階の色が §2.7.4 の表と一致する（low #B42318・mid #B45309・good #15805E）", () => {
    expect(RELIABILITY_TABLE.map((row) => [row.range, row.color])).toEqual([
      ["40 未満", RELIABILITY_TONE_COLORS.low],
      ["40 以上 80 未満", RELIABILITY_TONE_COLORS.mid],
      ["80 以上", RELIABILITY_TONE_COLORS.good],
    ]);
    expect(RELIABILITY_TONE_COLORS).toEqual({ low: "#B42318", mid: "#B45309", good: "#15805E" });
    expect(Object.isFrozen(RELIABILITY_TONE_COLORS)).toBe(true);
  });
});
