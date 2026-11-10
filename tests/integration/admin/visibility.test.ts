// I-20〜I-22 幹部データの可視性（00 §5、04 D04-07・D04-31）と、回答一覧・組織内分類・利用履歴の応答（04 §5.3・§5.7・§5.8、
// 11-2 §3.5・§3.8、11-3 §3.2）。M7-list-30（利用履歴: 送信済みの全件を回答日時の新しい順、オーナー以外に既存スタッフの履歴を出さない）。
// 回答一覧の絞り込み・検索・並び替え・表示の上限は画面で行う（11-2 §3.5）ので、画面の単体テスト（M7-list-06〜09）で確かめる
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getClassificationRoute } from "@/app/api/v1/admin/classification/route";
import {
  DELETE as deleteRespondentRoute,
  PATCH as patchRespondentRoute,
} from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { GET as getComparisonRoute } from "@/app/api/v1/admin/results/[resultId]/comparison/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { GET as listUsageLogsRoute } from "@/app/api/v1/admin/usage-logs/route";
import { COLLECTIONS } from "@/lib/db/collections";
import { adminFirestore } from "@/lib/firebase/admin";
import type { ClassificationDto, ResultListDto, UsageLogListDto } from "@/lib/services/dto/admin";

import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { getDocForTest, listDocs } from "../helpers/firestore";
import {
  registerViaApi,
  respondentApi,
  saveAllStepsViaApi,
  type RegisteredViaApi,
} from "../helpers/respondent-api";
import { callRoute, errorCode } from "../helpers/routes";

const get = (
  handler: Parameters<typeof callRoute>[0],
  path: string,
  admin: TestAdmin,
  params: Record<string, string> = {},
) => callRoute(handler, { method: "GET", url: path, params, cookieHeader: admin.cookieHeader });

async function getJson<T>(
  handler: Parameters<typeof callRoute>[0],
  path: string,
  admin: TestAdmin,
  params?: Record<string, string>,
): Promise<T> {
  const res = await get(handler, path, admin, params);
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
}

const listRows = (admin: TestAdmin, query = "") =>
  getJson<ResultListDto>(listResultsRoute, `/api/v1/admin/results${query}`, admin);

let org: TestOrganization;
let owner: TestAdmin;
let admin: TestAdmin;
const applicants: Array<Awaited<ReturnType<typeof submitAnswerSet>>> = [];
let executive: Awaited<ReturnType<typeof submitAnswerSet>>;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("可視性テスト歯科"));
  admin = await createAdmin(org, "admin");
  // 送信順: 佐藤 → 鈴木 → 阿部（submittedAt 降順の既定では 阿部・鈴木・佐藤）、最後に幹部
  applicants.push(
    await submitAnswerSet(org, uniformAnswers(1), {
      name: "佐藤 一郎",
      phoneNumber: "090-1111-1111",
    }),
  );
  applicants.push(
    await submitAnswerSet(org, uniformAnswers(3), {
      name: "鈴木 花子",
      phoneNumber: "080-2222-2222",
    }),
  );
  applicants.push(
    await submitAnswerSet(org, cyclicAnswers(), {
      name: "阿部 次郎",
      phoneNumber: "070-3333-3333",
    }),
  );
  executive = await submitAnswerSet(org, uniformAnswers(5), {
    kind: "executive",
    name: "幹部 太郎",
    phoneNumber: "090-9999-9999",
  });
  // 送信前の受検者（回答一覧に出ない）
  await registerViaApi({ organizationId: org.organizationId, name: "未送信 者" });
});

