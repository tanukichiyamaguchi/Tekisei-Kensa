// M7-exam-11 受験のときの区分（11-1 §3.5・§5.1、11-2 §3.1、K-28）
import { describe, expect, it } from "vitest";

import { initialEmploymentStatus } from "@/lib/db/employment-status";

describe("M7-exam-11 initialEmploymentStatus", () => {
  it("applicant → candidate（求職者）、executive → employed（在籍）", () => {
    expect(initialEmploymentStatus("applicant")).toBe("candidate");
    expect(initialEmploymentStatus("executive")).toBe("employed");
  });
});
