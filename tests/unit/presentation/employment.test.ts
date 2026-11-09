// M7-list-18 のうち isValidCalendarDate（11-2 §3.1・§5.1。lib/presentation/employment.ts）。
// calendarDateSchema が同じ判定になることは tests/unit/db/schemas.test.ts。updatePersonInputSchema の分は回答一覧の API の PR
import { describe, expect, it } from "vitest";

import { isValidCalendarDate } from "@/lib/presentation/employment";

describe("M7-list-18 isValidCalendarDate", () => {
  it.each(["1900-01-01", "2100-12-31", "2024-02-29", "2026-11-09", "2000-02-29"])(
    "%s は真（範囲の両端・うるう日）",
    (s) => {
      expect(isValidCalendarDate(s)).toBe(true);
    },
  );

  it.each(["1899-12-31", "2101-01-01", "2026-02-30", "2025-02-29", "1900-02-29", "2026-04-31"])(
    "%s は偽（範囲の外・実在しない日）",
    (s) => {
      expect(isValidCalendarDate(s)).toBe(false);
    },
  );

  it.each([
    "",
    "2026-1-01",
    "2026-01-1",
    "20260101",
    "2026/01/01",
    "2026-00-10",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00",
    "２０２６-０１-０１",
  ])("形の違う値・空（%j）は偽", (s) => {
    expect(isValidCalendarDate(s)).toBe(false);
  });
});
