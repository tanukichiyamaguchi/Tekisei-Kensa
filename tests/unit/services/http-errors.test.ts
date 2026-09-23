// U-06（入力スキーマ）・U-07（ApiError と handle()）と、Firebase・リポジトリ例外の変換（04 §2.3、§2.4、§2.10、§8.4）
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { metaFromHeaders, readCookie } from "@/lib/auth/request-meta";
import { answersPatchSchema } from "@/lib/db/schemas/assessment-session";
import { RepositoryError } from "@/lib/db/errors";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { API_ERRORS, ApiError } from "@/lib/services/errors";
import { firebaseErrorCode, translateFirebaseError } from "@/lib/services/firebase-errors";
import { formatIssuePath, handle, json, readJson } from "@/lib/services/http";
import { startOfTokyoDay } from "@/lib/services/rate-limit";
import { acceptInviteInputSchema, createSessionInputSchema } from "@/lib/services/schemas/auth";
import {
  comparisonScopeQuerySchema,
  pagingSchema,
  requiredText,
  teamCodeSchema,
} from "@/lib/services/schemas/common";
import { assertVisibleToAdmin } from "@/lib/services/visibility";
import { errorFields, logger } from "@/lib/utils/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

const request = (init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request("http://localhost/api/x", { method: "POST", ...init });

async function bodyOf(res: Response) {
  return (await res.json()) as {
    error: { code: string; message: string; details: Record<string, unknown> };
  };
}

describe("U-07 handle()", () => {
  it("ApiError は status と { error: { code, message, details } }、X-Request-Id と Cache-Control: no-store が付く", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const res = await handle(request(), "/api/x", async () => {
      throw API_ERRORS.rateLimited(600);
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await bodyOf(res)).toEqual({
      error: { code: "RATE_LIMITED", message: expect.any(String) as string, details: {} },
    });
  });

  it("予期しない例外は 500 INTERNAL_ERROR で details が空。例外のメッセージは応答にもログにも出さない", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const res = await handle(request(), "/api/x", async () => {
      throw new Error("secret@example.com を含む内部エラー");
    });
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "サーバ内部でエラーが発生しました",
      details: {},
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret@example.com");
  });

  it("ZodError は 422 VALIDATION_ERROR（issues に path と message）", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const res = await handle(request(), "/api/x", async () => {
      z.object({ a: z.number() }).parse({ a: "x" });
      return json(metaFromHeaders(new Headers()), {});
    });
    expect(res.status).toBe(422);
    const body = await bodyOf(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect((body.error.details.issues as Array<{ path: string }>)[0]?.path).toBe("a");
  });

  it("issues の path は配列の添字を [n] で表す（04 §2.3 の例 answers[3].choiceCode）", () => {
    expect(formatIssuePath(["answers", 3, "choiceCode"])).toBe("answers[3].choiceCode");
    expect(formatIssuePath([0, "a"])).toBe("[0].a");
    expect(formatIssuePath([])).toBe("");
  });

  it("成功時はハンドラの応答をそのまま返す", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const res = await handle(request(), "/api/x", async (meta) =>
      json(meta, { ok: true }, { status: 201 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("readJson", () => {
  it("Content-Type が JSON でなければ 415、構文エラーは 400", async () => {
    await expect(
      readJson(request({ body: "a=1", headers: { "content-type": "text/plain" } }), (v) => v),
    ).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(
      readJson(request({ body: "{", headers: { "content-type": "application/json" } }), (v) => v),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
    await expect(
      readJson(
        request({
          body: '{"a":1}',
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
        (v) => v,
      ),
    ).resolves.toEqual({ a: 1 });
  });
});

describe("Firebase・リポジトリ例外の変換（04 §2.4、§8.4）", () => {
  const fb = (code: string | number) => Object.assign(new Error("x"), { code });
  it.each([
    ["auth/session-cookie-expired", 401, "UNAUTHENTICATED"],
    ["auth/session-cookie-revoked", 401, "UNAUTHENTICATED"],
    ["auth/id-token-expired", 401, "ID_TOKEN_INVALID"],
    ["auth/invalid-id-token", 401, "ID_TOKEN_INVALID"],
    ["auth/user-disabled", 403, "ADMIN_SUSPENDED"],
    ["auth/email-already-exists", 409, "EMAIL_ALREADY_REGISTERED"],
    ["auth/invalid-email", 422, "VALIDATION_ERROR"],
    ["auth/too-many-requests", 429, "RATE_LIMITED"],
    ["auth/internal-error", 500, "INTERNAL_ERROR"],
  ])("%s → %i %s", (code, status, apiCode) => {
    expect(translateFirebaseError(fb(code))).toMatchObject({ status, code: apiCode });
  });
  it.each([
    [10, 503, "SERVICE_UNAVAILABLE"], // aborted（トランザクションの競合）
    [14, 503, "SERVICE_UNAVAILABLE"], // unavailable
    [4, 503, "SERVICE_UNAVAILABLE"], // deadline-exceeded
    [8, 429, "RATE_LIMITED"], // resource-exhausted
    [9, 500, "INTERNAL_ERROR"], // failed-precondition（インデックス不足など）
  ])("gRPC %i → %i %s", (code, status, apiCode) => {
    expect(translateFirebaseError(fb(code))).toMatchObject({ status, code: apiCode });
  });
  it("firebaseErrorCode は文字列・gRPC 番号・なしを扱う", () => {
    expect(firebaseErrorCode(fb("auth/x"))).toBe("auth/x");
    expect(firebaseErrorCode(fb(6))).toBe("already-exists");
    expect(firebaseErrorCode(fb(99))).toBe("99");
    expect(firebaseErrorCode(new Error("x"))).toBeNull();
    expect(firebaseErrorCode(null)).toBeNull();
  });
  it.each([
    ["ORGANIZATION_NOT_FOUND", 404],
    ["RESPONDENT_NOT_FOUND", 404],
    ["RESULT_NOT_FOUND", 404],
    ["SESSION_NOT_FOUND", 404],
    ["SESSION_ALREADY_SUBMITTED", 409],
    ["AI_ALREADY_GENERATING", 409],
    ["INVITE_TOKEN_INVALID", 404],
    ["ADMIN_USER_NOT_FOUND", 403],
    ["ADMIN_USER_SUSPENDED", 403],
    ["AI_ANALYSIS_MISMATCH", 500],
  ] as const)("RepositoryError %s → %i", (code, status) => {
    expect(translateFirebaseError(new RepositoryError(code, "x"))).toMatchObject({ status });
  });
  it("ANSWERS_INCOMPLETE は missing を、VALIDATION_ERROR は paths を issues にして渡す（値は含めない）", () => {
    expect(
      translateFirebaseError(new RepositoryError("ANSWERS_INCOMPLETE", "x", { missing: [2, 3] }))
        .details,
    ).toEqual({ missing: [2, 3] });
    expect(
      translateFirebaseError(
        new RepositoryError("ANSWERS_INCOMPLETE", "x", { missing: [], invalid: [7] }),
      ).details,
    ).toEqual({ missing: [], invalid: [7] });
    const err = (() => {
      try {
        validateForWrite(z.strictObject({ a: z.number() }), { a: "secret-value" }, "x");
      } catch (e) {
        return e as RepositoryError;
      }
      throw new Error("unreachable");
    })();
    const api = translateFirebaseError(err);
    expect(api).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect(JSON.stringify(api.details)).not.toContain("secret-value");
  });
  it("ApiError はそのまま", () => {
    const e = new ApiError(418, "FORBIDDEN", "x");
    expect(translateFirebaseError(e)).toBe(e);
  });
});

describe("U-06 入力スキーマ（M2 時点で存在するもの。受検者・管理者 API のスキーマは M3・M4 で追加）", () => {
  it("回答 1 ページ: 値 1〜5、キー 1〜144、1〜8 問", () => {
    expect(answersPatchSchema.safeParse({ "1": 1, "144": 5 }).success).toBe(true);
    for (const bad of [
      { "1": 6 },
      { "1": 0 },
      { "145": 1 },
      { "0": 1 },
      { "1.5": 1 },
      {},
      { "1": "1" },
    ]) {
      expect(answersPatchSchema.safeParse(bad).success).toBe(false);
    }
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 1]));
    expect(answersPatchSchema.safeParse(nine).success).toBe(false);
  });
  it("teamCode は A〜Z の 1 文字", () => {
    expect(teamCodeSchema.safeParse("A").success).toBe(true);
    for (const bad of ["AA", "a", "", "1"])
      expect(teamCodeSchema.safeParse(bad).success).toBe(false);
  });
  it("比較範囲のクエリを ComparisonScope に変換する", () => {
    expect(comparisonScopeQuerySchema.parse({ scope: "organization" })).toEqual({
      kind: "organization",
    });
    expect(comparisonScopeQuerySchema.parse({ scope: "team", teamCode: "B" })).toEqual({
      kind: "team",
      teamCode: "B",
    });
    expect(comparisonScopeQuerySchema.safeParse({ scope: "team" }).success).toBe(false);
    expect(
      comparisonScopeQuerySchema.safeParse({ scope: "organization", teamCode: "A" }).success,
    ).toBe(false);
    expect(comparisonScopeQuerySchema.safeParse({ scope: "all" }).success).toBe(false);
  });
  it("ページング: 既定値と上限", () => {
    expect(pagingSchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(pagingSchema.parse({ page: "2", pageSize: "200" })).toEqual({ page: 2, pageSize: 200 });
    expect(pagingSchema.safeParse({ pageSize: "201" }).success).toBe(false);
    expect(pagingSchema.safeParse({ page: "0" }).success).toBe(false);
  });
  it("必須文字列: 前後空白を除去し、空白のみ・上限超過（コードポイント単位）を拒否", () => {
    const s = requiredText(3);
    expect(s.parse(" あい ")).toBe("あい");
    expect(s.parse("𠮷𠮷𠮷")).toBe("𠮷𠮷𠮷");
    expect(s.safeParse("   ").success).toBe(false);
    expect(s.safeParse("あいうえ").success).toBe(false);
  });
  it("POST /auth/session と POST /auth/invite", () => {
    expect(createSessionInputSchema.safeParse({ idToken: "x" }).success).toBe(true);
    expect(createSessionInputSchema.safeParse({ idToken: "" }).success).toBe(false);
    const token = "A".repeat(43);
    expect(
      acceptInviteInputSchema.safeParse({
        inviteToken: token,
        name: "山田",
        email: "a@example.com",
      }).success,
    ).toBe(true);
    for (const bad of [
      { inviteToken: "short", name: "山田", email: "a@example.com" },
      { inviteToken: token, name: " ", email: "a@example.com" },
      { inviteToken: token, name: "山田", email: "not-email" },
    ]) {
      expect(acceptInviteInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("認可 (3)（組織一致・論理削除・幹部の可視性）", () => {
  const owner = { organizationId: "org1", canViewExecutives: true };
  const admin = { organizationId: "org1", canViewExecutives: false };
  const notFound = () => API_ERRORS.notFound();
  it("満たせば通り、満たさなければ 404", () => {
    expect(() =>
      assertVisibleToAdmin(
        owner,
        { organizationId: "org1", deletedAt: null, kind: "executive" },
        notFound,
      ),
    ).not.toThrow();
    for (const [ctx, doc] of [
      [owner, null],
      [owner, { organizationId: "org2", deletedAt: null }],
      [owner, { organizationId: "org1", deletedAt: new Date() }],
      [admin, { organizationId: "org1", deletedAt: null, kind: "executive" as const }],
    ] as const) {
      expect(() => assertVisibleToAdmin(ctx, doc, notFound)).toThrow(ApiError);
    }
  });
});

describe("リクエスト付帯情報・Cookie・ログ", () => {
  it("x-forwarded-for の先頭を IP、User-Agent は 500 文字まで、requestId はサーバ採番", () => {
    const meta = metaFromHeaders(
      new Headers({
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        "user-agent": "u".repeat(600),
        "x-request-id": "client",
      }),
    );
    expect(meta.ipAddress).toBe("203.0.113.1");
    expect(meta.userAgent).toHaveLength(500);
    expect(meta.requestId).not.toBe("client");
    expect(metaFromHeaders(new Headers())).toMatchObject({ ipAddress: null, userAgent: null });
  });
  it("readCookie は名前の完全一致で値を取り出す", () => {
    const h = new Headers({ cookie: "x_admin_session=bad; admin_session=abc%3D; other=1" });
    expect(readCookie(h, "admin_session")).toBe("abc=");
    expect(readCookie(h, "missing")).toBeNull();
    expect(readCookie(new Headers({ cookie: "admin_session=" }), "admin_session")).toBeNull();
    expect(
      readCookie(new Headers({ cookie: "admin_session=%E0%A4%A" }), "admin_session"),
    ).toBeNull();
  });
  it("logger は個人情報のキーを伏せ、errorFields は message を出さない", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("x", { email: "a@example.com", name: "山田", requestId: "r1" });
    const line = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({ email: "[redacted]", name: "[redacted]", requestId: "r1" });
    expect(errorFields(Object.assign(new Error("a@example.com"), { code: "auth/x" }))).toEqual({
      errorName: "Error",
      errorCode: "auth/x",
    });
    expect(errorFields("oops")).toEqual({ errorType: "string" });
  });
  it("startOfTokyoDay は Asia/Tokyo の当日 0 時（UTC 15:00 前日）", () => {
    expect(startOfTokyoDay(new Date("2026-09-23T14:59:59Z")).toISOString()).toBe(
      "2026-09-22T15:00:00.000Z",
    );
    expect(startOfTokyoDay(new Date("2026-09-23T15:00:00Z")).toISOString()).toBe(
      "2026-09-23T15:00:00.000Z",
    );
  });
});
