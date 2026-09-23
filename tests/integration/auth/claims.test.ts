// I-05（クレーム不備）、I-06（adminUsers 文書なし・クレーム不一致）と、adminUsers の停止・削除の即時反映（04 §2.5.1、02 §9.2）
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getMe } from "@/app/api/v1/admin/me/route";
import { completeAdminAccount } from "@/lib/auth/admin-accounts";
import {
  createAdminUser,
  isAlreadyExistsError,
} from "@/lib/db/repositories/admin-users-repository";
import { adminAuth } from "@/lib/firebase/admin";

import {
  createAdmin,
  createOrganizationWithOwner,
  createTestOrganization,
  loginAs,
  TEST_PASSWORD,
  uniqueEmail,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

const callMe = (cookieHeader: string) =>
  callRoute(getMe, { method: "GET", url: "/api/v1/admin/me", cookieHeader });

async function expectForbidden(cookieHeader: string, code: string) {
  const res = await callMe(cookieHeader);
  expect(res.status).toBe(403);
  expect(await errorCode(res)).toBe(code);
}

/** Admin SDK で Auth ユーザーだけを作り（任意のクレーム）、POST /auth/session で Cookie を得る（D04-54: クレームは検査しない） */
async function cookieForRawUser(
  claims: Record<string, unknown> | null,
): Promise<{ uid: string; cookieHeader: string }> {
  const email = uniqueEmail("raw");
  const user = await adminAuth().createUser({
    email,
    password: TEST_PASSWORD,
    emailVerified: true,
  });
  if (claims) await adminAuth().setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, cookieHeader: await loginAs(email) };
}

let org: TestOrganization;

beforeAll(async () => {
  ({ org } = await createOrganizationWithOwner("クレームテスト歯科"));
});

describe("I-05 クレーム不備は 403 ADMIN_NOT_REGISTERED", () => {
  it.each<[string, (organizationId: string) => Record<string, unknown> | null]>([
    ["クレームなし", () => null],
    ["organizationId なし", () => ({ role: "owner" })],
    ["role が 3 値以外", (organizationId) => ({ organizationId, role: "manager" })],
    ["organizationId の形式不正", () => ({ organizationId: "a/b", role: "owner" })],
  ])("%s", async (_, claims) => {
    const { cookieHeader } = await cookieForRawUser(claims(org.organizationId));
    await expectForbidden(cookieHeader, "ADMIN_NOT_REGISTERED");
  });
});

describe("I-06 adminUsers 文書なし・クレーム不一致", () => {
  it("正しいクレームがあっても adminUsers 文書が無ければ 403（監査ログは書かない）", async () => {
    const { cookieHeader } = await cookieForRawUser({
      organizationId: org.organizationId,
      role: "admin",
    });
    await expectForbidden(cookieHeader, "ADMIN_NOT_REGISTERED");
    expect(await countDocs("auditLogs", [["action", "==", "admin.claims_mismatch"]])).toBe(0);
  });

  it("文書の role がクレームと異なる（例外書き込み）→ 403 + admin.claims_mismatch 1 件", async () => {
    const admin = await createAdmin(org, "admin");
    await writeDocForTest("adminUsers", admin.uid, { role: "owner" });
    await expectForbidden(admin.cookieHeader, "ADMIN_NOT_REGISTERED");
    expect(
      await countDocs("auditLogs", [
        ["action", "==", "admin.claims_mismatch"],
        ["targetId", "==", admin.uid],
        ["actorKind", "==", "system"],
      ]),
    ).toBe(1);
  });

  it("文書の organizationId がクレームと異なる（例外書き込み）→ 403 + admin.claims_mismatch 1 件", async () => {
    const other = await createTestOrganization("別組織");
    const admin = await createAdmin(org, "admin");
    await writeDocForTest("adminUsers", admin.uid, { organizationId: other.organizationId });
    await expectForbidden(admin.cookieHeader, "ADMIN_NOT_REGISTERED");
    expect(
      await countDocs("auditLogs", [
        ["action", "==", "admin.claims_mismatch"],
        ["targetId", "==", admin.uid],
      ]),
    ).toBe(1);
  });
});

describe("adminUsers の停止・削除・組織の削除は Cookie が有効でも即時に 403 ADMIN_SUSPENDED", () => {
  it("isSuspended == true（文書のみ。Auth は有効なまま）", async () => {
    const admin = await createAdmin(org, "admin");
    expect((await callMe(admin.cookieHeader)).status).toBe(200);
    await writeDocForTest("adminUsers", admin.uid, { isSuspended: true });
    await expectForbidden(admin.cookieHeader, "ADMIN_SUSPENDED");
  });

  it("deletedAt が設定済み（文書のみ）", async () => {
    const admin = await createAdmin(org, "admin");
    await writeDocForTest("adminUsers", admin.uid, { deletedAt: Timestamp.now() });
    await expectForbidden(admin.cookieHeader, "ADMIN_SUSPENDED");
  });

  it("所属組織が論理削除済み（GET /me）", async () => {
    const { org: doomed, owner } = await createOrganizationWithOwner("削除予定歯科");
    await writeDocForTest("organizations", doomed.organizationId, { deletedAt: Timestamp.now() });
    await expectForbidden(owner.cookieHeader, "ADMIN_SUSPENDED");
  });
});

describe("adminUsers の作成は create()（09 §6.4 の 21）", () => {
  it("既存文書への create() は ALREADY_EXISTS で拒否され、completeAdminAccount の再実行は成功扱い（冪等）", async () => {
    const admin = await createAdmin(org, "admin", "最初の名前");
    const error = await createAdminUser({
      uid: admin.uid,
      organizationId: org.organizationId,
      role: "owner",
      displayName: "上書きされない",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isAlreadyExistsError(error)).toBe(true);
    await completeAdminAccount({
      uid: admin.uid,
      displayName: "上書きされない",
      organizationId: org.organizationId,
      role: "admin",
      actorKind: "system",
    });
    expect(await getDocForTest("adminUsers", admin.uid)).toMatchObject({
      role: "admin",
      displayName: "最初の名前",
    });
  });
});
