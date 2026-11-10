// M7-zaiseki-24・25・27〜30 組織内分類の API（11-3 §2.2・§3.2・§3.5・§5.2）と PF-09（1,000 件の組織内分類の時間。
// M7-zaiseki-46 の組織内分類の分。08 §3.9）。人は受検者 API（登録→保存→送信）で作り、つながりは再受験リンク
// （previousResultId）で作る（再受験は既存スタッフ扱い。K-39 Q-33）。API では作れない次のものは、08 D08-18 の例外として
// 直接書き込みで作り、テスト名に書く: 受検者の文書が使えない代表（論理削除・別の組織）と未知の職業コード・16 タイプに無い
// タイプ（M7-zaiseki-30）、管理者の停止（M7-zaiseki-27。claims.test.ts と同じ作り）、PF-09 の受験 1,000 件とその受検者
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as getClassificationRoute } from "@/app/api/v1/admin/classification/route";
import {
  DELETE as deleteRespondentRoute,
  PATCH as patchRespondentRoute,
} from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ClassificationDto, ResultListDto } from "@/lib/services/dto/admin";
import { logger } from "@/lib/utils/logger";

import {
  createAdmin,
  createOrganizationWithOwner,
  createTestOrganization,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

type Submitted = Awaited<ReturnType<typeof submitAnswerSet>>;

const getClassification = (admin: TestAdmin | null, query = "") =>
  callRoute(getClassificationRoute, {
    method: "GET",
    url: `/api/v1/admin/classification${query}`,
    ...(admin === null ? {} : { cookieHeader: admin.cookieHeader }),
  });

async function classificationOf(admin: TestAdmin, query = ""): Promise<ClassificationDto> {
  const res = await getClassification(admin, query);
  expect(res.status).toBe(200);
  return (await res.json()) as ClassificationDto;
}

const resultIdsOf = (dto: ClassificationDto) => dto.people.map((person) => person.resultId);

const patchRespondent = (admin: TestAdmin, respondentId: string, body: unknown) =>
  callRoute(patchRespondentRoute, {
    method: "PATCH",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    body,
    cookieHeader: admin.cookieHeader,
  });

const deleteRespondent = (admin: TestAdmin, respondentId: string) =>
  callRoute(deleteRespondentRoute, {
    method: "DELETE",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    cookieHeader: admin.cookieHeader,
  });

/** 応答の 1 人のキー（11-3 §3.2。受検者 ID・入社日・退職日は返さない） */
const PERSON_KEYS = [
  "aptitudeType",
  "employmentStatus",
  "name",
  "occupationLabel",
  "phoneNumber",
  "resultId",
  "submittedAt",
  "teamCode",
];
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("M7-zaiseki-24 GET /admin/classification の人と項目（I-22 の改め）", () => {
  let org: TestOrganization;
  let owner: TestAdmin;
  let admin: TestAdmin;
  const applicants: Submitted[] = [];
  let staff: Submitted;

  beforeAll(async () => {
    ({ org, owner } = await createOrganizationWithOwner("分類の人サロン"));
    admin = await createAdmin(org, "admin");
    // 送信の順: 求職者 1 → 既存スタッフ → 求職者 2 → 求職者 3
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(1), {
        name: "テストテスト 01",
        phoneNumber: "000-0000-1001",
        occupationCode: 1,
      }),
    );
    staff = await submitAnswerSet(org, uniformAnswers(4), {
      kind: "executive",
      name: "テストテスト 02",
      phoneNumber: "000-0000-1002",
      occupationCode: 10,
    });
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(3), {
        name: "テストテスト 03",
        phoneNumber: "000-0000-1003",
      }),
    );
    applicants.push(
      await submitAnswerSet(org, cyclicAnswers(), {
        name: "テストテスト 04",
        phoneNumber: "000-0000-1004",
      }),
    );
    expect(
      (await patchRespondent(owner, applicants[1]!.respondentId, { teamCode: "A" })).status,
    ).toBe(200);
  });

  it("オーナー: 求職者 3・既存スタッフ 1 の 4 人を、代表の submittedAt の降順に返す", async () => {
    const dto = await classificationOf(owner);
    expect(Object.keys(dto)).toEqual(["people"]);
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
    const dto = await classificationOf(admin);
    expect(resultIdsOf(dto)).toEqual([
      applicants[2]!.resultId,
      applicants[1]!.resultId,
      applicants[0]!.resultId,
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(staff.resultId);
    expect(json).not.toContain("テストテスト 02");
  });

  it("各人の項目はちょうど 8 つ。タイプ・区分・受験日は代表の受験、氏名・電話番号・職業・チームは代表の受検者の値", async () => {
    const dto = await classificationOf(owner);
    for (const person of dto.people) {
      expect(Object.keys(person).sort(), person.resultId).toEqual(PERSON_KEYS);
      const result = await getDocForTest<{ aptitudeType: string; submittedAt: Timestamp }>(
        COLLECTIONS.results,
        person.resultId,
      );
      expect(person.aptitudeType).toBe(result!.aptitudeType);
      expect(person.submittedAt).toMatch(ISO_8601);
      expect(person.submittedAt).toBe(result!.submittedAt.toDate().toISOString());
    }
    const byId = new Map(dto.people.map((person) => [person.resultId, person]));
    expect(byId.get(applicants[0]!.resultId)).toMatchObject({
      name: "テストテスト 01",
      phoneNumber: "000-0000-1001",
      occupationLabel: "アイリスト",
      teamCode: null,
      employmentStatus: "candidate", // 求職者用リンクの受験は求職者（K-28）
    });
    expect(byId.get(staff.resultId)).toMatchObject({
      name: "テストテスト 02",
      phoneNumber: "000-0000-1002",
      occupationLabel: "責任者", // 職業コード 10（K-21）
      teamCode: null,
      employmentStatus: "employed", // 既存スタッフ用リンクの受験は在籍（K-28）
    });
    expect(byId.get(applicants[1]!.resultId)).toMatchObject({
      name: "テストテスト 03",
      phoneNumber: "000-0000-1003",
      occupationLabel: "アイリスト（アシスタント・見習い）",
      teamCode: "A",
      employmentStatus: "candidate",
    });
    // 受検者 ID は返さない
    const json = JSON.stringify(dto);
    for (const submitted of [...applicants, staff]) {
      expect(json).not.toContain(submitted.respondentId);
    }
  });
});

