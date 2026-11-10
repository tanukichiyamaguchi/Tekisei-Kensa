// M7-list-15 回答一覧と利用履歴の日時の整形（11-2 §2.8・§2.9・§2.18・§3.11・§5.1。lib/presentation/format-datetime.ts）。
// M7-zaiseki-21 組織内分類の受験日（11-3 §2.12・§3.7・§5.1。在籍・退職の formatCalendarDateSlashPadded は PR-7.7b）。
// formatDateTime（06 §10.3）は tests/unit/presentation/admin-navigation.test.ts
import { describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  formatDateSlashPadded,
  formatHm,
  formatUsageLogDateTime,
  formatYmd,
} from "@/lib/presentation/format-datetime";

describe("M7-list-15 formatYmd・formatHm（Asia/Tokyo。最新の受験・前回・削除の確認）", () => {
  it("UTC 15:00 以降が翌日になる（0 時は 00:00）", () => {
    expect(formatYmd("2026-09-06T15:00:00Z")).toBe("2026/9/7");
    expect(formatHm("2026-09-06T15:00:00Z")).toBe("00:00");
    expect(formatYmd("2026-09-06T14:59:00Z")).toBe("2026/9/6");
    expect(formatHm("2026-09-06T14:59:00Z")).toBe("23:59");
  });

  it("formatYmd は月日を 0 で埋めない、formatHm は時と分を 2 けた", () => {
    expect(formatYmd("2026-09-07T00:05:00.000Z")).toBe("2026/9/7");
    expect(formatHm("2026-09-07T00:05:00.000Z")).toBe("09:05");
    expect(formatYmd("2026-11-30T15:00:00.000Z")).toBe("2026/12/1");
    expect(formatYmd("2026-12-10T03:00:00.000Z")).toBe("2026/12/10");
    expect(formatHm("2026-12-10T03:00:00.000Z")).toBe("12:00");
  });

  it("年の境目（東京の 1 月 1 日 0:00 は UTC の前日 15:00）", () => {
    expect(formatYmd("2025-12-31T14:59:59.999Z")).toBe("2025/12/31");
    expect(formatYmd("2025-12-31T15:00:00.000Z")).toBe("2026/1/1");
    expect(formatHm("2025-12-31T15:00:00.000Z")).toBe("00:00");
  });
});

describe("M7-list-15 formatCalendarDate（入社日・退職日のチップ。時間帯の変換なし）", () => {
  it("YYYY-MM-DD の月日の 0 を落として Y/M/D にする", () => {
    expect(formatCalendarDate("2025-04-01")).toBe("2025/4/1");
    expect(formatCalendarDate("2026-10-31")).toBe("2026/10/31");
    expect(formatCalendarDate("2026-01-10")).toBe("2026/1/10");
  });

  it("時間帯で日付が動かない（実行環境の時間帯（TZ）に左右されない）", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(formatCalendarDate("2026-01-01"), tz).toBe("2026/1/1");
        expect(formatCalendarDate("2025-12-31"), tz).toBe("2025/12/31");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("M7-list-15 formatUsageLogDateTime（利用履歴の回答日時）", () => {
  it("年 4 けた、月は 0 で埋めない、日・時・分は 2 けた", () => {
    expect(formatUsageLogDateTime("2026-09-07T00:05:00.000Z")).toBe("2026/9/07 09:05");
    expect(formatUsageLogDateTime("2026-11-30T15:00:00.000Z")).toBe("2026/12/01 00:00");
    expect(formatUsageLogDateTime("2026-10-14T14:59:00.000Z")).toBe("2026/10/14 23:59");
  });
});

describe("M7-zaiseki-21 formatDateSlashPadded（組織内分類の受験日。Asia/Tokyo）", () => {
  it("UTC 15:00 以降が翌日になる", () => {
    expect(formatDateSlashPadded("2026-09-06T15:00:00.000Z")).toBe("2026/09/07");
    expect(formatDateSlashPadded("2026-09-06T14:59:59.999Z")).toBe("2026/09/06");
  });

  it("年 4 けた、月日を 0 で埋める", () => {
    expect(formatDateSlashPadded("2026-01-04T03:00:00.000Z")).toBe("2026/01/04");
    expect(formatDateSlashPadded("2026-11-30T15:00:00.000Z")).toBe("2026/12/01");
    expect(formatDateSlashPadded("2025-12-31T15:00:00.000Z")).toBe("2026/01/01");
    expect(formatDateSlashPadded("2026-10-14T14:59:00.000Z")).toBe("2026/10/14");
  });
});

describe("Asia/Tokyo の整形は実行環境の時間帯（TZ）に左右されない", () => {
  it("formatYmd・formatHm・formatUsageLogDateTime・formatDateSlashPadded", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(formatYmd("2026-09-06T15:00:00Z"), tz).toBe("2026/9/7");
        expect(formatHm("2026-09-06T15:00:00Z"), tz).toBe("00:00");
        expect(formatUsageLogDateTime("2026-09-07T00:05:00.000Z"), tz).toBe("2026/9/07 09:05");
        expect(formatDateSlashPadded("2026-09-06T15:00:00.000Z"), tz).toBe("2026/09/07");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
