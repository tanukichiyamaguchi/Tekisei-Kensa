// M7 の組織と管理者のリポジトリ（11-8 §3.2〜§3.4・§3.14）: M7-misc-19（招待トークンの平文の保存と作り直し）、
// listActiveOwners（Q-M7-2）と markAnnouncementDismissed（テスト ID なし。API の観点 M7-misc-23・26 は後の PR）
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { hashInviteToken } from "@/lib/auth/invite-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { RepositoryError } from "@/lib/db/errors";
import {
  createAdminUser,
  getAdminUser,
  listActiveOwners,
  markAnnouncementDismissed,
  setAdminUserSuspended,
  softDeleteAdminUser,
} from "@/lib/db/repositories/admin-users-repository";
import {
  createOrganization,
  findOrganizationByInviteTokenHash,
  getOrganization,
  rotateInviteToken,
} from "@/lib/db/repositories/organizations-repository";
import type { AdminRole, AnnouncementKey } from "@/lib/db/types";
import { adminFirestore } from "@/lib/firebase/admin";

import { createTestOrganization, type TestOrganization } from "../helpers/fixtures";
import { getDocForTest, listDocs } from "../helpers/firestore";

type Doc = Record<string, unknown>;

let seq = 0;
/** Auth を使わずに adminUsers 文書だけを作る（リポジトリの関数。uid はテスト用の英数字） */
async function adminUser(org: TestOrganization, role: AdminRole): Promise<string> {
  seq += 1;
  const uid = `m7AdminUser${String(seq).padStart(4, "0")}`;
  await createAdminUser({ uid, organizationId: org.organizationId, role, displayName: "" });
  return uid;
}

const adminDoc = async (uid: string) => (await getDocForTest<Doc>(COLLECTIONS.adminUsers, uid))!;

describe("M7-misc-19 組織の作成と招待トークンの作り直し（11-8 §3.2）", () => {
  it("createOrganization が inviteToken（平文）・inviteTokenHash（平文の sha256）・inviteTokenIssuedAt を書く", async () => {
    const created = await createOrganization({
      name: "招待サロン",
      code: null,
      customerNumber: null,
    });
    const doc = (await getDocForTest<Doc>(COLLECTIONS.organizations, created.organizationId))!;
    expect(created.inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(doc.inviteToken).toBe(created.inviteToken);
    expect(doc.inviteTokenHash).toBe(hashInviteToken(created.inviteToken));
    expect(doc.inviteTokenIssuedAt).toBeInstanceOf(Timestamp);
    // ドメインの Organization にも平文が出る
    expect((await getOrganization(created.organizationId))?.inviteToken).toBe(created.inviteToken);
    // 監査ログ organization.create に平文は無い
    const logs = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (d) => d.data.targetId === created.organizationId,
    );
    expect(logs.map((d) => d.data.action)).toEqual(["organization.create"]);
    expect(JSON.stringify(logs)).not.toContain(created.inviteToken);
  });

  it("rotateInviteToken が 3 つを書き換え、監査ログを同じバッチで書く（平文は監査ログに無い）。前の平文のハッシュでは引けない", async () => {
    const org = await createTestOrganization("作り直しサロン");
    const before = (await getDocForTest<Doc>(COLLECTIONS.organizations, org.organizationId))!;
    const rotated = await rotateInviteToken({
      organizationId: org.organizationId,
      actor: { kind: "system" },
      meta: null,
    });
    expect(rotated.inviteToken).not.toBe(org.inviteToken);
    const after = (await getDocForTest<Doc>(COLLECTIONS.organizations, org.organizationId))!;
    expect(after.inviteToken).toBe(rotated.inviteToken);
    expect(after.inviteTokenHash).toBe(hashInviteToken(rotated.inviteToken));
    expect((after.inviteTokenIssuedAt as Timestamp).toDate()).toEqual(rotated.issuedAt);
    expect(
      (after.inviteTokenIssuedAt as Timestamp).toMillis() >=
        (before.inviteTokenIssuedAt as Timestamp).toMillis(),
    ).toBe(true);

    const logs = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (d) =>
        d.data.action === "organization.rotate_invite_token" &&
        d.data.targetId === org.organizationId,
    );
    expect(logs).toHaveLength(1);
    // 同じバッチ: serverTimestamp はバッチの確定の時刻になるので、組織の updatedAt と監査ログの createdAt が一致する
    expect((logs[0]!.data.createdAt as Timestamp).isEqual(after.updatedAt as Timestamp)).toBe(true);
    expect(JSON.stringify(logs[0]!.data)).not.toContain(rotated.inviteToken);
    expect(JSON.stringify(logs[0]!.data)).not.toContain(org.inviteToken);

    expect(await findOrganizationByInviteTokenHash(hashInviteToken(org.inviteToken))).toBeNull();
    expect(
      (await findOrganizationByInviteTokenHash(hashInviteToken(rotated.inviteToken)))?.id,
    ).toBe(org.organizationId);
  });
});