describe("M7-zaiseki-25 除外・再受験のつながり・論理削除（K-39 Q-24・Q-10・Q-35、K-29）", () => {
  let owner: TestAdmin;
  let admin: TestAdmin;
  let excluded: Submitted; // 集計から除外した人
  let single: Submitted; // 1 回だけ受けた人
  let p1: Submitted; // P の 1 回目（求職者用リンク）
  let p2: Submitted; // P の再受験（前回 = p1。既存スタッフ扱い）
  let q1: Submitted; // Q の 1 回目
  let q2: Submitted; // Q の再受験（前回 = q1）

  beforeAll(async () => {
    let org: TestOrganization;
    ({ org, owner } = await createOrganizationWithOwner("分類の数え方サロン"));
    admin = await createAdmin(org, "admin");
    // 送信の順: 除外する人 → 1 回だけの人 → P の 1 回目 → Q の 1 回目 → P の再受験 → Q の再受験
    excluded = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 11",
      phoneNumber: "000-0000-1011",
    });
    single = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 12",
      phoneNumber: "000-0000-1012",
    });
    p1 = await submitAnswerSet(org, uniformAnswers(3), {
      name: "テストテスト 13",
      phoneNumber: "000-0000-1013",
    });
    q1 = await submitAnswerSet(org, uniformAnswers(4), {
      name: "テストテスト 14",
      phoneNumber: "000-0000-1014",
    });
    p2 = await submitAnswerSet(org, uniformAnswers(5), {
      previousResultId: p1.resultId,
      name: "テストテスト 13",
      phoneNumber: "000-0000-1013",
    });
    q2 = await submitAnswerSet(org, cyclicAnswers(), {
      previousResultId: q1.resultId,
      name: "テストテスト 14",
      phoneNumber: "000-0000-1014",
    });
    expect((await patchRespondent(owner, excluded.respondentId, { isExcluded: true })).status).toBe(
      200,
    );
  });

  it("「集計から除外」した人は数えない。回答一覧には除外中の行として出る（違いは除外の扱いだけ。zaiseki-M1）", async () => {
    for (const viewer of [owner, admin]) {
      expect(resultIdsOf(await classificationOf(viewer))).not.toContain(excluded.resultId);
    }
    const res = await callRoute(listResultsRoute, {
      method: "GET",
      url: "/api/v1/admin/results",
      cookieHeader: owner.cookieHeader,
    });
    const list = (await res.json()) as ResultListDto;
    expect(list.rows.find((row) => row.resultId === excluded.resultId)?.isExcluded).toBe(true);
  });

  it("再受験の前回は数えない（オーナーは再受験だけ）。オーナー以外は再受験（既存スタッフ）が見えず、前回が 1 人", async () => {
    expect(resultIdsOf(await classificationOf(owner))).toEqual([
      q2.resultId,
      p2.resultId,
      single.resultId,
    ]);
    expect(resultIdsOf(await classificationOf(admin))).toEqual([
      q1.resultId,
      p1.resultId,
      single.resultId,
    ]);
  });

  it("代表（P の再受験）の受検者を論理削除すると、前回が人として入る", async () => {
    expect((await deleteRespondent(owner, p2.respondentId)).status).toBe(204);
    const dto = await classificationOf(owner);
    expect(resultIdsOf(dto)).toEqual([q2.resultId, p1.resultId, single.resultId]);
    expect(dto.people[1]).toMatchObject({ name: "テストテスト 13", employmentStatus: "candidate" });
  });

  it("前回（Q の 1 回目）の受検者を論理削除しても、代表は入る（Q-35）。オーナー以外の応答からは前回が消える", async () => {
    expect((await deleteRespondent(owner, q1.respondentId)).status).toBe(204);
    expect(resultIdsOf(await classificationOf(owner))).toEqual([
      q2.resultId,
      p1.resultId,
      single.resultId,
    ]);
    expect(resultIdsOf(await classificationOf(admin))).toEqual([p1.resultId, single.resultId]);
  });
});

