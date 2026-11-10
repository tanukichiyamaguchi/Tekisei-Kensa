// M7-exam-11 受験のときの区分（11-1 §3.5・§5.1、11-2 §3.1、K-28）と、M7-list-20 のうち役職と受検者区分の対応の分
// （11-2 §3.2・§5.1、K-39 Q-02。effectiveStaffRole の分は回答一覧の画面の PR）
import { describe, expect, it } from "vitest";

import { initialEmploymentStatus, respondentKindForStaffRole } from "@/lib/db/employment-status";

describe("M7-exam-11 initialEmploymentStatus", () => {
  it("applicant → candidate（求職者）、executive → employed（在籍）", () => {
    expect(initialEmploymentStatus("applicant")).toBe("candidate");
    expect(initialEmploymentStatus("executive")).toBe("employed");
  });
});

describe("M7-list-20 respondentKindForStaffRole", () => {
  it("責任者・幹部 → executive（既存スタッフ）、スタッフ → applicant", () => {
    expect(respondentKindForStaffRole("manager")).toBe("executive");
    expect(respondentKindForStaffRole("leader")).toBe("executive");
    expect(respondentKindForStaffRole("staff")).toBe("applicant");
  });
});
