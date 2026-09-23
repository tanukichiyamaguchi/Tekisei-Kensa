// U-02 PDF 印刷トークン（04 §7.2）と、クレーム・乱数トークン・受検者トークン・招待トークンの純関数（02 §9.2、§9.7、§9.10）
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canManageOrganization,
  canViewExecutives,
  parseAdminClaims,
  toCustomClaims,
} from "@/lib/auth/claims";
import {
  hashInviteToken,
  inviteLink,
  isInviteTokenFormat,
  issueInviteToken,
} from "@/lib/auth/invite-token";
import { issuePdfToken, PDF_TOKEN_TTL_SECONDS, verifyPdfToken } from "@/lib/auth/pdf-token";
import { newRandomToken, safeEqualHex, sha256Hex, TOKEN_PATTERN } from "@/lib/auth/random-token";
import {
  extendRespondentToken,
  hashRespondentToken,
  issueRespondentToken,
  respondentCookieOptions,
  RESPONDENT_COOKIE_NAME,
  RESPONDENT_TOKEN_TTL_MS,
} from "@/lib/auth/respondent-token";
import { ApiError } from "@/lib/services/errors";

const SECRET = "unit-test-secret-0123456789abcdef0123456789";
const NOW = new Date("2026-09-23T00:00:00Z");
const payload = {
  resultId: "res1",
  organizationId: "org1",
  adminUid: "uid1",
  role: "owner" as const,
  mode: "full" as const,
  scope: null,
};

function expectNotFound(run: () => unknown) {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(404);
    expect((e as ApiError).code).toBe("NOT_FOUND");
    return;
  }
  throw new Error("例外が投げられませんでした");
}

describe("U-02 PDF 印刷トークン", () => {
  it("発行 → 検証の往復（scope なし・組織・チーム）", () => {
    for (const scope of [
      null,
      { kind: "organization" as const },
      { kind: "team" as const, teamCode: "B" as const },
    ]) {
      const token = issuePdfToken({ ...payload, scope }, NOW, SECRET);
      const verified = verifyPdfToken(token, NOW, SECRET);
      expect(verified).toEqual({
        ...payload,
        scope,
        exp: NOW.getTime() / 1000 + PDF_TOKEN_TTL_SECONDS,
      });
    }
  });

  it("有効期限（120 秒）の経過で 404", () => {
    const token = issuePdfToken(payload, NOW, SECRET);
    expect(() => verifyPdfToken(token, new Date(NOW.getTime() + 119_000), SECRET)).not.toThrow();
    expectNotFound(() => verifyPdfToken(token, new Date(NOW.getTime() + 120_000), SECRET));
  });

  it("署名・本文の改ざん、別の鍵、形式不正で 404", () => {
    const token = issuePdfToken(payload, NOW, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...payload, role: "super_admin", exp: 9_999_999_999 }),
    ).toString("base64url");
    for (const bad of [
      `${body}.${sig}x`,
      `${body}.${sig?.slice(0, -1)}A`,
      `${forged}.${sig}`,
      `${body}`,
      `${body}.${sig}.extra`,
      "",
    ]) {
      expectNotFound(() => verifyPdfToken(bad, NOW, SECRET));
    }
    expectNotFound(() => verifyPdfToken(token, NOW, `${SECRET}-other`));
  });

  it("正しく署名されていてもペイロードが不正なら 404", () => {
    const body = Buffer.from(
      JSON.stringify({ ...payload, mode: "secret", exp: 9_999_999_999 }),
    ).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("base64url");
    expectNotFound(() => verifyPdfToken(`${body}.${sig}`, NOW, SECRET));
  });
});

describe("クレーム（02 §9.2）", () => {
  it("organizationId と 3 値の role だけを受理する", () => {
    expect(parseAdminClaims({ organizationId: "abc123", role: "admin" })).toEqual({
      organizationId: "abc123",
      role: "admin",
    });
    for (const bad of [
      {},
      { organizationId: "abc" },
      { role: "owner" },
      { organizationId: "a/b", role: "owner" },
      { organizationId: "", role: "owner" },
      { organizationId: "a".repeat(129), role: "owner" },
      { organizationId: "abc", role: "manager" },
      { organizationId: 1, role: "owner" },
    ]) {
      expect(parseAdminClaims(bad)).toBeNull();
    }
  });
  it("幹部の閲覧・組織管理は owner と super_admin のみ", () => {
    expect([
      canViewExecutives("owner"),
      canViewExecutives("super_admin"),
      canViewExecutives("admin"),
    ]).toEqual([true, true, false]);
    expect([
      canManageOrganization("owner"),
      canManageOrganization("super_admin"),
      canManageOrganization("admin"),
    ]).toEqual([true, true, false]);
  });
  it("toCustomClaims は 2 キーだけを返す（余分なキーを載せない）", () => {
    expect(toCustomClaims({ organizationId: "o", role: "owner", extra: 1 } as never)).toEqual({
      organizationId: "o",
      role: "owner",
    });
  });
});

describe("乱数トークン（受検者・招待）", () => {
  it("32 バイトの base64url（43 文字）で毎回異なる", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newRandomToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(TOKEN_PATTERN);
  });
  it("SHA-256 hex と定数時間比較", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(safeEqualHex("ab", "ab")).toBe(true);
    expect(safeEqualHex("ab", "ac")).toBe(false);
    expect(safeEqualHex("ab", "abc")).toBe(false);
  });
  it("受検者トークン: 7 日の期限、ハッシュのみ保存、Cookie 属性", () => {
    const issued = issueRespondentToken(NOW);
    expect(issued.expiresAt.getTime() - NOW.getTime()).toBe(RESPONDENT_TOKEN_TTL_MS);
    expect(issued.tokenHash).toBe(hashRespondentToken(issued.token));
    expect(extendRespondentToken(NOW).getTime() - NOW.getTime()).toBe(RESPONDENT_TOKEN_TTL_MS);
    const cookie = respondentCookieOptions(issued.expiresAt, false);
    expect(cookie).toMatchObject({
      name: RESPONDENT_COOKIE_NAME,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(respondentCookieOptions(issued.expiresAt, true).secure).toBe(false);
  });
  it("招待トークンとリンク", () => {
    const invite = issueInviteToken();
    expect(isInviteTokenFormat(invite.token)).toBe(true);
    expect(isInviteTokenFormat("short")).toBe(false);
    expect(invite.tokenHash).toBe(hashInviteToken(invite.token));
    expect(inviteLink("https://example.com/", invite.token)).toBe(
      `https://example.com/admin/signup?q=${invite.token}`,
    );
  });
});
