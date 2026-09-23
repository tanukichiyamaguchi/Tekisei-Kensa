// 日時整形（06 §10.3）。API は ISO 8601（UTC）で返し、画面は Asia/Tokyo の「YYYY/MM/DD HH:mm」で表示する
const FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO 8601（UTC）→ "2026/09/17 10:30"。null の代替文言（「未回答」など）は呼び出し側が決める */
export function formatDateTime(iso: string): string {
  const parts = Object.fromEntries(
    FORMATTER.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  // 24 時表記の環境差（"24:05"）を避けて 00 に揃える
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}/${parts.month}/${parts.day} ${hour}:${parts.minute}`;
}
