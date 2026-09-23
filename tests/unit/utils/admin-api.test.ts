// lib/utils/admin-api.ts の adminFetch（06 §10.4）: 401 → ログイン、403（停止・未登録）→ 再読み込み、その他 → AdminApiError
import { describe, expect, it, vi } from "vitest";

import { AdminApiError, adminFetch } from "@/lib/utils/admin-api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const errorBody = (code: string, message = "エラー", details = {}) => ({
  error: { code, message, details },
});

function setup(res: Response | Error) {
  const navigate = { toLogin: vi.fn(), reload: vi.fn() };
  const fetchImpl = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  return { navigate, fetchImpl };
}

describe("adminFetch", () => {
  it("200 は本文を返し、本文ありの要求は JSON で送る", async () => {
    const { navigate, fetchImpl } = setup(jsonResponse(200, { ok: 1 }));
    await expect(
      adminFetch("/api/v1/admin/x", { method: "PATCH", body: { a: 1 }, fetchImpl, navigate }),
    ).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/admin/x",
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        body: '{"a":1}',
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("204 は undefined", async () => {
    const { navigate, fetchImpl } = setup(new Response(null, { status: 204 }));
    await expect(
      adminFetch("/x", { method: "DELETE", fetchImpl, navigate }),
    ).resolves.toBeUndefined();
  });

  it("401 UNAUTHENTICATED はログイン画面へ移り、AdminApiError を投げる", async () => {
    const { navigate, fetchImpl } = setup(jsonResponse(401, errorBody("UNAUTHENTICATED")));
    await expect(adminFetch("/x", { method: "GET", fetchImpl, navigate })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(navigate.toLogin).toHaveBeenCalledTimes(1);
    expect(navigate.reload).not.toHaveBeenCalled();
  });

  it.each(["ADMIN_SUSPENDED", "ADMIN_NOT_REGISTERED"])("403 %s は再読み込み", async (code) => {
    const { navigate, fetchImpl } = setup(jsonResponse(403, errorBody(code)));
    await expect(adminFetch("/x", { method: "GET", fetchImpl, navigate })).rejects.toBeInstanceOf(
      AdminApiError,
    );
    expect(navigate.reload).toHaveBeenCalledTimes(1);
  });

  it("403 ROLE_REQUIRED は遷移せず AdminApiError（message・details を保つ）", async () => {
    const { navigate, fetchImpl } = setup(
      jsonResponse(403, errorBody("ROLE_REQUIRED", "権限がありません", { a: 1 })),
    );
    await expect(adminFetch("/x", { method: "POST", fetchImpl, navigate })).rejects.toMatchObject({
      status: 403,
      code: "ROLE_REQUIRED",
      message: "権限がありません",
      details: { a: 1 },
    });
    expect(navigate.reload).not.toHaveBeenCalled();
    expect(navigate.toLogin).not.toHaveBeenCalled();
  });

  it("handleSession: false なら 401・403 でも遷移しない（認証系 API）", async () => {
    const { navigate, fetchImpl } = setup(jsonResponse(403, errorBody("ADMIN_SUSPENDED")));
    await expect(
      adminFetch("/x", { method: "POST", fetchImpl, navigate, handleSession: false }),
    ).rejects.toMatchObject({ code: "ADMIN_SUSPENDED" });
    expect(navigate.reload).not.toHaveBeenCalled();
  });

  it("JSON でないエラー本文は INTERNAL_ERROR", async () => {
    const { navigate, fetchImpl } = setup(new Response("Bad Gateway", { status: 502 }));
    await expect(adminFetch("/x", { method: "GET", fetchImpl, navigate })).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL_ERROR",
    });
  });

  it("ネットワーク例外は NETWORK_ERROR（T-33 の文言）", async () => {
    const { navigate, fetchImpl } = setup(new TypeError("fetch failed"));
    await expect(adminFetch("/x", { method: "GET", fetchImpl, navigate })).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      message: "通信に失敗しました。ネットワーク接続を確認して再度お試しください",
    });
  });
});
