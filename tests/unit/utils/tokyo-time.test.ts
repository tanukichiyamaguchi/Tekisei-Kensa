// M7-list-05 のうち addOneYearInTokyo の分（11-2 §3.11・§5.1、11-6 §3.7.5、11 総論 8.3 の 2）。
// 境目（回答一覧の ≤、1 年経過の帯の <）は呼ぶ側の関数のテストで確かめる
import { describe, expect, it } from "vitest";

import { addOneYearInTokyo } from "@/lib/utils/tokyo-time";

const plusOneYear = (iso: string) => addOneYearInTokyo(new Date(iso)).toISOString();

describe("M7-list-05 addOneYearInTokyo", () => {
  it("東京の 2 月 29 日は翌年の 3 月 1 日の同じ時刻（東京 2024-02-29 10:00 → 東京 2025-03-01 10:00）", () => {
    expect(plusOneYear("2024-02-29T01:00:00.000Z")).toBe("2025-03-01T01:00:00.000Z");
  });

  it("東京の年月日で足す: 東京 2024-03-01 05:00（UTC では 2 月 29 日 20:00）は東京 2025-03-01 05:00", () => {
    expect(plusOneYear("2024-02-29T20:00:00.000Z")).toBe("2025-02-28T20:00:00.000Z");
  });

  it("ふつうの日は年月日と時刻をミリ秒まで保つ", () => {
    expect(plusOneYear("2025-11-10T00:05:07.123Z")).toBe("2026-11-10T00:05:07.123Z");
    expect(plusOneYear("2023-02-28T14:59:59.999Z")).toBe("2024-02-28T14:59:59.999Z");
  });

  it("東京の 12 月 31 日 23:59 と 1 月 1 日 0:00（UTC は前日 15:00）でも年が正しい", () => {
    // 東京 2025-12-31 23:59 → 東京 2026-12-31 23:59
    expect(plusOneYear("2025-12-31T14:59:00.000Z")).toBe("2026-12-31T14:59:00.000Z");
    // 東京 2026-01-01 00:00 → 東京 2027-01-01 00:00
    expect(plusOneYear("2025-12-31T15:00:00.000Z")).toBe("2026-12-31T15:00:00.000Z");
  });

  it("実行環境の時間帯（TZ）に左右されない（UTC のメソッドだけで計算する）", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(plusOneYear("2024-02-29T01:00:00.000Z"), tz).toBe("2025-03-01T01:00:00.000Z");
        expect(plusOneYear("2024-02-29T20:00:00.000Z"), tz).toBe("2025-02-28T20:00:00.000Z");
        expect(plusOneYear("2025-12-31T15:00:00.000Z"), tz).toBe("2026-12-31T15:00:00.000Z");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("渡した Date を変えない", () => {
    const at = new Date("2024-02-29T01:00:00.000Z");
    addOneYearInTokyo(at);
    expect(at.toISOString()).toBe("2024-02-29T01:00:00.000Z");
  });
});
