// M7-list-18 のうち updatePersonInputSchema の分（11-2 §3.6・§5.1。isValidCalendarDate・calendarDateSchema の分は
// presentation/employment.test.ts・db/schemas.test.ts）。退職日 < 入社日 は service の 422 LEFT_BEFORE_HIRED（M7-list-25）
import { describe, expect, it } from "vitest";

import { updatePersonInputSchema } from "@/lib/services/schemas/admin-respondents";

const parse = (body: unknown) => updatePersonInputSchema.safeParse(body);
const issuesOf = (body: unknown) => {
  const result = parse(body);
  return result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("M7-list-18 updatePersonInputSchema", () => {
  it.each<[string, Record<string, unknown>]>([
    ["チーム", { teamCode: "A" }],
    ["チームを未設定に戻す（null。K-32 ⑦）", { teamCode: null }],
    ["除外", { isExcluded: true }],
    ["区分と日付", { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" } }],
    [
      "区分が退職で退職日だけ",
      { employment: { status: "left", hiredOn: null, leftOn: "2026-10-31" } },
    ],
    [
      "区分が退職で入社日だけ",
      { employment: { status: "left", hiredOn: "2025-04-01", leftOn: null } },
    ],
    [
      "区分が在籍で入社日",
      { employment: { status: "employed", hiredOn: "2025-04-01", leftOn: null } },
    ],
    ["役職", { staffRole: "manager" }],
    ["複数の項目", { teamCode: "Z", isExcluded: false, staffRole: "staff" }],
  ])("%s は通る", (_, body) => {
    expect(parse(body).success).toBe(true);
  });

  it("項目なし（{}）は「変更する項目がありません」", () => {
    expect(issuesOf({})).toEqual([{ path: "", message: "変更する項目がありません" }]);
  });

  it("未知のキーは無視する（ほかに項目が無ければ項目なし）", () => {
    expect(updatePersonInputSchema.parse({ teamCode: "A", extra: 1 })).toEqual({ teamCode: "A" });
    expect(parse({ extra: 1 }).success).toBe(false);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["チームが小文字", { teamCode: "a" }, "teamCode"],
    ["チームが 2 文字", { teamCode: "AB" }, "teamCode"],
    ["除外が文字列", { isExcluded: "true" }, "isExcluded"],
    ["役職が決まった値以外", { staffRole: "owner" }, "staffRole"],
    [
      "区分が決まった値以外",
      { employment: { status: "retired", hiredOn: null, leftOn: null } },
      "employment.status",
    ],
    [
      "日付の区切りが「/」",
      { employment: { status: "employed", hiredOn: "2026/01/01", leftOn: null } },
      "employment.hiredOn",
    ],
    [
      "月が 1 桁",
      { employment: { status: "employed", hiredOn: "2026-1-01", leftOn: null } },
      "employment.hiredOn",
    ],
    [
      "実在しない日",
      { employment: { status: "left", hiredOn: null, leftOn: "2026-02-30" } },
      "employment.leftOn",
    ],
    ["3 つ組の欠け", { employment: { status: "employed", hiredOn: null } }, "employment.leftOn"],
  ])("%s は不可", (_, body, path) => {
    expect(issuesOf(body).map((i) => i.path)).toContain(path);
  });

  it("区分が退職でないのに退職日があるのは不可（path は employment.leftOn）", () => {
    for (const status of ["candidate", "employed"]) {
      expect(
        issuesOf({ employment: { status, hiredOn: "2025-04-01", leftOn: "2026-10-31" } }),
      ).toEqual([
        { path: "employment.leftOn", message: "退職日は区分が退職のときだけ入れられます" },
      ]);
    }
  });

  it("退職日 < 入社日はスキーマでは通る（422 LEFT_BEFORE_HIRED は service が返す）", () => {
    expect(
      parse({ employment: { status: "left", hiredOn: "2026-04-01", leftOn: "2025-04-01" } })
        .success,
    ).toBe(true);
  });
});
