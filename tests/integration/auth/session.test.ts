// I-38（POST/DELETE /auth/session、login-events）と I-02（認可 (1) Cookie 検証）。08 §3.3、04 §6.1・§6.2・§2.5.1
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as getMe } from "@/app/api/v1/admin/me/route";
import { POST as postLoginEvent } from "@/app/api/v1/admin/me/login-events/route";
import { DELETE as deleteSession, POST as postSession } from "@/app/auth/session/route";
import { setAdminSuspended } from "@/lib/auth/admin-accounts";
import {
  createAdminSessionCookie,
  revokeAdminSessions,
  SESSION_COOKIE_MAX_AGE_MS,
} from "@/lib/auth/session-cookie";

import { signInWithPassword, waitForNextSecond } from "../helpers/emulator";
import {
  createOrganizationWithOwner,
  loginAs,
  TEST_PASSWORD,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs } from "../helpers/firestore";
import {
  callRoute,
  cookieHeaderFrom,
  decodeJwtPayload,
  errorCode,
  setCookieLine,
} from "../helpers/routes";

const DAY_MS = 24 * 60 * 60 * 1000;

const callMe = (cookieHeader?: string) =>
  callRoute(getMe, {
    method: "GET",
    url: "/api/v1/admin/me",
    ...(cookieHeader ? { cookieHeader } : {}),
  });

