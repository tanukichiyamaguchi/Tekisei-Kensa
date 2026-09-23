// 電話番号の正規化と形式（04 §2.3 D04-06、05 D05-16。04 の respondent.ts と 05 の registration-rules.ts が共有する）

/** 8〜20 文字の数字・+・括弧・ハイフン（国際形式・括弧付きも受理する仮置き） */
export const PHONE_PATTERN = /^[0-9+()-]{8,20}$/; // 04 D04-06 の ^[0-9+()\-]{8,20}$ と同じ（末尾の - はリテラル）

/**
 * 前後空白除去 → 全角数字を半角 → ハイフン類（－‐‑–—ー）を - → 全角括弧・全角プラスを半角 → 空白除去
 */
export function normalizePhoneNumber(input: string): string {
  return input
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－‐‑–—ー−]/g, "-")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/＋/g, "+")
    .replace(/[\s\u3000]/g, ""); // 全角空白（U+3000）を含む
}

export function isValidPhoneNumber(normalized: string): boolean {
  return PHONE_PATTERN.test(normalized);
}
