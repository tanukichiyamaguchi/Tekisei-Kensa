// I-09 運用スクリプト（02 §9.6、§9.9、§13.2）。処理関数を import して Emulator に対して実行する。
// 最後に CLI（pnpm owner:create と同じ tsx 起動）を子プロセスで 1 回実行し、エントリポイントとパス解決を確認する
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { GET as getMe } from "@/app/api/v1/admin/me/route";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { listResults } from "@/lib/db/repositories/results-repository";
import { adminAuth } from "@/lib/firebase/admin";

import { createOwner } from "@/scripts/create-owner";
import { seedLocal } from "@/scripts/seed-local";
import { parseAction, setAdminRole } from "@/scripts/set-admin-role";
import { signInWithPassword } from "../helpers/emulator";
import { createTestOrganization, loginAs, TEST_PASSWORD, uniqueEmail } from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs } from "../helpers/firestore";
import { callRoute } from "../helpers/routes";

const BASE_URL = "http://localhost:3000";

function capture() {
  const lines: string[] = [];
  return { lines, print: (line: string) => lines.push(line) };
}

describe("I-09 scripts/create-owner", () => {
  let email: string;
  let result: Awaited<ReturnType<typeof createOwner>>;
  let lines: string[];

  beforeAll(async () => {
    email = uniqueEmail("owner-script");
    const out = capture();
    lines = out.lines;
    result = await createOwner(
      {
        orgName: "スクリプト歯科",
        orgCode: "S-001",
        customerNumber: null,
        email,
        displayName: "院長",
      },
      { baseUrl: BASE_URL, print: out.print },
    );
  });

  it("organizations 文書 1 件（inviteTokenHash あり）と、招待リンクの平文が標準出力に 1 回だけ出る", async () => {
    const org = await getDocForTest("organizations", result.organizationId);
    expect(org).toMatchObject({
      name: "スクリプト歯科",
      code: "S-001",
      customerNumber: null,
      deletedAt: null,
    });
    const linkLines = lines.filter((l) => l.includes("/admin/signup?q="));
    expect(linkLines).toHaveLength(1);
    const token = new URL(result.inviteLink!).searchParams.get("q")!;
    expect(result.inviteLink).toBe(`${BASE_URL}/admin/signup?q=${token}`);
    expect(org!.inviteTokenHash).toBe(hashInviteToken(token));
    // 平文トークンは Firestore に保存しない
    expect(JSON.stringify(await listDocs("organizations"))).not.toContain(token);
    expect(JSON.stringify(await listDocs("auditLogs"))).not.toContain(token);
  });

  it("Auth ユーザー（クレーム owner、emailVerified）・adminUsers 文書・監査ログ 2 件", async () => {
    const user = await adminAuth().getUser(result.uid);
    expect(user.email).toBe(email);
    expect(user.emailVerified).toBe(true);
    expect(user.customClaims).toEqual({ organizationId: result.organizationId, role: "owner" });
    expect(await getDocForTest("adminUsers", result.uid)).toMatchObject({
      organizationId: result.organizationId,
      role: "owner",
      displayName: "院長",
      isSuspended: false,
      deletedAt: null,
    });
    for (const action of ["organization.create", "admin.create"]) {
      expect(
        await countDocs("auditLogs", [
          ["organizationId", "==", result.organizationId],
          ["action", "==", action],
          ["actorKind", "==", "system"],
        ]),
      ).toBe(1);
    }
  });

  it("パスワード設定後に ID トークン → POST /auth/session → GET /admin/me が 200", async () => {
    await adminAuth().updateUser(result.uid, { password: TEST_PASSWORD });
    const cookieHeader = await loginAs(email);
    const me = await callRoute(getMe, { method: "GET", url: "/api/v1/admin/me", cookieHeader });
    expect(me.status).toBe(200);
  });

  it("同じメールアドレスで 2 回目は auth/email-already-exists で失敗し、文書が増えない", async () => {
    const before = await Promise.all(
      ["organizations", "adminUsers", "auditLogs"].map((c) => countDocs(c)),
    );
    await expect(
      createOwner(
        { orgName: "重複歯科", email, displayName: "院長" },
        { baseUrl: BASE_URL, print: () => undefined },
      ),
    ).rejects.toMatchObject({ code: "auth/email-already-exists" });
    const after = await Promise.all(
      ["organizations", "adminUsers", "auditLogs"].map((c) => countDocs(c)),
    );
    expect(after).toEqual(before);
  });

  it("途中失敗のやり直し: Auth ユーザーだけがある状態から --organization-id で補完できる", async () => {
    const org = await createTestOrganization("やり直し歯科");
    const partialEmail = uniqueEmail("partial-owner");
    const partial = await adminAuth().createUser({
      email: partialEmail,
      emailVerified: true,
      password: TEST_PASSWORD,
    });
    const out = capture();
    const r = await createOwner(
      { organizationId: org.organizationId, email: partialEmail, displayName: "院長" },
      { baseUrl: BASE_URL, print: out.print },
    );
    expect(r).toMatchObject({ uid: partial.uid, recovered: true, inviteLink: null });
    expect(out.lines.some((l) => l.includes("/admin/signup"))).toBe(false);
    expect((await adminAuth().getUser(partial.uid)).customClaims).toEqual({
      organizationId: org.organizationId,
      role: "owner",
    });
    // 補完済みのユーザーは 2 回目以降は失敗する
    await expect(
      createOwner(
        { organizationId: org.organizationId, email: partialEmail, displayName: "院長" },
        { baseUrl: BASE_URL, print: () => undefined },
      ),
    ).rejects.toMatchObject({ code: "auth/email-already-exists" });
  });

  it("hideInviteLink のときは招待リンクを出力しない（組織は作られ、戻り値にはリンクがある）", async () => {
    const out = capture();
    const r = await createOwner(
      { orgName: "ログ非表示歯科", email: uniqueEmail("hidden-link"), displayName: "院長" },
      { baseUrl: BASE_URL, print: out.print, hideInviteLink: true },
    );
    expect(out.lines.some((l) => l.includes("/admin/signup"))).toBe(false);
    expect(out.lines.some((l) => l.includes("表示しません"))).toBe(true);
    expect(await getDocForTest("organizations", r.organizationId)).not.toBeNull();
  });

  it("入力誤りは UsageError（組織名なし・両方指定・存在しない組織・メール形式）", async () => {
    const deps = { baseUrl: BASE_URL, print: () => undefined };
    await expect(createOwner({ email: uniqueEmail("x"), displayName: "" }, deps)).rejects.toThrow(
      /--org-name/,
    );
    await expect(
      createOwner(
        { orgName: "a", organizationId: "abc", email: uniqueEmail("x"), displayName: "" },
        deps,
      ),
    ).rejects.toThrow(/同時に/);
    await expect(
      createOwner(
        { organizationId: "doesNotExist0000", email: uniqueEmail("x"), displayName: "" },
        deps,
      ),
    ).rejects.toThrow(/見つかりません/);
    await expect(
      createOwner({ orgName: "a", email: "not-an-email", displayName: "" }, deps),
    ).rejects.toThrow(/email/);
  });
});