describe("M7-zaiseki-27 クエリ・認可・組織の分離（組織内分類の分。I-03 の拡張）", () => {
  let orgA: TestOrganization;
  let ownerA: TestAdmin;
  let ownerB: TestAdmin;
  let kept: Submitted;
  let excluded: Submitted;
  let other: Submitted; // 組織 B の受験

  beforeAll(async () => {
    ({ org: orgA, owner: ownerA } = await createOrganizationWithOwner("分類の認可サロン"));
    kept = await submitAnswerSet(orgA, uniformAnswers(2), {
      name: "テストテスト 21",
      phoneNumber: "000-0000-1021",
    });
    excluded = await submitAnswerSet(orgA, uniformAnswers(3), {
      name: "テストテスト 22",
      phoneNumber: "000-0000-1022",
    });
    expect(
      (await patchRespondent(ownerA, excluded.respondentId, { isExcluded: true })).status,
    ).toBe(200);
    let orgB: TestOrganization;
    ({ org: orgB, owner: ownerB } = await createOrganizationWithOwner("分類の別組織サロン"));
    other = await submitAnswerSet(orgB, uniformAnswers(4), {
      name: "テストテスト 23",
      phoneNumber: "000-0000-1023",
    });
  });

  it("includeExcluded=false・includeExcluded=yes を付けても 200 で、クエリなしと同じ応答（除外した人は入らない）", async () => {
    const plain = await classificationOf(ownerA);
    expect(resultIdsOf(plain)).toEqual([kept.resultId]);
    for (const query of ["?includeExcluded=false", "?includeExcluded=yes"]) {
      expect(await classificationOf(ownerA, query), query).toEqual(plain);
    }
  });

  it("Cookie なしは 401 UNAUTHENTICATED。停止中の管理者（例外: adminUsers の isSuspended の直接書き込み。claims.test.ts と同じ作り）は 403 ADMIN_SUSPENDED", async () => {
    const unauthenticated = await getClassification(null);
    expect(unauthenticated.status).toBe(401);
    expect(await errorCode(unauthenticated)).toBe("UNAUTHENTICATED");

    const suspended = await createAdmin(orgA, "admin");
    expect((await getClassification(suspended)).status).toBe(200);
    await writeDocForTest(COLLECTIONS.adminUsers, suspended.uid, { isSuspended: true });
    const forbidden = await getClassification(suspended);
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe("ADMIN_SUSPENDED");
  });

  it("組織 A の Cookie の応答に組織 B の受験が入らない（逆も同じ）", async () => {
    const byA = JSON.stringify(await classificationOf(ownerA));
    expect(byA).not.toContain(other.resultId);
    expect(byA).not.toContain("テストテスト 23");
    const byB = await classificationOf(ownerB);
    expect(resultIdsOf(byB)).toEqual([other.resultId]);
    expect(JSON.stringify(byB)).not.toContain(kept.resultId);
  });
});

