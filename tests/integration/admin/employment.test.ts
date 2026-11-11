// M7-zaiseki-26 と M7-zaiseki-27〜29 の在籍・退職の分（11-3 §2.2・§3.3〜§3.5・§5.2）、PF-10（1,000 件の在籍・退職の時間と、
// 変更の保存の後の読み直しの時間。M7-zaiseki-46 の在籍・退職の分。08 §3.9）。人は受検者 API（登録→保存→送信）で作り、つながりは
// 再受験リンク（previousResultId）で作る（再受験は既存スタッフ扱い。K-39 Q-33）。区分・入社日・退職日とチーム・除外は、画面と同じ
// PATCH /api/v1/admin/respondents/{id}（11-2 §3.6。11-3 §3.4）で変える。API では作れない次のものは、08 D08-18 の例外として直接
// 書き込みで作り、テスト名に書く: 管理者の停止（M7-zaiseki-27。claims.test.ts と同じ作り）、PF-10 の受験 1,000 件とその受検者。
// 基準日（today）の日付の変わり目は、ルートが now を受け取らないので、Cookie を付けた Request から requireAdmin で得た管理者の
// コンテキストで getEmployment(ctx, now) を直接呼んで確かめる（11-3 §3.6）
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getClassificationRoute } from "@/app/api/v1/admin/classification/route";
import { GET as getEmploymentRoute } from "@/app/api/v1/admin/employment/route";
import { PATCH as patchRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { requireAdmin } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { todayInTokyo } from "@/lib/presentation/employment";
import { scoreAnswers } from "@/lib/scoring/score";
import { getEmployment as getEmploymentService } from "@/lib/services/classification";
import type {
  ClassificationDto,
  EmploymentDto,
  EmploymentPersonDto,
} from "@/lib/services/dto/admin";

import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

type Submitted = Awaited<ReturnType<typeof submitAnswerSet>>;
type Employment = {
  readonly status: "candidate" | "employed" | "left";
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
};

const getEmployment = (admin: TestAdmin | null, query = "") =>
  callRoute(getEmploymentRoute, {
    method: "GET",
    url: `/api/v1/admin/employment${query}`,
    ...(admin === null ? {} : { cookieHeader: admin.cookieHeader }),
  });

async function employmentOf(admin: TestAdmin, query = ""): Promise<EmploymentDto> {
  const res = await getEmployment(admin, query);
  expect(res.status).toBe(200);
  return (await res.json()) as EmploymentDto;
}

const getClassification = (admin: TestAdmin) =>
  callRoute(getClassificationRoute, {
    method: "GET",
    url: "/api/v1/admin/classification",
    cookieHeader: admin.cookieHeader,
  });

async function classificationOf(admin: TestAdmin): Promise<ClassificationDto> {
  const res = await getClassification(admin);
  expect(res.status).toBe(200);
  return (await res.json()) as ClassificationDto;
}

const patchRespondent = (admin: TestAdmin, respondentId: string, body: unknown) =>
  callRoute(patchRespondentRoute, {
    method: "PATCH",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    body,
    cookieHeader: admin.cookieHeader,
  });

const resultIdsOf = (dto: { readonly people: readonly { readonly resultId: string }[] }) =>
  dto.people.map((person) => person.resultId);

function personOf(dto: EmploymentDto, resultId: string): EmploymentPersonDto {
  const person = dto.people.find((p) => p.resultId === resultId);
  if (person === undefined) throw new Error(`人がいない: ${resultId}`);
  return person;
}

/** 組織の監査ログ（action を渡せばその action だけ） */
async function auditLogsOf(organizationId: string, action?: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((doc) => doc.data)
    .filter(
      (data) =>
        data.organizationId === organizationId && (action === undefined || data.action === action),
    );
}

/** 応答の 1 人のキー（11-3 §3.3 の順。ちょうど 10 個で、電話番号は返さない） */
const PERSON_KEYS = [
  "resultId",
  "respondentId",
  "aptitudeType",
  "name",
  "occupationLabel",
  "teamCode",
  "submittedAt",
  "employmentStatus",
  "hiredOn",
  "leftOn",
];
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("M7-zaiseki-26 GET /admin/employment の人と項目・基準日（11-3 §3.3）", () => {
  let owner: TestAdmin;
  let admin: TestAdmin;
  const applicants: Submitted[] = [];
  let staff: Submitted;

  beforeAll(async () => {
    let org: TestOrganization;
    ({ org, owner } = await createOrganizationWithOwner("在籍の人サロン"));
    admin = await createAdmin(org, "admin");
    // 送信の順: 求職者 1 → 既存スタッフ → 求職者 2 → 求職者 3
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(1), {
        name: "テストテスト 01",
        phoneNumber: "000-0000-2001",
        occupationCode: 1,
      }),
    );
    staff = await submitAnswerSet(org, uniformAnswers(4), {
      kind: "executive",
      name: "テストテスト 02",
      phoneNumber: "000-0000-2002",
      occupationCode: 10,
    });
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(3), {
        name: "テストテスト 03",
        phoneNumber: "000-0000-2003",
      }),
    );
    applicants.push(
      await submitAnswerSet(org, cyclicAnswers(), {
        name: "テストテスト 04",
        phoneNumber: "000-0000-2004",
      }),
    );
    // 区分・入社日・退職日とチームは、画面と同じ PATCH で変える
    for (const [respondentId, body] of [
      [
        applicants[0]!.respondentId,
        { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" } },
      ],
      [
        staff.respondentId,
        { employment: { status: "employed", hiredOn: "2020-04-01", leftOn: null } },
      ],
      [applicants[1]!.respondentId, { teamCode: "A" }],
    ] as const) {
      expect((await patchRespondent(owner, respondentId, body)).status).toBe(200);
    }
  });

  it("オーナー: 求職者 3・既存スタッフ 1 の 4 人を、代表の submittedAt の降順に返す。応答のキーは today と people だけ", async () => {
    const dto = await employmentOf(owner);
    expect(Object.keys(dto)).toEqual(["today", "people"]);
    expect(resultIdsOf(dto)).toEqual([
      applicants[2]!.resultId,
      applicants[1]!.resultId,
      staff.resultId,
      applicants[0]!.resultId,
    ]);
    const submitted = dto.people.map((person) => Date.parse(person.submittedAt));
    expect(submitted).toEqual([...submitted].sort((a, b) => b - a));
  });

  it("オーナー以外: 既存スタッフの人が無い 3 人（K-29）", async () => {
    const dto = await employmentOf(admin);
    expect(resultIdsOf(dto)).toEqual([
      applicants[2]!.resultId,
      applicants[1]!.resultId,
      applicants[0]!.resultId,
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(staff.resultId);
    expect(json).not.toContain(staff.respondentId);
    expect(json).not.toContain("テストテスト 02");
  });

  it("各人のキーはちょうど 10 個（respondentId・hiredOn・leftOn があり、phoneNumber が無い）。タイプ・区分・入社日・退職日・受験日は代表の受験、氏名・職業・チームは代表の受検者の値", async () => {
    const dto = await employmentOf(owner);
    for (const person of dto.people) {
      expect(Object.keys(person), person.resultId).toEqual(PERSON_KEYS);
      const result = await getDocForTest<{
        respondentId: string;
        aptitudeType: string;
        submittedAt: Timestamp;
        employmentStatus: string;
        hiredOn: string | null;
        leftOn: string | null;
      }>(COLLECTIONS.results, person.resultId);
      expect(person).toMatchObject({
        respondentId: result!.respondentId,
        aptitudeType: result!.aptitudeType,
        employmentStatus: result!.employmentStatus,
        hiredOn: result!.hiredOn,
        leftOn: result!.leftOn,
      });
      expect(person.submittedAt).toMatch(ISO_8601);
      expect(person.submittedAt).toBe(result!.submittedAt.toDate().toISOString());
    }
    expect(personOf(dto, applicants[0]!.resultId)).toMatchObject({
      respondentId: applicants[0]!.respondentId,
      name: "テストテスト 01",
      occupationLabel: "アイリスト",
      teamCode: null,
      employmentStatus: "left", // PATCH で退職にした
      hiredOn: "2025-04-01",
      leftOn: "2026-10-31",
    });
    expect(personOf(dto, staff.resultId)).toMatchObject({
      respondentId: staff.respondentId,
      name: "テストテスト 02",
      occupationLabel: "責任者", // 職業コード 10（K-21）
      employmentStatus: "employed", // 既存スタッフ用リンクの受験は在籍（K-28）
      hiredOn: "2020-04-01",
      leftOn: null,
    });
    expect(personOf(dto, applicants[1]!.resultId)).toMatchObject({
      name: "テストテスト 03",
      occupationLabel: "アイリスト（アシスタント・見習い）",
      teamCode: "A",
      employmentStatus: "candidate", // 求職者用リンクの受験は求職者（K-28）
      hiredOn: null,
      leftOn: null,
    });
    // 電話番号は返さない（在籍・退職の画面に出さない）
    const json = JSON.stringify(dto);
    expect(json).not.toContain("phoneNumber");
    expect(json).not.toContain("000-0000-");
  });

  it("人の集合と順（resultId の並び）が、同じ管理者の GET /admin/classification と一致する（オーナーとオーナー以外）", async () => {
    for (const viewer of [owner, admin]) {
      const employment = await employmentOf(viewer);
      const classification = await classificationOf(viewer);
      expect(resultIdsOf(employment)).toEqual(resultIdsOf(classification));
      for (const person of classification.people) {
        expect(personOf(employment, person.resultId)).toMatchObject({
          aptitudeType: person.aptitudeType,
          name: person.name,
          occupationLabel: person.occupationLabel,
          teamCode: person.teamCode,
          submittedAt: person.submittedAt,
          employmentStatus: person.employmentStatus,
        });
      }
    }
  });

  it("today は Asia/Tokyo の日付: now が UTC 14:59 なら当日、15:00 なら翌日（getEmployment(ctx, now)）。API は今の時刻の日付", async () => {
    const request = new Request("http://localhost:3000/api/v1/admin/employment", {
      headers: { cookie: owner.cookieHeader },
    });
    const ctx = await requireAdmin(request);
    const before = await getEmploymentService(ctx, new Date("2026-11-05T14:59:00.000Z"));
    const after = await getEmploymentService(ctx, new Date("2026-11-05T15:00:00.000Z"));
    expect(before.today).toBe("2026-11-05");
    expect(after.today).toBe("2026-11-06");
    expect(after.people).toEqual(before.people); // 基準日のほかは変わらない

    const started = todayInTokyo(new Date());
    const dto = await employmentOf(owner);
    const ended = todayInTokyo(new Date());
    expect(dto.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([started, ended]).toContain(dto.today);
  });
});

describe("M7-zaiseki-27 クエリ・認可・組織の分離（在籍・退職の分。I-03 の拡張）", () => {
  let orgA: TestOrganization;
  let ownerA: TestAdmin;
  let ownerB: TestAdmin;
  let kept: Submitted;
  let other: Submitted; // 組織 B の受験

  beforeAll(async () => {
    ({ org: orgA, owner: ownerA } = await createOrganizationWithOwner("在籍の認可サロン"));
    kept = await submitAnswerSet(orgA, uniformAnswers(2), {
      name: "テストテスト 21",
      phoneNumber: "000-0000-2021",
    });
    const excluded = await submitAnswerSet(orgA, uniformAnswers(3), {
      name: "テストテスト 22",
      phoneNumber: "000-0000-2022",
    });
    expect(
      (await patchRespondent(ownerA, excluded.respondentId, { isExcluded: true })).status,
    ).toBe(200);
    let orgB: TestOrganization;
    ({ org: orgB, owner: ownerB } = await createOrganizationWithOwner("在籍の別組織サロン"));
    other = await submitAnswerSet(orgB, uniformAnswers(4), {
      name: "テストテスト 23",
      phoneNumber: "000-0000-2023",
    });
  });

  it("クエリ（?includeExcluded=true&tab=left など）を付けても 200 で、クエリなしと同じ人（除外した人は入らない）。クエリで基準日は変わらない", async () => {
    const started = todayInTokyo(new Date());
    const plain = await employmentOf(ownerA);
    expect(resultIdsOf(plain)).toEqual([kept.resultId]);
    for (const query of [
      "?includeExcluded=true&tab=left",
      "?includeExcluded=yes",
      "?team=Z&today=2000-01-01",
    ]) {
      const dto = await employmentOf(ownerA, query);
      expect(dto.people, query).toEqual(plain.people);
      expect([started, todayInTokyo(new Date())], query).toContain(dto.today);
    }
  });

  it("Cookie なしは 401 UNAUTHENTICATED。停止中の管理者（例外: adminUsers の isSuspended の直接書き込み。claims.test.ts と同じ作り）は 403 ADMIN_SUSPENDED", async () => {
    const unauthenticated = await getEmployment(null);
    expect(unauthenticated.status).toBe(401);
    expect(await errorCode(unauthenticated)).toBe("UNAUTHENTICATED");

    const suspended = await createAdmin(orgA, "admin");
    expect((await getEmployment(suspended)).status).toBe(200);
    await writeDocForTest(COLLECTIONS.adminUsers, suspended.uid, { isSuspended: true });
    const forbidden = await getEmployment(suspended);
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe("ADMIN_SUSPENDED");
  });

  it("組織 A の Cookie の応答に組織 B の受験と氏名が入らない（逆も同じ）", async () => {
    const byA = JSON.stringify(await employmentOf(ownerA));
    expect(byA).not.toContain(other.resultId);
    expect(byA).not.toContain(other.respondentId);
    expect(byA).not.toContain("テストテスト 23");
    const byB = await employmentOf(ownerB);
    expect(resultIdsOf(byB)).toEqual([other.resultId]);
    const json = JSON.stringify(byB);
    expect(json).not.toContain(kept.resultId);
    expect(json).not.toContain("テストテスト 21");
  });
});

describe("M7-zaiseki-28 監査ログ employment.view（在籍・退職の分。I-31 の改め）", () => {
  it("1 回の GET で 1 件（ほかの監査ログは書かない）。details は { count } だけで、値は人数（受験の件数と違う）。氏名・電話番号・日付を含まない", async () => {
    const { org, owner } = await createOrganizationWithOwner("在籍の監査サロン");
    // 受験 4 件（除外 1・1 回だけ 1・つながり 2 件）で、人は 2 人
    const excluded = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 31",
      phoneNumber: "000-0000-2031",
    });
    await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 32",
      phoneNumber: "000-0000-2032",
    });
    const first = await submitAnswerSet(org, uniformAnswers(3), {
      name: "テストテスト 33",
      phoneNumber: "000-0000-2033",
    });
    const retake = await submitAnswerSet(org, uniformAnswers(5), {
      previousResultId: first.resultId,
      name: "テストテスト 33",
      phoneNumber: "000-0000-2033",
    });
    expect((await patchRespondent(owner, excluded.respondentId, { isExcluded: true })).status).toBe(
      200,
    );
    expect(
      (
        await patchRespondent(owner, retake.respondentId, {
          employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" },
        })
      ).status,
    ).toBe(200);
    expect(await auditLogsOf(org.organizationId, "employment.view")).toEqual([]);
    const before = (await auditLogsOf(org.organizationId)).length;

    const dto = await employmentOf(owner);
    expect(dto.people).toHaveLength(2);
    expect(
      await countDocs(COLLECTIONS.results, [
        ["organizationId", "==", org.organizationId],
        ["deletedAt", "==", null],
      ]),
    ).toBe(4);
    expect(await auditLogsOf(org.organizationId)).toHaveLength(before + 1);
    const logs = await auditLogsOf(org.organizationId, "employment.view");
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log).toMatchObject({
      actorKind: "admin",
      actorUid: owner.uid,
      actorRole: "owner",
      targetCollection: COLLECTIONS.results,
      targetId: null,
    });
    expect(log!.details).toEqual({ count: 2 });
    const json = JSON.stringify(log);
    for (const secret of ["テストテスト", "000-0000-", "2025-04-01", "2026-10-31", dto.today]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe("M7-zaiseki-29 区分・入社日・退職日の保存（11-2 の PATCH）が在籍・退職と組織内分類に出る（在籍・退職の分）", () => {
  let org: TestOrganization;
  let owner: TestAdmin;
  let admin: TestAdmin;
  let first: Submitted; // 1 回目（求職者用リンク）
  let retake: Submitted; // 再受験（前回 = first。既存スタッフ扱い）
  let candidate: Submitted; // 1 回だけ受けた求職者

  beforeAll(async () => {
    ({ org, owner } = await createOrganizationWithOwner("在籍の保存サロン"));
    admin = await createAdmin(org, "admin");
    first = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 41",
      phoneNumber: "000-0000-2041",
    });
    retake = await submitAnswerSet(org, uniformAnswers(4), {
      previousResultId: first.resultId,
      name: "テストテスト 41",
      phoneNumber: "000-0000-2041",
    });
    candidate = await submitAnswerSet(org, uniformAnswers(3), {
      name: "テストテスト 42",
      phoneNumber: "000-0000-2042",
    });
  });

  it("在籍・退職の人の respondentId（代表の受検者）に送ると 200 で、つながった 2 件の受験の区分・入社日・退職日が同じ値になり、次の GET /admin/employment と GET /admin/classification に出る。受験ごとに result.update_employment", async () => {
    const before = await employmentOf(owner);
    expect(resultIdsOf(before)).toEqual([candidate.resultId, retake.resultId]); // 前回は人にならない
    const person = personOf(before, retake.resultId);
    expect(person).toMatchObject({
      respondentId: retake.respondentId,
      employmentStatus: "employed", // 再受験は在籍（K-28）
      hiredOn: null,
      leftOn: null,
    });

    const employment: Employment = { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" };
    expect((await patchRespondent(owner, person.respondentId, { employment })).status).toBe(200);
    for (const exam of [first, retake]) {
      const result = await getDocForTest(COLLECTIONS.results, exam.resultId);
      expect(result, exam.resultId).toMatchObject({
        employmentStatus: "left",
        hiredOn: "2025-04-01",
        leftOn: "2026-10-31",
      });
    }
    expect(personOf(await employmentOf(owner), retake.resultId)).toMatchObject({
      employmentStatus: "left",
      hiredOn: "2025-04-01",
      leftOn: "2026-10-31",
    });
    const classified = (await classificationOf(owner)).people.find(
      (p) => p.resultId === retake.resultId,
    );
    expect(classified?.employmentStatus).toBe("left");
    // オーナー以外の管理者には再受験（既存スタッフ）が見えず、前回が人になる。前回にも同じ値が書かれている
    expect(personOf(await employmentOf(admin), first.resultId)).toMatchObject({
      employmentStatus: "left",
      hiredOn: "2025-04-01",
      leftOn: "2026-10-31",
    });

    const logs = await auditLogsOf(org.organizationId, "result.update_employment");
    expect(logs.map((log) => log.targetId).sort()).toEqual(
      [first.resultId, retake.resultId].sort(),
    );
    for (const log of logs) {
      expect(log.details).toMatchObject({
        after: "left",
        hiredOnAfter: "2025-04-01",
        leftOnAfter: "2026-10-31",
      });
    }
  });

  it("退職日 < 入社日は 422 LEFT_BEFORE_HIRED、区分が退職でない退職日と範囲の外・実在しない日（1899-12-31・2101-01-01・2026-02-30）は 422 VALIDATION_ERROR（日付の検査のサーバ側）で、どれも書き込みが無い", async () => {
    const target = personOf(await employmentOf(owner), candidate.resultId);
    const before = await getDocForTest<{ updatedAt: Timestamp }>(
      COLLECTIONS.results,
      candidate.resultId,
    );
    const cases: Array<[Employment, string]> = [
      [{ status: "left", hiredOn: "2026-04-01", leftOn: "2025-04-01" }, "LEFT_BEFORE_HIRED"],
      [{ status: "employed", hiredOn: null, leftOn: "2026-10-31" }, "VALIDATION_ERROR"],
      [{ status: "candidate", hiredOn: "2025-04-01", leftOn: "2026-10-31" }, "VALIDATION_ERROR"],
    ];
    for (const date of ["1899-12-31", "2101-01-01", "2026-02-30"]) {
      cases.push(
        [{ status: "employed", hiredOn: date, leftOn: null }, "VALIDATION_ERROR"],
        [{ status: "left", hiredOn: null, leftOn: date }, "VALIDATION_ERROR"],
        [{ status: "left", hiredOn: "2025-04-01", leftOn: date }, "VALIDATION_ERROR"],
      );
    }
    for (const [employment, code] of cases) {
      const res = await patchRespondent(owner, target.respondentId, { employment });
      expect(res.status, JSON.stringify(employment)).toBe(422);
      expect(await errorCode(res), JSON.stringify(employment)).toBe(code);
    }
    const after = await getDocForTest<{ updatedAt: Timestamp }>(
      COLLECTIONS.results,
      candidate.resultId,
    );
    expect(after!.updatedAt.isEqual(before!.updatedAt)).toBe(true);
    expect(after).toMatchObject({ employmentStatus: "candidate", hiredOn: null, leftOn: null });
    const logs = await auditLogsOf(org.organizationId, "result.update_employment");
    expect(logs.filter((log) => log.targetId === candidate.resultId)).toEqual([]);
    expect(personOf(await employmentOf(owner), candidate.resultId)).toMatchObject({
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
    });
  });

  it("オーナー以外の管理者も、見えている人（求職者）の区分・入社日を変えられる（役割の条件は無い。11-3 §2.15）", async () => {
    const person = personOf(await employmentOf(admin), candidate.resultId);
    expect(person.employmentStatus).toBe("candidate");
    const res = await patchRespondent(admin, person.respondentId, {
      employment: { status: "employed", hiredOn: "2026-04-01", leftOn: null },
    });
    expect(res.status).toBe(200);
    for (const viewer of [admin, owner]) {
      expect(personOf(await employmentOf(viewer), candidate.resultId)).toMatchObject({
        employmentStatus: "employed",
        hiredOn: "2026-04-01",
        leftOn: null,
      });
    }
  });
});

