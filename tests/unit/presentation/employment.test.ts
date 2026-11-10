// lib/presentation/employment.ts（11-2 §2.3・§2.13・§2.14・§3.1・§3.11・§5.1）。M7-list-12 employmentFromMenu、
// M7-list-13 employmentFromDates、M7-list-18 のうち isValidCalendarDate（calendarDateSchema が同じ判定になることは
// tests/unit/db/schemas.test.ts、updatePersonInputSchema の分は tests/unit/services/admin-respondents-schemas.test.ts）、
// M7-list-20 のうち effectiveStaffRole（役職と受検者区分の対応の分は tests/unit/db/employment-status.test.ts）と、todayInTokyo
import { describe, expect, it } from "vitest";

import {
  effectiveStaffRole,
  EMPLOYMENT_STATUS_LABELS,
  employmentFromDates,
  employmentFromMenu,
  isValidCalendarDate,
  STAFF_ROLE_LABELS,
  todayInTokyo,
  type Employment,
} from "@/lib/presentation/employment";

const TODAY = "2026-11-10";

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

describe("M7-list-12 employmentFromMenu（区分メニュー。11-2 §2.13）", () => {
  const candidate: Employment = { status: "candidate", hiredOn: "2025-04-01", leftOn: null };
  const employed: Employment = { status: "employed", hiredOn: null, leftOn: null };
  const left: Employment = { status: "left", hiredOn: "2024-04-01", leftOn: "2026-03-31" };

  it("今と同じ区分を選んだら null（何もしない）", () => {
    expect(employmentFromMenu(candidate, "candidate", TODAY)).toBeNull();
    expect(employmentFromMenu(employed, "employed", TODAY)).toBeNull();
    expect(employmentFromMenu(left, "left", TODAY)).toBeNull();
  });

  it("退職にすると、入社日を保ち、退職日は今の値が無ければ今日（todayIso）", () => {
    expect(employmentFromMenu(candidate, "left", TODAY)).toEqual({
      status: "left",
      hiredOn: "2025-04-01",
      leftOn: TODAY,
    });
    expect(employmentFromMenu(employed, "left", TODAY)).toEqual({
      status: "left",
      hiredOn: null,
      leftOn: TODAY,
    });
  });

  it("退職にするとき、今の退職日があればそれを保つ", () => {
    const employedWithLeftOn: Employment = {
      status: "employed",
      hiredOn: "2024-04-01",
      leftOn: "2026-10-31",
    };
    expect(employmentFromMenu(employedWithLeftOn, "left", TODAY)).toEqual({
      status: "left",
      hiredOn: "2024-04-01",
      leftOn: "2026-10-31",
    });
  });

  it("求職者・在籍にすると、退職日を空にし、入社日は保つ", () => {
    expect(employmentFromMenu(left, "employed", TODAY)).toEqual({
      status: "employed",
      hiredOn: "2024-04-01",
      leftOn: null,
    });
    expect(employmentFromMenu(left, "candidate", TODAY)).toEqual({
      status: "candidate",
      hiredOn: "2024-04-01",
      leftOn: null,
    });
    expect(employmentFromMenu(candidate, "employed", TODAY)).toEqual({
      status: "employed",
      hiredOn: "2025-04-01",
      leftOn: null,
    });
    expect(employmentFromMenu(employed, "candidate", TODAY)).toEqual({
      status: "candidate",
      hiredOn: null,
      leftOn: null,
    });
  });

  it("渡した値を変えない", () => {
    const current: Employment = { status: "employed", hiredOn: "2024-04-01", leftOn: null };
    employmentFromMenu(current, "left", TODAY);
    expect(current).toEqual({ status: "employed", hiredOn: "2024-04-01", leftOn: null });
  });
});

