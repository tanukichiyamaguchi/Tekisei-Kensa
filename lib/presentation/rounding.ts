// 画面表示の丸め（03 §9.2）。丸めはこのファイルだけで行い、画面で toFixed を直接呼ばない（06 §2.5）。
import { clampPercent } from "./negative-values";

/**
 * 小数第 maxFractionDigits 位までに丸め、末尾の 0 を除いた文字列にする。
 * 例: formatDecimal(28.75, 2) → "28.75"、formatDecimal(27, 2) → "27"、formatDecimal(89.71000000000001, 2) → "89.71"
 */
export function formatDecimal(value: number, maxFractionDigits: number): string {
  const fixed = value.toFixed(maxFractionDigits);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

/** 刻みのある指標（16 尺度 0.5、リスク 2.5、スタイル 0.25、資質 1.25）の数値表示。整数なら小数を付けない */
export function formatStep(value: number): string {
  return formatDecimal(value, 2);
}

/** ゲージの表示値: 0〜100 に収めて四捨五入した整数（D3-12。色の判定にもこの値を使う。D3-13） */
export function toDisplayPercent(value: number): number {
  return Math.round(clampPercent(value));
}

/** ゲージ中央の「NN%」 */
export function formatPercent(value: number): string {
  return `${toDisplayPercent(value)}%`;
}

/** 偏差値の表示（小数第 1 位。03 §9.2） */
export function formatDeviationScore(value: number): string {
  return value.toFixed(1);
}