describe("listActiveOwners（Q-M7-2。11-8 §3.4）", () => {
  it("同じ組織の、削除されていない責任者だけを返す（停止中を含む）。admin・super_admin・削除済み・別の組織は含まない", async () => {
    const org = await createTestOrganization("責任者サロン");
    const other = await createTestOrganization("別の責任者サロン");
    const active = await adminUser(org, "owner");
    const suspended = await adminUser(org, "owner");
    const deleted = await adminUser(org, "owner");
    await adminUser(org, "admin");
    await adminUser(org, "super_admin");
    const otherOwner = await adminUser(other, "owner");
    await setAdminUserSuspended({ uid: suspended, isSuspended: true });
    await softDeleteAdminUser({ uid: deleted });

    const owners = await listActiveOwners(org.organizationId);
    expect(owners.map((o) => o.id).sort()).toEqual([active, suspended].sort());
    expect(owners.find((o) => o.id === suspended)?.isSuspended).toBe(true);
    expect(owners.every((o) => o.role === "owner" && o.deletedAt === null)).toBe(true);
    expect((await listActiveOwners(other.organizationId)).map((o) => o.id)).toEqual([otherOwner]);
    expect(await listActiveOwners("NoSuchOrganization00")).toEqual([]);
  });
});

describe("markAnnouncementDismissed（11-8 §3.3）", () => {
  let org: TestOrganization;
  beforeAll(async () => {
    org = await createTestOrganization("お知らせサロン");
  });

  it("作成した管理者の既読は空の map。1 回目で日時が入り、2 回目は日時が変わらない。別のキーは足される", async () => {
    const uid = await adminUser(org, "admin");
    expect((await adminDoc(uid)).dismissedAnnouncements).toEqual({});

    await markAnnouncementDismissed(uid, "ai_training");
    const first = await adminDoc(uid);
    const firstAt = (first.dismissedAnnouncements as Record<string, Timestamp>).ai_training!;
    expect(firstAt).toBeInstanceOf(Timestamp);
    expect(firstAt.isEqual(first.updatedAt as Timestamp)).toBe(true);

    await markAnnouncementDismissed(uid, "ai_training");
    const second = await adminDoc(uid);
    expect(
      (second.dismissedAnnouncements as Record<string, Timestamp>).ai_training!.isEqual(firstAt),
    ).toBe(true);
    expect((second.updatedAt as Timestamp).isEqual(first.updatedAt as Timestamp)).toBe(true); // 書かない

    await markAnnouncementDismissed(uid, "employment_analysis");
    const third = await adminDoc(uid);
    expect(Object.keys(third.dismissedAnnouncements as Doc).sort()).toEqual([
      "ai_training",
      "employment_analysis",
    ]);
    const user = await getAdminUser(uid);
    expect([...user!.dismissedAnnouncements.keys()]).toEqual([
      "employment_analysis",
      "ai_training",
    ]);
    expect(user!.dismissedAnnouncements.get("ai_training")).toEqual(firstAt.toDate());
  });

  it("項目の無い M7 より前の文書にも書ける（例外的な直接書き込み: 項目を消して M7 より前の形にする）", async () => {
    const uid = await adminUser(org, "admin");
    await adminFirestore()
      .collection(COLLECTIONS.adminUsers)
      .doc(uid)
      .update({ dismissedAnnouncements: FieldValue.delete() });
    expect(await adminDoc(uid)).not.toHaveProperty("dismissedAnnouncements");
    expect((await getAdminUser(uid))!.dismissedAnnouncements.size).toBe(0);

    await markAnnouncementDismissed(uid, "ai_recruitment");
    const doc = await adminDoc(uid);
    expect(Object.keys(doc.dismissedAnnouncements as Doc)).toEqual(["ai_recruitment"]);
    expect([...(await getAdminUser(uid))!.dismissedAnnouncements.keys()]).toEqual([
      "ai_recruitment",
    ]);
  });

  it("文書が無い・削除済みの管理者には書かない。別の管理者の文書は変わらない", async () => {
    const target = await adminUser(org, "admin");
    const bystander = await adminUser(org, "owner");
    const deleted = await adminUser(org, "admin");
    await softDeleteAdminUser({ uid: deleted });
    const deletedBefore = await adminDoc(deleted);
    const bystanderBefore = await adminDoc(bystander);

    await markAnnouncementDismissed("NoSuchAdminUser0000", "ai_training");
    expect(await getDocForTest(COLLECTIONS.adminUsers, "NoSuchAdminUser0000")).toBeNull();
    await markAnnouncementDismissed(deleted, "ai_training");
    const deletedAfter = await adminDoc(deleted);
    expect(deletedAfter.dismissedAnnouncements).toEqual({});
    expect(
      (deletedAfter.updatedAt as Timestamp).isEqual(deletedBefore.updatedAt as Timestamp),
    ).toBe(true);

    await markAnnouncementDismissed(target, "employment_analysis");
    expect(Object.keys((await adminDoc(target)).dismissedAnnouncements as Doc)).toEqual([
      "employment_analysis",
    ]);
    const bystanderAfter = await adminDoc(bystander);
    expect(bystanderAfter.dismissedAnnouncements).toEqual({});
    expect(
      (bystanderAfter.updatedAt as Timestamp).isEqual(bystanderBefore.updatedAt as Timestamp),
    ).toBe(true);
  });

  it("uid が文書 ID の形でなければ何もしない。知らないキーは書く前に VALIDATION_ERROR", async () => {
    await expect(markAnnouncementDismissed("bad/uid", "ai_training")).resolves.toBeUndefined();
    const uid = await adminUser(org, "admin");
    const error = await markAnnouncementDismissed(uid, "other_key" as AnnouncementKey).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe("VALIDATION_ERROR");
    expect((await adminDoc(uid)).dismissedAnnouncements).toEqual({});
  });
});