describe("M7-zaiseki-28 監査ログ classification.view（組織内分類の分。I-31 の改め）", () => {
  it("1 回の GET で 1 件。details は { count } だけで、値は人数（受験の件数と違う）。氏名・電話番号・日付を含まない", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類の監査サロン");
    // 受験 4 件（除外 1・1 回だけ 1・つながり 2 件）で、人は 2 人
    const excluded = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 31",
      phoneNumber: "000-0000-1031",
    });
    await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 32",
      phoneNumber: "000-0000-1032",
    });
    const first = await submitAnswerSet(org, uniformAnswers(3), {
      name: "テストテスト 33",
      phoneNumber: "000-0000-1033",
    });
    await submitAnswerSet(org, uniformAnswers(5), {
      previousResultId: first.resultId,
      name: "テストテスト 33",
      phoneNumber: "000-0000-1033",
    });
    expect((await patchRespondent(owner, excluded.respondentId, { isExcluded: true })).status).toBe(
      200,
    );
    const viewLogs = async () =>
      (await listDocs(COLLECTIONS.auditLogs))
        .map((doc) => doc.data)
        .filter(
          (data) =>
            data.organizationId === org.organizationId && data.action === "classification.view",
        );
    expect(await viewLogs()).toEqual([]);

    const dto = await classificationOf(owner);
    expect(dto.people).toHaveLength(2);
    expect(
      await countDocs(COLLECTIONS.results, [
        ["organizationId", "==", org.organizationId],
        ["deletedAt", "==", null],
      ]),
    ).toBe(4);
    const logs = await viewLogs();
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
    for (const secret of ["テストテスト", "000-0000-"]) expect(json).not.toContain(secret);
  });
});

describe("M7-zaiseki-29 区分の保存（11-2 の PATCH）が組織内分類の代表の区分に出る（組織内分類の分）", () => {
  it("つながった人の受検者 ID（前回でも代表でも）に employment を送ると、次の GET の代表の employmentStatus が変わる", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類の区分サロン");
    const first = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 41",
      phoneNumber: "000-0000-1041",
    });
    const retake = await submitAnswerSet(org, uniformAnswers(4), {
      previousResultId: first.resultId,
      name: "テストテスト 41",
      phoneNumber: "000-0000-1041",
    });
    const statuses = async () =>
      (await classificationOf(owner)).people.map((person) => [
        person.resultId,
        person.employmentStatus,
      ]);
    expect(await statuses()).toEqual([[retake.resultId, "employed"]]); // 再受験は在籍（K-28）

    // 前回の受検者 ID で退職にする（つながった全受験に書く。11-2 §3.6）
    const left = await patchRespondent(owner, first.respondentId, {
      employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" },
    });
    expect(left.status).toBe(200);
    expect(await statuses()).toEqual([[retake.resultId, "left"]]);

    // 代表の受検者 ID で求職者にする
    const candidate = await patchRespondent(owner, retake.respondentId, {
      employment: { status: "candidate", hiredOn: null, leftOn: null },
    });
    expect(candidate.status).toBe(200);
    expect(await statuses()).toEqual([[retake.resultId, "candidate"]]);
  });
});