let org: TestOrganization;
let owner: TestAdmin;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("認証テスト歯科"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("I-38 POST /auth/session", () => {
  it("(a) auth_time が 5 分より前の ID トークンは 401 ID_TOKEN_INVALID", async () => {
    const idToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    // auth_time は Unix 秒（09 §6.4 の 23）
    expect(typeof decodeJwtPayload(idToken).auth_time).toBe("number");
    // 時計を 6 分進める（ID トークンの exp は 1 時間後のため期限切れにはならない）
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const res = await callRoute(postSession, {
      method: "POST",
      url: "/auth/session",
      body: { idToken },
    });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("ID_TOKEN_INVALID");
    expect(setCookieLine(res, "admin_session")).toBeNull();
  });

  it("(b) 無効な ID トークンは 401 ID_TOKEN_INVALID", async () => {
    const valid = await signInWithPassword(owner.email, TEST_PASSWORD);
    const [header, payload, signature] = valid.split(".");
    for (const idToken of [
      "not-a-jwt",
      "a.b.c",
      `${header}.${payload?.slice(0, -4)}.${signature}`, // ペイロードが JSON として壊れている
      `${header}.${payload}.${signature}AAAA`, // Emulator のトークンは無署名。署名部を付けると拒否される
    ]) {
      const res = await callRoute(postSession, {
        method: "POST",
        url: "/auth/session",
        body: { idToken },
      });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("ID_TOKEN_INVALID");
    }
  });

  it("本文の形式不正は 422、Content-Type 不正は 415", async () => {
    const r1 = await callRoute(postSession, { method: "POST", url: "/auth/session", body: {} });
    expect(r1.status).toBe(422);
    const r2 = await callRoute(postSession, {
      method: "POST",
      url: "/auth/session",
      rawBody: "idToken=x",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(r2.status).toBe(415);
  });

  it("(c) 有効な ID トークン → 200 + Cookie（7 日）→ GET /me 200 → DELETE 204 → 旧 Cookie は 401", async () => {
    const before = Date.now();
    const idToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    const res = await callRoute(postSession, {
      method: "POST",
      url: "/auth/session",
      body: { idToken },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expiresAt: string };
    const expiresAt = new Date(body.expiresAt).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(7 * DAY_MS);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);

    const line = setCookieLine(res, "admin_session");
    expect(line).not.toBeNull();
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=lax/i);
    expect(line).toMatch(/Path=\//);
    expect(line).not.toMatch(/Secure/i); // http://localhost（ローカル）のみ Secure を外す
    const cookieHeader = cookieHeaderFrom(res, "admin_session");
    expect(cookieHeader).not.toBeNull();

    // セッション Cookie の有効期間が 7 日（09 §6.4 の 4）
    const cookieValue = cookieHeader!.slice("admin_session=".length);
    const payload = decodeJwtPayload(cookieValue);
    expect((payload.exp as number) - (payload.iat as number)).toBe(
      SESSION_COOKIE_MAX_AGE_MS / 1000,
    );

    // Cookie に email クレームが入る（09 §6.4 の 24）
    const me = await callMe(cookieHeader!);
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      email: string;
      role: string;
      organization: { organizationId: string };
    };
    expect(meBody.email).toBe(owner.email);
    expect(meBody.role).toBe("owner");
    expect(meBody.organization.organizationId).toBe(org.organizationId);

    // POST /auth/session は admin.login を書かない（D04-24）
    expect(await countDocs("auditLogs", [["action", "==", "admin.login"]])).toBe(0);

    await waitForNextSecond();
    const del = await callRoute(deleteSession, {
      method: "DELETE",
      url: "/auth/session",
      cookieHeader: cookieHeader!,
    });
    expect(del.status).toBe(204);
    const cleared = setCookieLine(del, "admin_session");
    expect(cleared).toMatch(/^admin_session=;/);
    expect(cleared).toMatch(/Max-Age=0/i);

    const after = await callMe(cookieHeader!);
    expect(after.status).toBe(401);
    expect(await errorCode(after)).toBe("UNAUTHENTICATED");
  });

  it("DELETE /auth/session は Cookie なし・不正 Cookie でも 204", async () => {
    const r1 = await callRoute(deleteSession, { method: "DELETE", url: "/auth/session" });
    expect(r1.status).toBe(204);
    const r2 = await callRoute(deleteSession, {
      method: "DELETE",
      url: "/auth/session",
      cookieHeader: "admin_session=garbage",
    });
    expect(r2.status).toBe(204);
  });

  it("POST /admin/me/login-events は呼ぶたびに admin.login を 1 件書く", async () => {
    const cookieHeader = await loginAs(owner.email);
    for (let i = 1; i <= 2; i += 1) {
      const res = await callRoute(postLoginEvent, {
        method: "POST",
        url: "/api/v1/admin/me/login-events",
        cookieHeader,
      });
      expect(res.status).toBe(204);
      expect(await countDocs("auditLogs", [["action", "==", "admin.login"]])).toBe(i);
    }
    const unauth = await callRoute(postLoginEvent, {
      method: "POST",
      url: "/api/v1/admin/me/login-events",
    });
    expect(unauth.status).toBe(401);
    expect(await countDocs("auditLogs", [["action", "==", "admin.login"]])).toBe(2);
  });
});

describe("I-02 認可 (1) Cookie 検証", () => {
  async function expectUnauthenticated(cookieHeader?: string) {
    const res = await callMe(cookieHeader);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  }

  it("(a) Cookie なし", async () => {
    await expectUnauthenticated();
  });

  it("(b) 改ざんした Cookie（署名部・ペイロード部・形式）", async () => {
    const cookieHeader = await loginAs(owner.email);
    const value = cookieHeader.slice("admin_session=".length);
    const [header, payload, signature] = value.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...decodeJwtPayload(value), role: "super_admin", organizationId: "other" }),
    ).toString("base64url");
    for (const tampered of [
      `${header}.${payload}.${signature}AAAA`,
      `${header}.${forgedPayload}.AAAA`,
      `${header}.${payload?.slice(0, -4)}.${signature}`,
      "garbage",
    ]) {
      await expectUnauthenticated(`admin_session=${tampered}`);
    }
    // 元の Cookie は有効なまま
    expect((await callMe(cookieHeader)).status).toBe(200);
  });

  it("(c) 有効期限切れの Cookie（時計を 7 日 + 1 分進める）", async () => {
    const cookieHeader = await loginAs(owner.email);
    expect((await callMe(cookieHeader)).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + SESSION_COOKIE_MAX_AGE_MS + 60 * 1000);
    await expectUnauthenticated(cookieHeader);
  });

  it("(d) revokeRefreshTokens 後の Cookie → 401、ログインし直すと 200", async () => {
    const cookieHeader = await loginAs(owner.email);
    expect((await callMe(cookieHeader)).status).toBe(200);
    await waitForNextSecond();
    await revokeAdminSessions(owner.uid);
    await expectUnauthenticated(cookieHeader);
    const again = await loginAs(owner.email);
    expect((await callMe(again)).status).toBe(200);
  });

  it("(e) 利用停止（Auth の disabled + 失効）後の Cookie → 401、ログインもできない。解除後にログインし直すと 200", async () => {
    const cookieHeader = await loginAs(owner.email);
    await waitForNextSecond();
    await setAdminSuspended({ uid: owner.uid, isSuspended: true });
    await expectUnauthenticated(cookieHeader);
    await expect(signInWithPassword(owner.email, TEST_PASSWORD)).rejects.toThrow(/USER_DISABLED/);
    expect(await countDocs("auditLogs", [["action", "==", "admin.suspend"]])).toBe(1);

    await setAdminSuspended({ uid: owner.uid, isSuspended: false });
    await expectUnauthenticated(cookieHeader); // 停止前の Cookie は失効したまま
    const again = await loginAs(owner.email);
    expect((await callMe(again)).status).toBe(200);
  });

  it("Auth の disabled だけを立てた場合（失効なし）も verifySessionCookie(cookie, true) が拒否する（09 §6.4 の 6）", async () => {
    const { owner: other } = await createOrganizationWithOwner("停止確認歯科");
    const { adminAuth } = await import("@/lib/firebase/admin");
    await adminAuth().updateUser(other.uid, { disabled: true });
    await expectUnauthenticated(other.cookieHeader);
    await adminAuth().updateUser(other.uid, { disabled: false });
  });

  it("createAdminSessionCookie は 7 日で発行できる（04 D04-53）", async () => {
    const idToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    const now = new Date();
    const issued = await createAdminSessionCookie(idToken, now);
    expect(issued.uid).toBe(owner.uid);
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(SESSION_COOKIE_MAX_AGE_MS);
  });
});