describe("M7-list-13 employmentFromDates（入社日・退職日のダイアログ。11-2 §2.14）", () => {
  const candidate: Employment = { status: "candidate", hiredOn: null, leftOn: null };
  const employed: Employment = { status: "employed", hiredOn: "2024-04-01", leftOn: null };
  const left: Employment = { status: "left", hiredOn: "2024-04-01", leftOn: "2026-03-31" };

  it("両方あり 退職日 < 入社日 は left_before_hired（どの区分でも）", () => {
    for (const current of [candidate, employed, left]) {
      expect(employmentFromDates(current, "2025-04-02", "2025-04-01")).toEqual({
        ok: false,
        reason: "left_before_hired",
      });
    }
    // 年・月の境目も文字列の比較で正しく判定する
    expect(employmentFromDates(employed, "2026-01-01", "2025-12-31")).toEqual({
      ok: false,
      reason: "left_before_hired",
    });
  });

  it("同じ日は可（退職日 = 入社日）で、退職日があるので退職", () => {
    expect(employmentFromDates(candidate, "2025-04-01", "2025-04-01")).toEqual({
      ok: true,
      value: { status: "left", hiredOn: "2025-04-01", leftOn: "2025-04-01" },
    });
  });

  it("退職日があれば退職（入社日が無くても、どの区分からでも）", () => {
    expect(employmentFromDates(candidate, null, "2026-10-31")).toEqual({
      ok: true,
      value: { status: "left", hiredOn: null, leftOn: "2026-10-31" },
    });
    expect(employmentFromDates(employed, "2024-04-01", "2026-10-31")).toEqual({
      ok: true,
      value: { status: "left", hiredOn: "2024-04-01", leftOn: "2026-10-31" },
    });
  });

  it("退職日が無く入社日があり、今の区分が求職者なら在籍", () => {
    expect(employmentFromDates(candidate, "2025-04-01", null)).toEqual({
      ok: true,
      value: { status: "employed", hiredOn: "2025-04-01", leftOn: null },
    });
  });

  it("在籍で入社日だけ → 在籍のまま", () => {
    expect(employmentFromDates(employed, "2025-04-01", null)).toEqual({
      ok: true,
      value: { status: "employed", hiredOn: "2025-04-01", leftOn: null },
    });
  });

  it("退職で退職日を空にしても退職のまま（退職日の無い退職。参照元どおり）", () => {
    expect(employmentFromDates(left, "2024-04-01", null)).toEqual({
      ok: true,
      value: { status: "left", hiredOn: "2024-04-01", leftOn: null },
    });
  });

  it("両方空なら今の区分のまま（求職者・在籍・退職）", () => {
    for (const current of [candidate, employed, left]) {
      expect(employmentFromDates(current, null, null)).toEqual({
        ok: true,
        value: { status: current.status, hiredOn: null, leftOn: null },
      });
    }
  });

  it("値が変わらなくても ok を返す（送って通知を出す）", () => {
    expect(employmentFromDates(employed, "2024-04-01", null)).toEqual({
      ok: true,
      value: employed,
    });
  });
});

describe("M7-list-20 effectiveStaffRole（表示上の役職。11-2 §2.3）", () => {
  it.each(["manager", "leader", "staff"] as const)(
    "保存された役職（%s）が職業より優先する",
    (role) => {
      expect(effectiveStaffRole(role, 1)).toBe(role);
      expect(effectiveStaffRole(role, 10)).toBe(role);
    },
  );

  it("役職が未設定で職業が 10（責任者。K-21）なら manager", () => {
    expect(effectiveStaffRole(null, 10)).toBe("manager");
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "役職が未設定で職業が %i（旧 9 を含む）なら null",
    (code) => {
      expect(effectiveStaffRole(null, code)).toBeNull();
    },
  );
});

describe("区分・役職の表示名（11-2 §2.3）", () => {
  it("区分は求職者・在籍・退職、役職は責任者（参照元: 院長。K-19）・幹部・スタッフ", () => {
    expect(EMPLOYMENT_STATUS_LABELS).toEqual({
      candidate: "求職者",
      employed: "在籍",
      left: "退職",
    });
    expect(STAFF_ROLE_LABELS).toEqual({ manager: "責任者", leader: "幹部", staff: "スタッフ" });
  });
});

describe("todayInTokyo（Asia/Tokyo の暦日。11-2 §2.13）", () => {
  it("UTC 15:00 から翌日になる", () => {
    expect(todayInTokyo(new Date("2026-11-09T14:59:59.999Z"))).toBe("2026-11-09");
    expect(todayInTokyo(new Date("2026-11-09T15:00:00.000Z"))).toBe("2026-11-10");
  });

  it("月と年の境目", () => {
    expect(todayInTokyo(new Date("2026-10-31T14:59:59.999Z"))).toBe("2026-10-31");
    expect(todayInTokyo(new Date("2026-10-31T15:00:00.000Z"))).toBe("2026-11-01");
    expect(todayInTokyo(new Date("2025-12-31T14:59:59.999Z"))).toBe("2025-12-31");
    expect(todayInTokyo(new Date("2025-12-31T15:00:00.000Z"))).toBe("2026-01-01");
    expect(todayInTokyo(new Date("2024-02-28T15:00:00.000Z"))).toBe("2024-02-29");
  });

  it("実行環境の時間帯（TZ）に左右されない", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(todayInTokyo(new Date("2026-11-09T14:59:59.999Z")), tz).toBe("2026-11-09");
        expect(todayInTokyo(new Date("2026-11-09T15:00:00.000Z")), tz).toBe("2026-11-10");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
