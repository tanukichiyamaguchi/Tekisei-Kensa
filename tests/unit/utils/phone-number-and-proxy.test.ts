// U-03 の電話番号部分（04 D04-06、05 D05-16）と proxy.ts（Cookie の有無だけによる早期遮断。01 §5.5、04 §8.5）
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { isValidPhoneNumber, normalizePhoneNumber, PHONE_PATTERN } from "@/lib/utils/phone-number";
import { config, proxy } from "@/proxy";

describe("電話番号の正規化と形式", () => {
  it.each([
    ["０３－１２３４－５６７８", "03-1234-5678"],
    ["+81 3 1234 5678", "+81312345678"],
    [" 090‐1234‐5678 ", "090-1234-5678"],
    ["（03）1234ー5678", "(03)1234-5678"],
    ["＋８１　９０　１２３４　５６７８", "+819012345678"],
  ])("%s → %s（受理）", (input, normalized) => {
    expect(normalizePhoneNumber(input)).toBe(normalized);
    expect(isValidPhoneNumber(normalizePhoneNumber(input))).toBe(true);
  });
  it.each(["1234567", "1".repeat(21), "03-1234-567a", "", "０３－ABCD－５６７８"])(
    "%s は拒否",
    (input) => {
      expect(isValidPhoneNumber(normalizePhoneNumber(input))).toBe(false);
    },
  );
  it("パターンは 8〜20 文字の数字・+・括弧・ハイフン", () => {
    for (const ok of ["12345678", "1".repeat(20), "+(03)-1234"])
      expect(PHONE_PATTERN.test(ok)).toBe(true);
    for (const ng of ["1234567", "1".repeat(21), "03 1234 5678", "03.1234.5678", "03_1234_5678"]) {
      expect(PHONE_PATTERN.test(ng)).toBe(false);
    }
  });
});

describe("proxy.ts", () => {
  const call = (path: string, cookie?: string) =>
    proxy(
      new NextRequest(
        new URL(path, "http://localhost:3000"),
        cookie ? { headers: { cookie } } : {},
      ),
    );

  it("Cookie なしの管理画面はログイン画面へ（next に元のパスとクエリ）", () => {
    const res = call("/admin/results?page=2");
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe("/admin/results?page=2");
  });
  it("Cookie なしの管理者 API は 401 JSON", async () => {
    const res = call("/api/v1/admin/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
  it("Cookie があれば通す（検証は Route Handler が行う）", () => {
    expect(call("/admin/results", "admin_session=anything").headers.get("x-middleware-next")).toBe(
      "1",
    );
    expect(call("/api/v1/admin/me", "admin_session=anything").status).toBe(200);
  });
  it.each(["/admin/login", "/admin/signup", "/admin/password-reset", "/admin/results/abc/print"])(
    "%s は Cookie なしでも通す",
    (path) => {
      expect(call(path).headers.get("x-middleware-next")).toBe("1");
    },
  );
  it.each(["/admin/login/x", "/admin/results/abc/print/x", "/admin/signupx"])(
    "%s は公開パスに一致しない",
    (path) => {
      expect(call(path).status).toBe(307);
    },
  );
  it("matcher は管理画面と管理者 API だけ", () => {
    expect(config.matcher).toEqual(["/admin/:path*", "/api/v1/admin/:path*"]);
  });
});
