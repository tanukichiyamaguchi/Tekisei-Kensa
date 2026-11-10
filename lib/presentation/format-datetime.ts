// 日時整形（06 §10.3、11-2 §3.11）。API は ISO 8601（UTC）で返し、画面は Asia/Tokyo で表示する
const FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Asia/Tokyo の年・月・日・時・分（月日時分は 2 けた） */
function tokyoParts(iso: string): {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
} {
  const parts = FORMATTER.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = part("hour");
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    // 24 時表記の環境差（"24:05"）を避けて 00 に揃える
    hour: hour === "24" ? "00" : hour,
    minute: part("minute"),
  };
}

/** 先頭の 0 を落とす（"09" → "9"） */
function unpadded(twoDigits: string): string {
  return String(Number(twoDigits));
}

/** ISO 8601（UTC）→ "2026/09/17 10:30"。null の代替文言（「未回答」など）は呼び出し側が決める */
export function formatDateTime(iso: string): string {
  const p = tokyoParts(iso);
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** ISO 8601（UTC）→ Asia/Tokyo の暦日 "2026/9/7"（月日を 0 で埋めない。回答一覧の受験日・前回・削除の確認。11-2 §2.8） */
export function formatYmd(iso: string): string {
  const p = tokyoParts(iso);
  return `${p.year}/${unpadded(p.month)}/${unpadded(p.day)}`;
}

/** ISO 8601（UTC）→ Asia/Tokyo の時刻 "09:05"（時と分を 2 けた。回答一覧の最新の受験。11-2 §2.8） */
export function formatHm(iso: string): string {
  const p = tokyoParts(iso);
  return `${p.hour}:${p.minute}`;
}

/**
 * 暦日 YYYY-MM-DD → "2025/4/1"（月日を 0 で埋めない。入社日・退職日のチップ。11-2 §2.9）。
 * 日時ではないので時間帯の変換をしない（文字列を分けて数にする）。形の違う値はそのまま返す
 */
export function formatCalendarDate(ymd: string): string {
  const m = CALENDAR_DATE_PATTERN.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}

/** ISO 8601（UTC）→ "2026/9/07 09:05"（年 4 けた、月は 0 で埋めない、日・時・分は 2 けた。利用履歴の回答日時。11-2 §2.18） */
export function formatUsageLogDateTime(iso: string): string {
  const p = tokyoParts(iso);
  return `${p.year}/${unpadded(p.month)}/${p.day} ${p.hour}:${p.minute}`;
}
