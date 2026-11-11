// 色規則（11-4 §3.4。06 §5 を置き換える）。結果詳細のリスクは表示値の 4 段階（§2.10）、信頼係数は 3 段階と一文（§2.7.4・§2.4。
// K-39 Q-04）。合致度と評価は色分けしない（K-39 Q-03）。一文は文言なので result-detail-texts.ts の RESULT_DETAIL_TEXTS に置く。
// 段階の判定は表示値（丸め後の整数。03 D3-13）で行う。ただし受験情報の 1 行の信頼係数だけは丸める前の値で判定する（参照元どおり。
// 03 D3-13 の例外。11-4 §2.4）。前回の 5 段階の色（BAND_COLORS・bandOf ほか）は PR-7.8a で消した

/** リスクの段階: 1 低い・2 やや低い・3 注意・4 高い（11-4 §2.10） */
export type RiskLevel = 1 | 2 | 3 | 4;

export interface RiskLevelStyle {
  readonly label: "低い" | "やや低い" | "注意" | "高い"; // 札の文字
  readonly rowBackground: string; // 行の地
  readonly line: string; // 行の左の線
  readonly badgeBackground: string; // 札の地（低い #12883E・高い #EB1515 は K-49。参照元 #16A34A・#EF4444。§2.10）
  readonly badgeText: string; // 札の文字の色
  readonly bar: string; // 棒の塗り。概要の注意したいリスクの点にも使う（§2.7.5）
  readonly value: string; // リスクの行の数字の色
  readonly overviewValue: string; // 概要の注意したいリスクの数字の色（K-49。低い #157E3C・やや低い #9C5F07。注意・高いは value と同じ。§2.7.5）
  readonly nameWeight: 600 | 700; // 名前の太さ
}

/** 11-4 §2.10 の段階と色の表と、§2.7.5 の注意したいリスクの点と数字の色 */
export const RISK_LEVEL_STYLES: Readonly<Record<RiskLevel, RiskLevelStyle>> = Object.freeze({
  1: Object.freeze({
    label: "低い",
    rowBackground: "#E8F7EE",
    line: "#16A34A",
    badgeBackground: "#12883E",
    badgeText: "#FFFFFF",
    bar: "#16A34A",
    value: "#15803D",
    overviewValue: "#157E3C",
    nameWeight: 600,
  }),
  2: Object.freeze({
    label: "やや低い",
    rowBackground: "#FEF9E0",
    line: "#FACC15",
    badgeBackground: "#FACC15",
    badgeText: "#5B4100",
    bar: "#EAB308",
    value: "#A16207",
    overviewValue: "#9C5F07",
    nameWeight: 600,
  }),
  3: Object.freeze({
    label: "注意",
    rowBackground: "#FFF0E0",
    line: "#FB923C",
    badgeBackground: "#FDBA74",
    badgeText: "#7C2D12",
    bar: "#FB923C",
    value: "#C2410C",
    overviewValue: "#C2410C",
    nameWeight: 700,
  }),
  4: Object.freeze({
    label: "高い",
    rowBackground: "#FDE7E7",
    line: "#EF4444",
    badgeBackground: "#EB1515",
    badgeText: "#FFFFFF",
    bar: "#EF4444",
    value: "#B91C1C",
    overviewValue: "#B91C1C",
    nameWeight: 700,
  }),
});

/** リスクの段階（11-4 §2.10）。displayValue は表示値（toDisplayPercent。0〜100 の整数）: 20 未満 1、40 未満 2、60 未満 3、それ以外 4 */
export function riskLevel(displayValue: number): RiskLevel {
  if (displayValue < 20) return 1;
  if (displayValue < 40) return 2;
  if (displayValue < 60) return 3;
  return 4;
}

/** 信頼係数の 3 段階（11-4 §2.7.4） */
export type ReliabilityTone = "low" | "mid" | "good";

/** 信頼係数の数字（とメーターの塗り）の色（11-4 §2.7.4・§2.4） */
export const RELIABILITY_TONE_COLORS: Readonly<Record<ReliabilityTone, string>> = Object.freeze({
  low: "#B42318",
  mid: "#B45309",
  good: "#15805E",
});

/**
 * 信頼係数の段階: 40 未満 "low"、80 未満 "mid"、それ以外 "good"。概要のカードは表示値（toDisplayPercent）、受験情報の 1 行は
 * 丸める前の値を渡す（参照元どおり。03 D3-13 の例外。11-4 §2.4・§2.7.4）
 */
export function reliabilityTone(value: number): ReliabilityTone {
  if (value < 40) return "low";
  if (value < 80) return "mid";
  return "good";
}