describe("PF-10 在籍・退職の応答時間と、変更の保存の後の読み直しの時間（1,000 件。ローカル Emulator。M7-zaiseki-46 の在籍・退職の分）", () => {
  it(
    "例外（直接書き込み: 受験 1,000 件とその受検者。200 人は 2 回受けたつながり、40 人は除外、一部に区分と入社日・退職日）: GET /admin/employment と、PATCH employment の後の GET /admin/employment の時間を記録する",
    { timeout: 180_000 },
    async () => {
      const { org, owner } = await createOrganizationWithOwner("在籍の性能計測サロン");
      const score = toResultDocFields(scoreAnswers(cyclicAnswers()));
      const base = Date.parse("2026-01-01T00:00:00.000Z");
      const total = 1000;
      const ids = Array.from({ length: total }, (_, i) => ({
        respondentId: `PfEmpRespondent${String(i).padStart(5, "0")}`,
        sessionId: `PfEmpSession${String(i).padStart(5, "0")}`,
        resultId: `PfEmpResult${String(i).padStart(5, "0")}`,
      }));
      /**
       * 区分と暦日。つながりの再受験（既存スタッフ扱い）は在籍、ほかは求職者。10 件ごとに 3 件（i % 10 が 0〜2）を退職で
       * 入社日・退職日あり、2 件（5・6）を在籍で入社日ありにする（3・8 はつながりの前回、4・9 は再受験、7 は求職者のまま）
       */
      const employmentFields = (i: number, kind: "applicant" | "executive") => {
        const hiredOn = `${2015 + (i % 10)}-04-01`;
        if (kind === "executive") {
          return { employmentStatus: "employed", hiredOn: null, leftOn: null };
        }
        if (i % 10 <= 2) {
          return { employmentStatus: "left", hiredOn, leftOn: "2026-03-31" };
        }
        if (i % 10 === 5 || i % 10 === 6) {
          return { employmentStatus: "employed", hiredOn, leftOn: null };
        }
        return { employmentStatus: "candidate", hiredOn: null, leftOn: null };
      };
      let previousCount = 0;
      const excludedPeople = new Set<number>(); // 除外した人（つながりは代表の番号で数える）
      const writes: Array<() => Promise<void>> = [];
      ids.forEach((id, i) => {
        // 5 件ごとに 1 件を、1 つ前の受験の再受験にする（200 人が 2 回）
        const previousResultId = i % 5 === 4 ? ids[i - 1]!.resultId : null;
        if (previousResultId !== null) previousCount += 1;
        // 50 件ごとに、1 回だけの人 1 人（i % 50 === 0）とつながった人 1 人（i % 50 === 3・4 の 2 件）を除外する
        // （回答一覧の除外はつながった全受験に書くので、つながりは 2 件とも除外する）
        const isExcluded = i % 50 === 0 || i % 50 === 3 || i % 50 === 4;
        if (i % 50 === 0 || i % 50 === 4) excludedPeople.add(i);
        const kind = previousResultId === null ? "applicant" : "executive";
        const submittedAt = Timestamp.fromMillis(base + i * 60_000);
        writes.push(() =>
          writeDocForTest(COLLECTIONS.respondents, id.respondentId, {
            organizationId: org.organizationId,
            kind,
            name: `テストテスト 計測 ${i}`,
            phoneNumber: "000-0000-0000",
            occupationCode: 2,
            diagnosisExperience: "first_time",
            teamCode: null,
            isExcluded,
            sessionId: id.sessionId,
            usageLogId: null,
            resultId: id.resultId,
            previousResultId,
            createdAt: submittedAt,
            updatedAt: submittedAt,
            deletedAt: null,
          }),
        );
        writes.push(() =>
          writeDocForTest(COLLECTIONS.results, id.resultId, {
            ...score,
            organizationId: org.organizationId,
            respondentId: id.respondentId,
            sessionId: id.sessionId,
            respondentKind: kind,
            teamCode: null,
            isExcluded,
            submittedAt,
            aiGenerationStatus: "not_generated",
            aiGenerationStartedAt: null,
            aiGenerationError: null,
            latestAiAnalysisId: null,
            ...employmentFields(i, kind),
            staffRole: null,
            previousResultId,
            trainingAiStatus: "not_generated",
            trainingAiStartedAt: null,
            trainingAiError: null,
            latestTrainingAiAnalysisId: null,
            trainingContext: null,
            longitudinalAiStatus: "not_generated",
            longitudinalAiStartedAt: null,
            longitudinalAiError: null,
            latestLongitudinalAiAnalysisId: null,
            createdAt: submittedAt,
            updatedAt: submittedAt,
            deletedAt: null,
          }),
        );
      });
      for (let i = 0; i < writes.length; i += 100) {
        await Promise.all(writes.slice(i, i + 100).map((write) => write()));
      }
      // 人数 = 受験の件数 − 前回の件数 − 除外の人
      expect([previousCount, excludedPeople.size]).toEqual([200, 40]);
      const expectedPeople = total - previousCount - excludedPeople.size;

      // 1. 在籍・退職の表示（GET を 3 回）
      const viewMs: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const started = performance.now();
        const dto = await employmentOf(owner);
        viewMs.push(performance.now() - started);
        expect(dto.people).toHaveLength(expectedPeople);
      }

      // 2. 変更ダイアログの保存（つながった人 1 人への PATCH）と、そのあとの読み直し（GET）を 1 組として 3 回
      const target = ids[9]!; // 前回（ids[8]）とつながった再受験。除外していない
      const rounds: readonly Employment[] = [
        { status: "left", hiredOn: "2024-04-01", leftOn: "2026-03-31" },
        { status: "employed", hiredOn: "2023-04-01", leftOn: null },
        { status: "candidate", hiredOn: null, leftOn: null },
      ];
      const saveMs: number[] = [];
      for (const employment of rounds) {
        const started = performance.now();
        const res = await patchRespondent(owner, target.respondentId, { employment });
        expect(res.status, JSON.stringify(employment)).toBe(200);
        const dto = await employmentOf(owner);
        saveMs.push(performance.now() - started);
        expect(dto.people).toHaveLength(expectedPeople);
        expect(personOf(dto, target.resultId)).toMatchObject({
          employmentStatus: employment.status,
          hiredOn: employment.hiredOn,
          leftOn: employment.leftOn,
        });
      }

      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      const summary = (xs: number[]) =>
        `median ${median(xs).toFixed(0)} ms, max ${Math.max(...xs).toFixed(0)} ms`;
      // eslint-disable-next-line no-console -- PF-10 の計測値をテストログに残す（08 §3.9）。目安の値は無いので閾値は置かない
      console.info(
        `PF-10 GET /admin/employment（1,000 件・${expectedPeople} 人）: ${summary(viewMs)}`,
      );
      // eslint-disable-next-line no-console -- 同上（変更ダイアログの保存と読み直し）
      console.info(
        `PF-10 PATCH /admin/respondents/{id}（employment）と GET /admin/employment（1,000 件・${expectedPeople} 人）: ${summary(saveMs)}`,
      );
    },
  );
});
