// 色規則（06 §5.2）。判定は表示値（丸め後の整数。03 D3-13）で行う。
import type { Grade } from "@/lib/scoring/types";

export type ValueBand = "very_low" | "low" | "middle" | "high" | "very_high";

export const BAND_COLORS: Readonly<Record<ValueBand, string>> = Object.freeze({
  very_low: "#8ecae6", // 薄い青
  low: "#2e9e5b", // 緑
  middle: "#d4a600", // 黄
  high: "#ff8000", // 橙（付録C §7 の取得値）
  very_high: "#d32f2f", // 赤
});

/** 信頼係数専用: 高いほど緑系（要件定義書 §11 の 5 番、D06-04） */
export const RELIABILITY_COLORS: Readonly<Record<ValueBand, string>> = Object.freeze({
  very_low: BAND_COLORS.very_high, // 赤
  low: BAND_COLORS.high, // 橙
  middle: BAND_COLORS.middle, // 黄
  high: "#7cb342", // 黄緑
  very_high: "#1b7f4b", // 濃い緑
});

export const GRADE_COLORS: Readonly<Record<Grade, string>> = Object.freeze({
  A: BAND_COLORS.very_high,
  B: BAND_COLORS.high,
  C: BAND_COLORS.low,
  D: BAND_COLORS.middle,
  E: BAND_COLORS.very_low,
});

/** 付録C §7 の値域（0〜19 / 20〜39 / 40〜59 / 60〜79 / 80〜100） */
export function bandOf(displayValue: number): ValueBand {
  if (displayValue < 20) return "very_low";
  if (displayValue < 40) return "low";
  if (displayValue < 60) return "middle";
  if (displayValue < 80) return "high";
  return "very_high";
}

/** リスク: 既存どおり高いほど赤 */
export function riskColor(displayValue: number): string {
  return BAND_COLORS[bandOf(displayValue)];
}
/** 合致度: 既存どおり（D-09、10 K-02） */
export function matchScoreColor(displayValue: number): string {
  return BAND_COLORS[bandOf(displayValue)];
}
/** 信頼係数: 高いほど緑系 */
export function reliabilityColor(displayValue: number): string {
  return RELIABILITY_COLORS[bandOf(displayValue)];
}
export function gradeColor(grade: Grade): string {
  return GRADE_COLORS[grade];
}
