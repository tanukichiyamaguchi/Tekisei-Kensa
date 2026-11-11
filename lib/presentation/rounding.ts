// 画面表示の丸め（03 §9.2）。丸めはこのファイルだけで行い、画面で toFixed を直接呼ばない（06 §2.5）。
// 結果詳細の小数第 1 位の表示・差のバッジ・吹き出しの差（11-4 §0.4・§2.8.3・§2.8.5）もここで行う
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

/** Math.round(v × 10) ÷ 10（Math.round は 0.5 を正の方へ丸める: -0.25 → -0.2、-0.04 → -0） */
function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 小数第 1 位の表示（参照元の fx。11-4 §0.4）。Math.round(v × 10) ÷ 10 を String にする（末尾の 0 は付けない。-0 は "0"）。
 * 例 26.25 → "26.3"、25 → "25"、-0.25 → "-0.2"、-0.04 → "0"
 */
export function formatOneDecimal(value: number): string {
  return String(roundOneDecimal(value));
}

/**
 * 16の特性の差のバッジ（11-4 §2.8.5）。d は丸めない差（本人 − 平均）。d.toFixed(1) が "0.0" か "-0.0"（小数第 1 位で 0 になる差）
 * なら符号を付けずに "0.0"（K-44。参照元は "+0.0"・"-0.0"）、それ以外は d が正なら前に "+"。
 * 例 6.5 → "+6.5"、-1.6 → "-1.6"、0 → "0.0"、0.04 → "0.0"、-0.04 → "0.0"、0.05 → "+0.1"
 */
export function formatDiffBadge(diff: number): string {
  const fixed = diff.toFixed(1);
  if (fixed === "0.0" || fixed === "-0.0") return "0.0";
  return diff > 0 ? `+${fixed}` : fixed;
}

/**
 * 吹き出しの差（11-4 §2.8.3）。丸めた本人と平均の差を、もう一度小数第 1 位に丸める（Math.round((m − o) × 10) ÷ 10）。
 * 正なら前に "+"。例 (26.5, 20) → "+6.5"、(14, 15.6) → "-1.6"、(20, 20) → "0"
 */
export function formatTooltipDiff(subjectRounded: number, averageRounded: number): string {
  const d = roundOneDecimal(subjectRounded - averageRounded);
  return d > 0 ? `+${d}` : String(d);
}

/** 差のバッジの色の種類（11-4 §2.8.5）。色は丸めない差で決める: 絶対値が 1.5 未満 "eq"、正 "up"、それ以外 "dn" */
export function diffTone(diff: number): "eq" | "up" | "dn" {
  if (Math.abs(diff) < 1.5) return "eq";
  return diff > 0 ? "up" : "dn";
}