describe("M7-zaiseki-30 受検者の無い代表・未知の職業コード・16 タイプに無いタイプ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** logger.warn のうち message の呼び出し（出力はしない） */
  function spyWarn() {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    return (message: string) => warn.mock.calls.filter(([m]) => m === message);
  }

  it("例外（直接書き込み: 代表の受検者の deletedAt）: その人は応答に入らず、前回にも置き換わらない。warn は requestId と resultId だけ", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類の受検者なしサロン");
    const single = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 51",
      phoneNumber: "000-0000-1051",
    });
    const first = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 52",
      phoneNumber: "000-0000-1052",
    });
    const retake = await submitAnswerSet(org, uniformAnswers(3), {
      previousResultId: first.resultId,
      name: "テストテスト 52",
      phoneNumber: "000-0000-1052",
    });
    await writeDocForTest(COLLECTIONS.respondents, retake.respondentId, {
      deletedAt: Timestamp.now(),
    });
    const callsOf = spyWarn();
    const res = await getClassification(owner);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as ClassificationDto;
    expect(resultIdsOf(dto)).toEqual([single.resultId]);
    expect(callsOf("classification.respondent_missing")).toEqual([
      [
        "classification.respondent_missing",
        { requestId: res.headers.get("X-Request-Id"), resultId: retake.resultId },
      ],
    ]);
  });

  it("例外（直接書き込み: 代表の受検者の organizationId をほかの組織にする）: その人は応答に入らない", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類の組織違いサロン");
    const elsewhere = await createTestOrganization("分類の移動先サロン");
    const single = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 53",
      phoneNumber: "000-0000-1053",
    });
    const moved = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 54",
      phoneNumber: "000-0000-1054",
    });
    await writeDocForTest(COLLECTIONS.respondents, moved.respondentId, {
      organizationId: elsewhere.organizationId,
    });
    const callsOf = spyWarn();
    const res = await getClassification(owner);
    const dto = (await res.json()) as ClassificationDto;
    expect(resultIdsOf(dto)).toEqual([single.resultId]);
    expect(JSON.stringify(dto)).not.toContain("テストテスト 54");
    expect(callsOf("classification.respondent_missing")).toEqual([
      [
        "classification.respondent_missing",
        { requestId: res.headers.get("X-Request-Id"), resultId: moved.resultId },
      ],
    ]);
  });

  it("例外（直接書き込み: 受検者の職業コード 99 と旧コード 9）: 99 は occupationLabel が null で unknown_occupation の warn、9 は「その他」", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類の職業サロン");
    const unknown = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 55",
      phoneNumber: "000-0000-1055",
    });
    const legacy = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 56",
      phoneNumber: "000-0000-1056",
    });
    await writeDocForTest(COLLECTIONS.respondents, unknown.respondentId, { occupationCode: 99 });
    await writeDocForTest(COLLECTIONS.respondents, legacy.respondentId, { occupationCode: 9 });
    const callsOf = spyWarn();
    const res = await getClassification(owner);
    const dto = (await res.json()) as ClassificationDto;
    const byId = new Map(dto.people.map((person) => [person.resultId, person]));
    expect(byId.get(unknown.resultId)?.occupationLabel).toBeNull();
    expect(byId.get(legacy.resultId)?.occupationLabel).toBe("その他");
    expect(callsOf("classification.unknown_occupation")).toEqual([
      [
        "classification.unknown_occupation",
        { requestId: res.headers.get("X-Request-Id"), resultId: unknown.resultId },
      ],
    ]);
    expect(callsOf("classification.respondent_missing")).toEqual([]);
  });

  it("例外（直接書き込み: 受験のタイプを 16 タイプに無い値にする）: その人は応答に入らず、unknown_type の warn は requestId と resultId だけ", async () => {
    const { org, owner } = await createOrganizationWithOwner("分類のタイプ不明サロン");
    const single = await submitAnswerSet(org, uniformAnswers(1), {
      name: "テストテスト 57",
      phoneNumber: "000-0000-1057",
    });
    const broken = await submitAnswerSet(org, uniformAnswers(2), {
      name: "テストテスト 58",
      phoneNumber: "000-0000-1058",
    });
    await writeDocForTest(COLLECTIONS.results, broken.resultId, { aptitudeType: "unknown" });
    const callsOf = spyWarn();
    const res = await getClassification(owner);
    const dto = (await res.json()) as ClassificationDto;
    expect(resultIdsOf(dto)).toEqual([single.resultId]);
    expect(callsOf("classification.unknown_type")).toEqual([
      [
        "classification.unknown_type",
        { requestId: res.headers.get("X-Request-Id"), resultId: broken.resultId },
      ],
    ]);
  });
});

describe("PF-09 組織内分類の応答時間（1,000 件。ローカル Emulator。M7-zaiseki-46 の組織内分類の分）", () => {
  it(
    "例外（直接書き込み: 受験 1,000 件とその受検者。200 人は 2 回受けたつながり、40 人は除外）: GET /admin/classification の時間を記録する",
    { timeout: 180_000 },
    async () => {
      const { org, owner } = await createOrganizationWithOwner("分類の性能計測サロン");
      const score = toResultDocFields(scoreAnswers(cyclicAnswers()));
      const base = Date.parse("2026-01-01T00:00:00.000Z");
      const total = 1000;
      const ids = Array.from({ length: total }, (_, i) => ({
        respondentId: `PfClsRespondent${String(i).padStart(5, "0")}`,
        sessionId: `PfClsSession${String(i).padStart(5, "0")}`,
        resultId: `PfClsResult${String(i).padStart(5, "0")}`,
      }));
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
            employmentStatus: kind === "executive" ? "employed" : "candidate",
            hiredOn: null,
            leftOn: null,
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

      const elapsedMs: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const started = performance.now();
        const dto = await classificationOf(owner);
        elapsedMs.push(performance.now() - started);
        expect(dto.people).toHaveLength(expectedPeople);
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      // eslint-disable-next-line no-console -- PF-09 の計測値をテストログに残す（08 §3.9）。目安の値は無いので閾値は置かない
      console.info(
        `PF-09 GET /admin/classification（1,000 件・${expectedPeople} 人）: median ${median(elapsedMs).toFixed(0)} ms, max ${Math.max(...elapsedMs).toFixed(0)} ms`,
      );
    },
  );
});
