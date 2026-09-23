// I-34 PATCH /admin/me、I-39 GET /admin/me の links と招待リンクの再発行、04 §10 (9) 管理者一覧（04 §5.1・§5.2・§5.11）
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as listAdminUsersRoute } from "@/app/api/v1/admin/admin-users/route";
import { GET as getMeRoute, PATCH as patchMeRoute } from "@/app/api/v1/admin/me/route";
import { POST as rotateInviteRoute } from "@/app/api/v1/admin/organization/invite-token/route";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import type {
  AdminUserListDto,
  InviteRotatedDto,
  MeDto,
  MeUpdatedDto,
} from "@/lib/services/dto/admin";

import { signInWithPassword, waitForNextSecond } from "../helpers/emulator";
import {
  createAdmin,
  createOrganizationWithOwner,
  loginAs,
  TEST_PASSWORD,
  uniqueEmail,
  type TestAdmin,
} from "../helpers/fixtures";
import { getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode, setCookieLine } from "../helpers/routes";

const getMe = (cookieHeader: string) =>
  callRoute(getMeRoute, { method: "GET", url: "/api/v1/admin/me", cookieHeader });

const patchMe = (admin: TestAdmin, body: unknown) =>
  callRoute(patchMeRoute, {
    method: "PATCH",
    url: "/api/v1/admin/me",
    body,
    cookieHeader: admin.cookieHeader,
  });