describe("I-09 scripts/set-admin-role", () => {
  it("--role / --suspend / --unsuspend / --sync / --delete", async () => {
    const email = uniqueEmail("role-script");
    const { uid, organizationId } = await createOwner(
      { orgName: "役割歯科", email, displayName: "院長" },
      { baseUrl: BASE_URL, print: () => undefined },
    );
    await adminAuth().updateUser(uid, { password: TEST_PASSWORD });

    await setAdminRole({ email, action: { kind: "role", role: "admin" } });
    expect((await adminAuth().getUser(uid)).customClaims).toEqual({
      organizationId,
      role: "admin",
    });
    expect(await getDocForTest("adminUsers", uid)).toMatchObject({ role: "admin" });

    await setAdminRole({ uid, action: { kind: "suspend" } });
    expect((await adminAuth().getUser(uid)).disabled).toBe(true);
    expect(await getDocForTest("adminUsers", uid)).toMatchObject({ isSuspended: true });
    await expect(signInWithPassword(email, TEST_PASSWORD)).rejects.toThrow(/USER_DISABLED/);

    await setAdminRole({ uid, action: { kind: "unsuspend" } });
    expect((await adminAuth().getUser(uid)).disabled).toBe(false);
    expect(await getDocForTest("adminUsers", uid)).toMatchObject({ isSuspended: false });

    // クレームだけを owner に戻す → --sync で文書が追従する
    await adminAuth().setCustomUserClaims(uid, { organizationId, role: "owner" });
    expect((await setAdminRole({ uid, action: { kind: "sync" } })).message).toMatch(/合わせました/);
    expect(await getDocForTest("adminUsers", uid)).toMatchObject({ role: "owner" });
    expect((await setAdminRole({ uid, action: { kind: "sync" } })).message).toMatch(/変更なし/);

    await setAdminRole({ uid, action: { kind: "delete" } });
    expect((await adminAuth().getUser(uid)).disabled).toBe(true);
    const doc = await getDocForTest("adminUsers", uid);
    expect(doc!.deletedAt).not.toBeNull();

    for (const action of [
      "admin.role_change",
      "admin.suspend",
      "admin.unsuspend",
      "admin.delete",
    ]) {
      expect(
        await countDocs("auditLogs", [
          ["targetId", "==", uid],
          ["action", "==", action],
        ]),
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("引数の検査", async () => {
    expect(parseAction({ role: "owner" })).toEqual({ kind: "role", role: "owner" });
    expect(() => parseAction({})).toThrow(/いずれか 1 つ/);
    expect(() => parseAction({ suspend: true, delete: true })).toThrow(/いずれか 1 つ/);
    expect(() => parseAction({ role: "manager" })).toThrow(/--role/);
    await expect(setAdminRole({ action: { kind: "sync" } })).rejects.toThrow(/--uid か --email/);
    await expect(
      setAdminRole({ email: uniqueEmail("none"), action: { kind: "sync" } }),
    ).rejects.toThrow(/見つかりません/);
  });
});

describe("I-09 scripts/seed-local", () => {
  it("組織・オーナー・管理者・送信済み 10 人（求職者 8・幹部 2）・下書き 1 人を投入し、owner で 10 件・admin で 8 件が見える", async () => {
    const out = capture();
    const summary = await seedLocal(
      {
        ownerEmail: uniqueEmail("seed-owner"),
        adminEmail: uniqueEmail("seed-admin"),
        password: TEST_PASSWORD,
      },
      { baseUrl: BASE_URL, print: out.print },
    );
    expect(summary.submitted).toHaveLength(10);
    expect(summary.submitted.filter((s) => s.kind === "executive")).toHaveLength(2);
    const owner = await listResults({
      viewer: { uid: summary.ownerUid, organizationId: summary.organizationId, role: "owner" },
    });
    const admin = await listResults({
      viewer: { uid: summary.adminUid, organizationId: summary.organizationId, role: "admin" },
    });
    expect(owner).toHaveLength(10);
    expect(admin).toHaveLength(8);
    expect(owner.filter((r) => r.isExcluded)).toHaveLength(1);
    expect(new Set(owner.map((r) => r.teamCode))).toEqual(new Set(["A", "B", null]));
    expect(await getDocForTest("assessmentSessions", summary.draftSessionId)).toMatchObject({
      status: "draft",
      lastSavedPageNo: 5,
    });
    // 作ったオーナーでログインできる
    const ownerUser = await adminAuth().getUser(summary.ownerUid);
    const cookieHeader = await loginAs(ownerUser.email!);
    expect(
      (await callRoute(getMe, { method: "GET", url: "/api/v1/admin/me", cookieHeader })).status,
    ).toBe(200);
  });

  it("Emulator の環境変数が無い場合は拒否する", async () => {
    const saved = process.env.FIRESTORE_EMULATOR_HOST;
    const { resetEnvCacheForTest } = await import("@/lib/utils/env");
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "";
      resetEnvCacheForTest();
      await expect(
        seedLocal(
          { ownerEmail: uniqueEmail("x"), adminEmail: uniqueEmail("y"), password: TEST_PASSWORD },
          { baseUrl: BASE_URL, print: () => undefined },
        ),
      ).rejects.toThrow();
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = saved;
      resetEnvCacheForTest();
    }
  });
});

describe("I-09 CLI（子プロセス）", () => {
  it("pnpm owner:create 相当の起動で組織とオーナーが作られ、招待リンクが 1 回表示される", async () => {
    const email = uniqueEmail("cli-owner");
    const { stdout } = await promisify(execFile)(
      "pnpm",
      ["-s", "owner:create", "--org-name", "CLI 歯科", "--email", email, "--display-name", "院長"],
      { env: { ...process.env }, timeout: 60_000 },
    );
    expect(stdout.match(/\/admin\/signup\?q=/g)).toHaveLength(1);
    expect(stdout).toContain("Firebase Emulator");
    const user = await adminAuth().getUserByEmail(email);
    expect(user.customClaims?.role).toBe("owner");
  });

  it("入力誤りは終了コード 2", async () => {
    const error = await promisify(execFile)("pnpm", ["-s", "owner:create", "--org-name", "x"], {
      env: { ...process.env },
      timeout: 60_000,
    }).then(
      () => null,
      (e: unknown) => e as { code?: number; stderr?: string },
    );
    expect(error?.code).toBe(2);
    expect(error?.stderr).toContain("--email");
  });
});

describe("scripts/verify-firebase（Emulator に対する動作確認。本来の実行先は検証用プロジェクト）", () => {
  it("Emulator でも成立する項目（1・2・3a・3c・4・6・7b・23・24）が成立し、一時データを残さない", async () => {
    const { verifyFirebase } = await import("@/scripts/verify-firebase");
    const results = await verifyFirebase({
      apiKey: "demo-api-key",
      identityToolkitBase: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`,
    });
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    for (const id of ["1", "2", "3a", "3c", "4", "6", "7b", "23", "24"]) {
      expect(byId[id]?.status, `${id}: ${byId[id]?.detail}`).toBe("成立");
    }
    // Emulator はインデックスを強制せず（3b）、自己登録の無効化設定も無い（7a）
    expect(byId["3b"]?.status).toBe("要確認");
    expect(byId["7a"]?.status).toBe("不成立");
    expect(await countDocs("_verifyFirebase")).toBe(0);
    const users = await adminAuth().listUsers(1000);
    expect(users.users.filter((u) => u.email?.startsWith("verify-"))).toEqual([]);
  });
});
