// I-33 POST /auth/invite（招待リンクによる管理者追加。04 §6.3、02 §9.7・D02-39・D02-40）
import { beforeAll, describe, expect, it } from "vitest";

import { POST as postInvite } from "@/app/auth/invite/route";
import { GET as getMe } from "@/app/api/v1/admin/me/route";
import { rotateInviteToken } from "@/lib/db/repositories/organizations-repository";
import { adminAuth } from "@/lib/firebase/admin";

import {
  createOrganizationWithOwner,
  loginAs,
  TEST_PASSWORD,
  uniqueEmail,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

const invite = (body: Record<string, unknown>) =>
  callRoute(postInvite, { method: "POST", url: "/auth/invite", body });

let org: TestOrganization;

beforeAll(async () => {
  ({ org } = await createOrganizationWithOwner("招待テスト歯科"));
});

describe("I-33 POST /auth/invite", () => {
  it("無効なトークン（形式は正しいが存在しない）は 404 INVITE_TOKEN_INVALID、形式不正は 422", async () => {
    const res = await invite({
      inviteToken: "A".repeat(43),
      name: "テスト",
      email: uniqueEmail("x"),
    });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("INVITE_TOKEN_INVALID");
    const bad = await invite({ inviteToken: "short", name: "テスト", email: uniqueEmail("x") });
    expect(bad.status).toBe(422);
  });

  it("有効なトークンで Auth ユーザー・クレーム・adminUsers・admin.signup ができ、応答にパスワードを含めない", async () => {
    const email = uniqueEmail("invited");
    const res = await invite({ inviteToken: org.inviteToken, name: "テスト 招待", email });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/password/i);
    expect(JSON.parse(text)).toEqual({
      organizationName: "招待テスト歯科",
      email,
      nextUrl: "/admin/login",
    });

    const user = await adminAuth().getUserByEmail(email);
    expect(user.emailVerified).toBe(true);
    expect(user.providerData.map((p) => p.providerId)).toContain("password");
    expect(user.customClaims).toEqual({ organizationId: org.organizationId, role: "admin" });
    const doc = await getDocForTest("adminUsers", user.uid);
    expect(doc).toMatchObject({
      organizationId: org.organizationId,
      role: "admin",
      displayName: "テスト 招待",
      isSuspended: false,
      deletedAt: null,
    });
    expect(
      await countDocs("auditLogs", [
        ["action", "==", "admin.signup"],
        ["targetId", "==", user.uid],
      ]),
    ).toBe(1);

    // 同じメールで 2 回目は 409。文書・監査ログは増えない
    const again = await invite({ inviteToken: org.inviteToken, name: "テスト 招待", email });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("EMAIL_ALREADY_REGISTERED");
    expect(
      await countDocs("auditLogs", [
        ["action", "==", "admin.signup"],
        ["targetId", "==", user.uid],
      ]),
    ).toBe(1);

    // パスワード再設定の代わりに Admin SDK で設定してログインできる
    await adminAuth().updateUser(user.uid, { password: TEST_PASSWORD });
    const cookieHeader = await loginAs(email);
    const me = await callRoute(getMe, { method: "GET", url: "/api/v1/admin/me", cookieHeader });
    expect(me.status).toBe(200);
  });

  it("トークンは使い回せる（別のメールで 2 人目も追加できる）", async () => {
    const res = await invite({
      inviteToken: org.inviteToken,
      name: "二人目",
      email: uniqueEmail("second"),
    });
    expect(res.status).toBe(200);
  });

  it("途中失敗の回復: Auth ユーザーだけがある状態から同じメールで要求すると 200 でクレーム・文書が補完される", async () => {
    const email = uniqueEmail("partial");
    const partial = await adminAuth().createUser({
      email,
      emailVerified: true,
      password: TEST_PASSWORD,
    });
    const res = await invite({ inviteToken: org.inviteToken, name: "回復 太郎", email });
    expect(res.status).toBe(200);
    const user = await adminAuth().getUser(partial.uid);
    expect(user.customClaims).toEqual({ organizationId: org.organizationId, role: "admin" });
    expect(await getDocForTest("adminUsers", partial.uid)).toMatchObject({
      role: "admin",
      displayName: "回復 太郎",
    });
    // 回復後の再要求は 409（クレームと文書がそろったため回復対象外）
    const again = await invite({ inviteToken: org.inviteToken, name: "回復 太郎", email });
    expect(again.status).toBe(409);
  });

  it("別組織のクレームを持つ既存ユーザーのメールは回復せず 409", async () => {
    const { owner } = await createOrganizationWithOwner("他院");
    const res = await invite({ inviteToken: org.inviteToken, name: "横取り", email: owner.email });
    expect(res.status).toBe(409);
    const user = await adminAuth().getUser(owner.uid);
    expect(user.customClaims?.role).toBe("owner");
    expect(user.customClaims?.organizationId).not.toBe(org.organizationId);
  });

  it("再発行後は旧トークンが 404、新トークンが有効", async () => {
    const { org: org2 } = await createOrganizationWithOwner("再発行歯科");
    const rotated = await rotateInviteToken({
      organizationId: org2.organizationId,
      actor: { kind: "system" },
      meta: null,
    });
    const old = await invite({
      inviteToken: org2.inviteToken,
      name: "旧",
      email: uniqueEmail("old"),
    });
    expect(old.status).toBe(404);
    const fresh = await invite({
      inviteToken: rotated.inviteToken,
      name: "新",
      email: uniqueEmail("new"),
    });
    expect(fresh.status).toBe(200);
  });
});