const accountUpdateLogs = async (uid: string) =>
  (await listDocs(COLLECTIONS.auditLogs)).filter(
    (d) => d.data.action === "account.update" && d.data.actorUid === uid,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("I-34 PATCH /admin/me", () => {
  it("(a) reauthIdToken なしのメール変更・パスワード変更は 422 VALIDATION_ERROR", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 a");
    for (const body of [{ email: uniqueEmail("new") }, { password: "newpass1234" }]) {
      const res = await patchMe(owner, body);
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    }
    expect((await adminAuth().getUser(owner.uid)).email).toBe(owner.email);
  });

  it("(b) 別ユーザーの ID トークンは 422 CURRENT_PASSWORD_MISMATCH", async () => {
    const { org, owner } = await createOrganizationWithOwner("アカウント歯科 b");
    const other = await createAdmin(org, "admin");
    const reauthIdToken = await signInWithPassword(other.email, TEST_PASSWORD);
    const res = await patchMe(owner, { email: uniqueEmail("new"), reauthIdToken });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CURRENT_PASSWORD_MISMATCH");
    expect((await adminAuth().getUser(owner.uid)).email).toBe(owner.email);
  });

  it("(c) auth_time が 5 分より前の ID トークンは 422 CURRENT_PASSWORD_MISMATCH", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 c");
    const reauthIdToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    // 時計を 6 分進める（ID トークンの exp は 1 時間後、セッション Cookie は 7 日のため、どちらも期限切れにはならない）
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const res = await patchMe(owner, { password: "newpass1234", reauthIdToken });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CURRENT_PASSWORD_MISMATCH");
  });

  it("壊れた ID トークンも 422 CURRENT_PASSWORD_MISMATCH（401 にしない）", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 壊れ");
    const res = await patchMe(owner, { password: "newpass1234", reauthIdToken: "a.b.c" });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("CURRENT_PASSWORD_MISMATCH");
  });

  it("(d) 正しい reauthIdToken でメール変更 → 200・reloginRequired・Cookie 削除・旧 Cookie は 401", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 d");
    const newEmail = uniqueEmail("changed");
    const reauthIdToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    await waitForNextSecond();
    const res = await patchMe(owner, { email: newEmail, reauthIdToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeUpdatedDto;
    expect(body.reloginRequired).toBe(true);
    expect(body.email).toBe(newEmail);
    const cookie = setCookieLine(res, "admin_session");
    expect(cookie).not.toBeNull();
    expect(cookie).toMatch(/^admin_session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);

    const stale = await getMe(owner.cookieHeader);
    expect(stale.status).toBe(401);
    expect(await errorCode(stale)).toBe("UNAUTHENTICATED");

    expect((await adminAuth().getUser(owner.uid)).email).toBe(newEmail);
    const doc = await getDocForTest<Record<string, unknown>>(COLLECTIONS.adminUsers, owner.uid);
    expect(doc).not.toHaveProperty("email");
    expect(JSON.stringify(doc)).not.toContain(newEmail);

    // 新しいメールアドレスでログインし直せる
    const relogin = await getMe(await loginAs(newEmail));
    expect(relogin.status).toBe(200);
    expect(((await relogin.json()) as MeDto).email).toBe(newEmail);

    const [log] = await accountUpdateLogs(owner.uid);
    expect(log!.data.details).toEqual({ fields: ["email"] });
    expect(JSON.stringify(log!.data)).not.toContain(newEmail);
  });

  it("(e) 正しい reauthIdToken でパスワード変更 → 200・旧 Cookie は 401・新パスワードでログインできる", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 e");
    const newPassword = "changed-pass-5678";
    const reauthIdToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    await waitForNextSecond();
    const res = await patchMe(owner, { password: newPassword, reauthIdToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeUpdatedDto;
    expect(body.reloginRequired).toBe(true);
    expect(JSON.stringify(body)).not.toContain(newPassword);
    expect(setCookieLine(res, "admin_session")).toMatch(/Max-Age=0/i);
    expect((await getMe(owner.cookieHeader)).status).toBe(401);

    await expect(signInWithPassword(owner.email, TEST_PASSWORD)).rejects.toThrow();
    expect((await getMe(await loginAs(owner.email, newPassword))).status).toBe(200);

    const [log] = await accountUpdateLogs(owner.uid);
    expect(log!.data.details).toEqual({ fields: ["password"] });
    expect(JSON.stringify(log!.data)).not.toContain(newPassword);
  });

  it("(f) name だけの変更は adminUsers.displayName に反映し reloginRequired: false、Cookie はそのまま", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 f");
    const res = await patchMe(owner, { name: "  新しい 氏名  " });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeUpdatedDto;
    expect(body.reloginRequired).toBe(false);
    expect(body.name).toBe("新しい 氏名");
    expect(setCookieLine(res, "admin_session")).toBeNull();
    const doc = await getDocForTest<{ displayName: string }>(COLLECTIONS.adminUsers, owner.uid);
    expect(doc!.displayName).toBe("新しい 氏名");
    expect((await adminAuth().getUser(owner.uid)).displayName).toBe("新しい 氏名");
    expect((await getMe(owner.cookieHeader)).status).toBe(200);
    const [log] = await accountUpdateLogs(owner.uid);
    expect(log!.data.details).toEqual({ fields: ["name"] });
  });

  it("既に使われているメールアドレスは 409 EMAIL_ALREADY_REGISTERED で、氏名も変わらない", async () => {
    const { org, owner } = await createOrganizationWithOwner("アカウント歯科 重複");
    const other = await createAdmin(org, "admin");
    const before = await getDocForTest<{ displayName: string }>(COLLECTIONS.adminUsers, owner.uid);
    const reauthIdToken = await signInWithPassword(owner.email, TEST_PASSWORD);
    const res = await patchMe(owner, { name: "変更しない", email: other.email, reauthIdToken });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("EMAIL_ALREADY_REGISTERED");
    const after = await getDocForTest<{ displayName: string }>(COLLECTIONS.adminUsers, owner.uid);
    expect(after!.displayName).toBe(before!.displayName);
    expect(await accountUpdateLogs(owner.uid)).toHaveLength(0);
    expect((await getMe(owner.cookieHeader)).status).toBe(200);
  });

  it("入力の不正（項目なし・短い・英字のみ・数字のみ・73 文字・空白の氏名・メール形式）は 422", async () => {
    const { owner } = await createOrganizationWithOwner("アカウント歯科 検証");
    const reauthIdToken = "x";
    for (const body of [
      {},
      { password: "abc1234", reauthIdToken },
      { password: "abcdefghij", reauthIdToken },
      { password: "1234567890", reauthIdToken },
      { password: `a1${"x".repeat(71)}`, reauthIdToken },
      { name: "   " },
      { email: "not-an-email", reauthIdToken },
    ]) {
      const res = await patchMe(owner, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    }
  });
});

