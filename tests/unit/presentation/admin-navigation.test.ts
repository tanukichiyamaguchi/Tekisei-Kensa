// 管理画面の URL・日時・入力エラーの純関数（06 §1.3、§3.4.3、§10.3）
import { describe, expect, it } from "vitest";

import {
  hasResultFilters,
  loginPath,
  pageCount,
  resultListHref,
  safeNextPath,
} from "@/lib/presentation/admin-navigation";
import { fieldErrorsFrom, passwordProblem } from "@/lib/presentation/form-errors";
import { formatDateTime } from "@/lib/presentation/format-datetime";

describe("safeNextPath（オープンリダイレクト防止）", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/results/abc?scope=organization", "/admin/results/abc?scope=organization"],
    ["/admin/account", "/admin/account"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["https://evil.example.com/admin"],
    ["//evil.example.com/admin"],
    ["/admin\\@evil.example.com"],
    ["/administrator"],
    ["/exam"],
    ["/admin/login"],
    ["/admin/login?next=/admin"],
    ["/admin/signup?q=x"],
    ["/admin/password-reset"],
  ])("%s → /admin", (input) => {
    expect(safeNextPath(input)).toBe("/admin");
  });

  it("loginPath は next をエンコードする", () => {
    expect(loginPath("/admin?q=a b")).toBe("/admin/login?next=%2Fadmin%3Fq%3Da%20b");
    expect(loginPath()).toBe("/admin/login");
  });
});

describe("resultListHref（既定値は URL に出さない）", () => {
  it("既定値だけなら /admin", () => {
    expect(resultListHref({})).toBe("/admin");
    expect(resultListHref({ sort: "submittedAt", order: "desc", page: 1, pageSize: 50 })).toBe(
      "/admin",
    );
  });

  it("検索・区分・チーム・並び替え・ページを URL に反映する", () => {
    expect(
      resultListHref({
        q: "山田",
        kind: "executive",
        teamCode: "none",
        sort: "name",
        order: "asc",
        page: 3,
        pageSize: 100,
      }),
    ).toBe(
      "/admin?q=%E5%B1%B1%E7%94%B0&kind=executive&teamCode=none&sort=name&order=asc&page=3&pageSize=100",
    );
    expect(resultListHref({ sort: "submittedAt", order: "asc" })).toBe(
      "/admin?sort=submittedAt&order=asc",
    );
  });

  it("hasResultFilters・pageCount", () => {
    expect(hasResultFilters({})).toBe(false);
    expect(hasResultFilters({ teamCode: "A" })).toBe(true);
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });
});

describe("formatDateTime（Asia/Tokyo の YYYY/MM/DD HH:mm）", () => {
  it("UTC を日本時間に変換する（日付をまたぐ場合を含む）", () => {
    expect(formatDateTime("2026-09-17T01:30:00.000Z")).toBe("2026/09/17 10:30");
    expect(formatDateTime("2026-09-17T15:05:00.000Z")).toBe("2026/09/18 00:05");
    expect(formatDateTime("2026-12-31T14:59:00.000Z")).toBe("2026/12/31 23:59");
  });
});

describe("入力エラーの整形", () => {
  it("fieldErrorsFrom は details.issues の path の先頭を欄名にし、最初の文言を採る", () => {
    expect(
      fieldErrorsFrom({
        issues: [
          { path: "email", message: "形式が正しくありません" },
          { path: "email", message: "2 つ目" },
          { path: "answers[3].choiceCode", message: "選択肢" },
          { path: 1, message: "無視" },
        ],
      }),
    ).toEqual({ email: "形式が正しくありません", answers: "選択肢" });
    expect(fieldErrorsFrom({})).toEqual({});
  });

  it("passwordProblem は 8〜72 文字・英字と数字", () => {
    expect(passwordProblem("abc12345")).toBeNull();
    expect(passwordProblem("abc1234")).toMatch(/8 文字以上/);
    expect(passwordProblem(`a1${"x".repeat(71)}`)).toMatch(/72 文字以内/);
    expect(passwordProblem("abcdefgh")).toMatch(/英字と数字/);
    expect(passwordProblem("12345678")).toMatch(/英字と数字/);
  });
});