describe("I-20 回答一覧の幹部の可視性（行の単位。11-2 §3.5）", () => {
  it("admin は求職者 3 行、owner は幹部を含む 4 行", async () => {
    const byAdmin = await listRows(admin);
    expect(byAdmin.rows).toHaveLength(3);
    expect(byAdmin.rows.map((r) => r.resultId)).not.toContain(executive.resultId);
    expect(byAdmin.rows.map((r) => r.name)).toEqual(["阿部 次郎", "鈴木 花子", "佐藤 一郎"]);

    const byOwner = await listRows(owner);
    expect(byOwner.rows).toHaveLength(4);
    expect(byOwner.rows.map((r) => r.resultId)).toContain(executive.resultId);
    expect(byOwner.rows.some((r) => r.name === "未送信 者")).toBe(false);
  });

  it("クエリは無視する（admin が kind=executive・page=9 などを付けても、クエリなしと同じ 3 行）", async () => {
    const res = await listRows(admin, "?kind=executive&page=9&pageSize=2&q=nomatch&teamCode=a");
    expect(res.rows).toEqual((await listRows(admin)).rows);
  });

  it("Cookie なしは 401 UNAUTHENTICATED", async () => {
    const res = await callRoute(listResultsRoute, {
      method: "GET",
      url: "/api/v1/admin/results?page=0",
    });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  });
});

