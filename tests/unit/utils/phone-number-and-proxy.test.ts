// proxy.ts（Cookie の有無だけによる早期遮断。01 §5.5、04 §8.5）。
// U-03 の電話番号の部分は、登録の検査が電話番号の書式を見なくなったため M7-exam-05・07（registration-rules.test.ts）に置き換えた（11-1 §5.5）
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

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
