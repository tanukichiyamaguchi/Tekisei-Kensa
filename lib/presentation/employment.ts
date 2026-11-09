// 区分・入社日・退職日・役職の判定と表示（11-2 §3.1・§3.11、11-3 §3.7）。画面とサーバの両方で使う純関数のファイル。
// firebase-admin と lib/db の実行時コードを読まない（lib/db/schemas/values.ts の calendarDateSchema が
// この判定を使い、画面からは values.ts を読めないため、日付の判定はここの 1 か所に置く。11 総論 8.3 の 4）

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_CALENDAR_DATE = "1900-01-01";
const MAX_CALENDAR_DATE = "2100-12-31";

/** YYYY-MM-DD（数字 4 桁-2 桁-2 桁）が実在する日で、1900-01-01〜2100-12-31 の範囲にあるか（11-2 §3.1） */
export function isValidCalendarDate(s: string): boolean {
  const m = CALENDAR_DATE_PATTERN.exec(s);
  if (!m) return false;
  // 同じ形の文字列どうしなので、辞書順の比較が日付の前後と一致する
  if (s < MIN_CALENDAR_DATE || s > MAX_CALENDAR_DATE) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