describe("I-21 admin は幹部の詳細・比較・更新・削除が 404", () => {
  it("GET 詳細・GET 比較は 404 RESULT_NOT_FOUND、PATCH・DELETE は 404 RESPONDENT_NOT_FOUND", async () => {
    const detail = await get(getResultRoute, `/api/v1/admin/results/${executive.resultId}`, admin, {
      resultId: executive.resultId,
    });
    expect(detail.status).toBe(404);
    expect(await errorCode(detail)).toBe("RESULT_NOT_FOUND");

    const comparison = await get(
      getComparisonRoute,
      `/api/v1/admin/results/${executive.resultId}/comparison?scope=organization`,
      admin,
      { resultId: executive.resultId },
    );
    expect(comparison.status).toBe(404);
    expect(await errorCode(comparison)).toBe("RESULT_NOT_FOUND");

    // チーム・除外に加え、区分と日付・役職の本文でも 404（存在を見せない。11-2 §3.6）
    for (const body of [
      { teamCode: "A" },
      { isExcluded: true },
      { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" } },
      { staffRole: "staff" },
    ]) {
      const patch = await callRoute(patchRespondentRoute, {
        method: "PATCH",
        url: `/api/v1/admin/respondents/${executive.respondentId}`,
        params: { respondentId: executive.respondentId },
        body,
        cookieHeader: admin.cookieHeader,
      });
      expect(patch.status, JSON.stringify(body)).toBe(404);
      expect(await errorCode(patch)).toBe("RESPONDENT_NOT_FOUND");
    }

    const del = await callRoute(deleteRespondentRoute, {
      method: "DELETE",
      url: `/api/v1/admin/respondents/${executive.respondentId}`,
      params: { respondentId: executive.respondentId },
      cookieHeader: admin.cookieHeader,
    });
    expect(del.status).toBe(404);
    expect(await errorCode(del)).toBe("RESPONDENT_NOT_FOUND");
  });

  it("owner は同じ幹部の詳細・比較を 200 で取得できる", async () => {
    const detail = await get(getResultRoute, `/api/v1/admin/results/${executive.resultId}`, owner, {
      resultId: executive.resultId,
    });
    expect(detail.status).toBe(200);
    const comparison = await get(
      getComparisonRoute,
      `/api/v1/admin/results/${executive.resultId}/comparison?scope=organization`,
      owner,
      { resultId: executive.resultId },
    );
    expect(comparison.status).toBe(200);
  });

  it("別組織の owner からは詳細・更新とも 404（組織の一致）", async () => {
    const other = await createOrganizationWithOwner("別組織歯科");
    const target = applicants[0]!;
    const detail = await get(
      getResultRoute,
      `/api/v1/admin/results/${target.resultId}`,
      other.owner,
      { resultId: target.resultId },
    );
    expect(detail.status).toBe(404);
    expect(await errorCode(detail)).toBe("RESULT_NOT_FOUND");
    const patch = await callRoute(patchRespondentRoute, {
      method: "PATCH",
      url: `/api/v1/admin/respondents/${target.respondentId}`,
      params: { respondentId: target.respondentId },
      body: { isExcluded: true },
      cookieHeader: other.owner.cookieHeader,
    });
    expect(patch.status).toBe(404);
    const list = await listRows(other.owner);
    expect(list.rows).toEqual([]);
  });
});

describe("I-22 組織内分類・利用履歴の幹部の可視性", () => {
  const classification = (who: TestAdmin, query = "") =>
    getJson<ClassificationDto>(getClassificationRoute, `/api/v1/admin/classification${query}`, who);
  const resultIdsOf = (c: ClassificationDto) => c.people.map((p) => p.resultId);

  it("組織内分類: admin は 3 人（既存スタッフが無い）、owner は既存スタッフを含む 4 人（11-3 §3.2、K-29）", async () => {
    const byAdmin = await classification(admin);
    const byOwner = await classification(owner);
    // 代表の submittedAt の降順（送信順の逆）
    expect(resultIdsOf(byAdmin)).toEqual([
      applicants[2]!.resultId,
      applicants[1]!.resultId,
      applicants[0]!.resultId,
    ]);
    expect(resultIdsOf(byAdmin)).not.toContain(executive.resultId);
    expect(resultIdsOf(byOwner)).toEqual([executive.resultId, ...resultIdsOf(byAdmin)]);
  });

  it("組織内分類: 除外した人は数えない（除外の後 admin は 2 人）。includeExcluded（true・false・yes）を付けても 200 で同じ応答", async () => {
    const target = applicants[1]!;
    const patch = await callRoute(patchRespondentRoute, {
      method: "PATCH",
      url: `/api/v1/admin/respondents/${target.respondentId}`,
      params: { respondentId: target.respondentId },
      body: { isExcluded: true },
      cookieHeader: owner.cookieHeader,
    });
    expect(patch.status).toBe(200);
    try {
      const plain = await classification(admin);
      expect(plain.people).toHaveLength(2);
      expect(resultIdsOf(plain)).not.toContain(target.resultId);
      for (const value of ["true", "false", "yes"]) {
        expect(await classification(admin, `?includeExcluded=${value}`), value).toEqual(plain);
      }
    } finally {
      await callRoute(patchRespondentRoute, {
        method: "PATCH",
        url: `/api/v1/admin/respondents/${target.respondentId}`,
        params: { respondentId: target.respondentId },
        body: { isExcluded: false },
        cookieHeader: owner.cookieHeader,
      });
    }
  });
});

describe("M7-list-30 GET /admin/usage-logs（I-22 の改め。11-2 §3.3・§3.8、K-29）", () => {
  let logOrg: TestOrganization;
  let logOwner: TestAdmin;
  let logAdmin: TestAdmin;
  const ids: Record<"a" | "b" | "staff" | "deleted", { usageLogId: string; respondentId: string }> =
    {} as never;
  let legacyUsageLogId: string;

  /** 登録したセッションを開始・保存・送信し、受検者の usageLogId と respondentId を返す */
  async function complete(registered: RegisteredViaApi) {
    expect((await respondentApi.start(registered.sessionId, registered.cookieHeader)).status).toBe(
      200,
    );
    await saveAllStepsViaApi(registered.sessionId, registered.cookieHeader, cyclicAnswers());
    expect((await respondentApi.submit(registered.sessionId, registered.cookieHeader)).status).toBe(
      200,
    );
    const session = await getDocForTest<{ respondentId: string }>(
      COLLECTIONS.assessmentSessions,
      registered.sessionId,
    );
    const respondent = await getDocForTest<{ usageLogId: string }>(
      COLLECTIONS.respondents,
      session!.respondentId,
    );
    return { usageLogId: respondent!.usageLogId, respondentId: session!.respondentId };
  }

  beforeAll(async () => {
    ({ org: logOrg, owner: logOwner } = await createOrganizationWithOwner("利用履歴サロン"));
    logAdmin = await createAdmin(logOrg, "admin");
    // 登録 A → 登録 B → 送信 B → 送信 A（登録日時の順と回答日時の順が逆）
    const a = await registerViaApi({ organizationId: logOrg.organizationId, name: "見本 甲" });
    const b = await registerViaApi({ organizationId: logOrg.organizationId, name: "見本 乙" });
    ids.b = await complete(b);
    ids.a = await complete(a);
    ids.staff = await complete(
      await registerViaApi({
        organizationId: logOrg.organizationId,
        kind: "executive",
        name: "見本 幹部",
      }),
    );
    ids.deleted = await complete(
      await registerViaApi({ organizationId: logOrg.organizationId, name: "見本 削除" }),
    );
    // 送信前の受検者（利用履歴は送信のときに作るので無い）
    await registerViaApi({ organizationId: logOrg.organizationId, name: "見本 未送信" });
    // 例外（直接書き込み。PR-7.3 の M7-exam-26 と同じ形）: M7 より前の登録で作られた、送信されていない利用履歴
    const legacy = adminFirestore().collection(COLLECTIONS.usageLogs).doc();
    legacyUsageLogId = legacy.id;
    const stamp = (await getDocForTest<{ registeredAt: unknown }>(
      COLLECTIONS.usageLogs,
      ids.a.usageLogId,
    ))!.registeredAt;
    await legacy.set({
      organizationId: logOrg.organizationId,
      respondentId: ids.a.respondentId,
      resultId: null,
      respondentKind: "applicant",
      name: "見本 旧登録",
      phoneNumber: "000-0000-0000",
      diagnosisExperience: "first_time",
      registeredAt: stamp,
      submittedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const del = await callRoute(deleteRespondentRoute, {
      method: "DELETE",
      url: `/api/v1/admin/respondents/${ids.deleted.respondentId}`,
      params: { respondentId: ids.deleted.respondentId },
      cookieHeader: logOwner.cookieHeader,
    });
    expect(del.status).toBe(204);
  });

  const usageLogs = (who: TestAdmin, query = "") =>
    getJson<UsageLogListDto>(listUsageLogsRoute, `/api/v1/admin/usage-logs${query}`, who);

  it("送信済みだけを回答日時（submittedAt）の新しい順に全件。論理削除した受験の履歴も出る。送信されていない履歴は出ない", async () => {
    const byOwner = await usageLogs(logOwner);
    expect(byOwner.items.map((i) => i.usageLogId)).toEqual([
      ids.deleted.usageLogId,
      ids.staff.usageLogId,
      ids.a.usageLogId, // 登録は B より前だが、送信は後
      ids.b.usageLogId,
    ]);
    const submitted = byOwner.items.map((i) => Date.parse(i.submittedAt!));
    expect(submitted).toEqual([...submitted].sort((x, y) => y - x));
    expect(byOwner.items.map((i) => i.usageLogId)).not.toContain(legacyUsageLogId);
    expect(byOwner.items.some((i) => i.name === "見本 未送信")).toBe(false);
    expect(byOwner.items.every((i) => i.submittedAt !== null && i.resultId !== null)).toBe(true);
  });

  it("オーナー以外は既存スタッフの履歴を出さない（K-29）", async () => {
    const byAdmin = await usageLogs(logAdmin);
    expect(byAdmin.items.map((i) => i.usageLogId)).toEqual([
      ids.deleted.usageLogId,
      ids.a.usageLogId,
      ids.b.usageLogId,
    ]);
    expect(byAdmin.items.every((i) => i.kind === "applicant")).toBe(true);
  });

  it("応答のキーは items・total だけで total = items の件数。ページングなし（クエリを付けても全件）", async () => {
    const byOwner = await usageLogs(logOwner);
    expect(Object.keys(byOwner).sort()).toEqual(["items", "total"]);
    expect(byOwner.total).toBe(byOwner.items.length);
    expect(byOwner.total).toBe(4);
    expect(await usageLogs(logOwner, "?page=2&pageSize=1&order=asc")).toEqual(byOwner);
  });

  it("監査ログ usage_log.view の details は { count }（返した件数）", async () => {
    await usageLogs(logAdmin);
    const logs = (await listDocs(COLLECTIONS.auditLogs))
      .map((d) => d.data)
      .filter(
        (d) =>
          d.organizationId === logOrg.organizationId &&
          d.action === "usage_log.view" &&
          d.actorUid === logAdmin.uid,
      );
    expect(logs.map((l) => l.details)).toContainEqual({ count: 3 });
  });
});