describe("I-39 GET /admin/me の links と招待リンクの再発行", () => {
  it("links は NEXT_PUBLIC_APP_BASE_URL 基準、adminInvite は常に null、adminInviteIssuedAt は組織の値", async () => {
    const { org, owner } = await createOrganizationWithOwner("リンク歯科");
    const res = await getMe(owner.cookieHeader);
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeDto;
    const base = process.env.NEXT_PUBLIC_APP_BASE_URL;
    expect(me.links.applicant).toBe(`${base}/exam?q=${org.organizationId}&p=user`);
    expect(me.links.executive).toBe(`${base}/exam?q=${org.organizationId}&p=executives`);
    expect(me.links.adminInvite).toBeNull();
    const orgDoc = await getDocForTest<{ inviteTokenIssuedAt: { toDate(): Date } }>(
      COLLECTIONS.organizations,
      org.organizationId,
    );
    expect(me.links.adminInviteIssuedAt).toBe(orgDoc!.inviteTokenIssuedAt.toDate().toISOString());
    expect(me).toMatchObject({
      adminUserId: owner.uid,
      email: owner.email,
      role: "owner",
      canViewExecutives: true,
      organization: { organizationId: org.organizationId, name: "リンク歯科" },
    });
  });

  it("owner の再発行は 200 で adminInvite と rotatedAt を返し、ハッシュを置き換えて監査ログを書く。平文は Firestore に無い", async () => {
    const { org, owner } = await createOrganizationWithOwner("再発行歯科");
    const res = await callRoute(rotateInviteRoute, {
      method: "POST",
      url: "/api/v1/admin/organization/invite-token",
      cookieHeader: owner.cookieHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InviteRotatedDto;
    const base = process.env.NEXT_PUBLIC_APP_BASE_URL;
    const match = new RegExp(`^${base}/admin/signup\\?q=([A-Za-z0-9_-]{43})$`).exec(
      body.adminInvite,
    );
    expect(match).not.toBeNull();
    const token = match![1]!;
    expect(token).not.toBe(org.inviteToken);

    const orgDoc = await getDocForTest<{
      inviteTokenHash: string;
      inviteTokenIssuedAt: { toDate(): Date };
    }>(COLLECTIONS.organizations, org.organizationId);
    expect(orgDoc!.inviteTokenHash).toBe(hashInviteToken(token));
    expect(body.rotatedAt).toBe(orgDoc!.inviteTokenIssuedAt.toDate().toISOString());

    const logs = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (d) =>
        d.data.action === "organization.rotate_invite_token" &&
        d.data.organizationId === org.organizationId,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.data.actorUid).toBe(owner.uid);

    // 平文がどのコレクションにも無い
    for (const collection of await adminFirestore().listCollections()) {
      const snap = await collection.get();
      for (const doc of snap.docs) expect(JSON.stringify(doc.data())).not.toContain(token);
    }

    // 再発行後の GET /me の adminInviteIssuedAt も更新される
    const me = (await (await getMe(owner.cookieHeader)).json()) as MeDto;
    expect(me.links.adminInviteIssuedAt).toBe(body.rotatedAt);
    expect(me.links.adminInvite).toBeNull();
  });

  it("admin の再発行は 403 ROLE_REQUIRED でハッシュが変わらない", async () => {
    const { org } = await createOrganizationWithOwner("再発行権限歯科");
    const admin = await createAdmin(org, "admin");
    const before = await getDocForTest<{ inviteTokenHash: string }>(
      COLLECTIONS.organizations,
      org.organizationId,
    );
    const res = await callRoute(rotateInviteRoute, {
      method: "POST",
      url: "/api/v1/admin/organization/invite-token",
      cookieHeader: admin.cookieHeader,
    });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("ROLE_REQUIRED");
    const after = await getDocForTest<{ inviteTokenHash: string }>(
      COLLECTIONS.organizations,
      org.organizationId,
    );
    expect(after!.inviteTokenHash).toBe(before!.inviteTokenHash);
  });
});

describe("GET /admin/admin-users（04 §5.11、§10 (9)）", () => {
  it("admin は 403 ROLE_REQUIRED、owner は削除済みを除く同一組織の全員を email 付きで返す", async () => {
    const { org, owner } = await createOrganizationWithOwner("管理者一覧歯科");
    const admin = await createAdmin(org, "admin", "一般 管理者");
    const removed = await createAdmin(org, "admin", "削除済み 管理者");
    // 例外的な直接書き込み: 管理者の削除 API は無い（運用スクリプトで行う）ため、deletedAt を直接設定する
    await writeDocForTest(COLLECTIONS.adminUsers, removed.uid, {
      deletedAt: new Date(),
    });
    await createOrganizationWithOwner("別組織歯科");

    const forbidden = await callRoute(listAdminUsersRoute, {
      method: "GET",
      url: "/api/v1/admin/admin-users",
      cookieHeader: admin.cookieHeader,
    });
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe("ROLE_REQUIRED");

    const res = await callRoute(listAdminUsersRoute, {
      method: "GET",
      url: "/api/v1/admin/admin-users",
      cookieHeader: owner.cookieHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminUserListDto;
    expect(body.total).toBe(2);
    expect(body.items.map((i) => [i.adminUserId, i.email, i.role, i.isSuspended])).toEqual([
      [owner.uid, owner.email, "owner", false],
      [admin.uid, admin.email, "admin", false],
    ]);
    expect(body.items[1]!.name).toBe("一般 管理者");
  });
});
