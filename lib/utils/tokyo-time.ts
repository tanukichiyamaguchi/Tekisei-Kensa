// Asia/Tokyo の暦で日時を扱う純関数（11-2 §3.11、11-6 §3.7.5、11 総論 8.3 の 2）。firebase・React・lib/db を読まない
// （画面の lib/presentation とサーバの両方から使う）。日本は夏時間が無いため、Asia/Tokyo は UTC+9 で固定する
// （lib/services/rate-limit.ts の startOfTokyoDay と同じ扱い）。実行環境の時間帯（TZ）に左右されないよう UTC のメソッドだけで計算する

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Asia/Tokyo の年月日と時刻（ミリ秒まで）のまま年だけを 1 つ増やす。2 月 29 日は翌年の 3 月 1 日になる
 * （Date.UTC の繰り上がり。参照元の JavaScript の setFullYear と同じ）。
 * 境目（回答一覧の「受験から1年以上」は足した日時 ≤ 基準時刻、1 年経過の帯は足した日時 < 現在）は呼ぶ側に書く（11 総論 8.3 の 2）
 */
export function addOneYearInTokyo(at: Date): Date {
  const tokyo = new Date(at.getTime() + TOKYO_OFFSET_MS);
  return new Date(
    Date.UTC(
      tokyo.getUTCFullYear() + 1,
      tokyo.getUTCMonth(),
      tokyo.getUTCDate(),
      tokyo.getUTCHours(),
      tokyo.getUTCMinutes(),
      tokyo.getUTCSeconds(),
      tokyo.getUTCMilliseconds(),
    ) - TOKYO_OFFSET_MS,
  );
}
