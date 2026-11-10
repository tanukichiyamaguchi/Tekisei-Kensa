// I-20〜I-22 幹部データの可視性（00 §5、04 D04-07・D04-31）と、回答一覧・組織内分類・利用履歴の応答（04 §5.3・§5.7・§5.8、
// 11-2 §3.5・§3.8）。M7-list-30（利用履歴: 送信済みの全件を回答日時の新しい順、オーナー以外に既存スタッフの履歴を出さない）。
// 最後の節は、PR-7.6 まで今の回答一覧の画面（旧レイアウト）が使う旧サービス listResults(ctx, query)（受験ごとの行と URL の
// クエリでの絞り込み・検索・並び替え・ページング）の互換の確かめで、PR-7.6 で旧サービスとともに消す（11-2 §4.3）
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
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { adminFirestore } from "@/lib/firebase/admin";
import type { ClassificationDto, ResultListDto, UsageLogListDto } from "@/lib/services/dto/admin";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { listResults as listResultsForCurrentScreen } from "@/lib/services/result-list";
import { listResultsQuerySchema } from "@/lib/services/schemas/admin-results";
import { SOCIAL_STYLE_KEYS } from "@/lib/scoring/types";

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
  it("組織内分類: admin は 3 人、owner は 4 人。16 タイプ × 4 分類の枠を人数 0 でも返す", async () => {
    const byAdmin = await getJson<ClassificationDto>(
      getClassificationRoute,
      "/api/v1/admin/classification",
      admin,
    );
    const byOwner = await getJson<ClassificationDto>(
      getClassificationRoute,
      "/api/v1/admin/classification",
      owner,
    );
    expect(byAdmin.total).toBe(3);
    expect(byOwner.total).toBe(4);
    const members = (c: ClassificationDto) =>
      c.styles.flatMap((s) => s.types.flatMap((t) => t.members.map((m) => m.resultId)));
    expect(members(byAdmin)).not.toContain(executive.resultId);
    expect(members(byOwner)).toContain(executive.resultId);

    expect(byOwner.styles.map((s) => s.socialStyle)).toEqual([...SOCIAL_STYLE_KEYS]);
    expect(byOwner.styles.flatMap((s) => s.types)).toHaveLength(APTITUDE_TYPE_DEFINITIONS.length);
    for (const style of byOwner.styles) {
      expect(style.count).toBe(style.types.reduce((sum, t) => sum + t.count, 0));
      for (const type of style.types) expect(type.count).toBe(type.members.length);
    }
  });

  it("組織内分類の includeExcluded=false は除外者を数えない。true/false 以外は 422", async () => {
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
      const withExcluded = await getJson<ClassificationDto>(
        getClassificationRoute,
        "/api/v1/admin/classification?includeExcluded=true",
        admin,
      );
      const withoutExcluded = await getJson<ClassificationDto>(
        getClassificationRoute,
        "/api/v1/admin/classification?includeExcluded=false",
        admin,
      );
      expect(withExcluded.total).toBe(3);
      expect(withoutExcluded.total).toBe(2);
      const bad = await get(
        getClassificationRoute,
        "/api/v1/admin/classification?includeExcluded=yes",
        admin,
      );
      expect(bad.status).toBe(422);
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

describe("今の回答一覧の画面（旧レイアウト）の旧サービス listResults(ctx, query)（PR-7.6 で旧サービスとともに消す。11-2 §4.3）", () => {
  /** Server Component（app/(admin)/admin/page.tsx）が渡すのと同じ AdminContext と、URL のクエリの解釈 */
  const ctxOf = (who: TestAdmin, role: "owner" | "admin"): AdminContext => ({
    uid: who.uid,
    organizationId: org.organizationId,
    role,
    canViewExecutives: role === "owner",
    email: who.email,
    displayName: "テスト管理者",
    request: { requestId: "visibility-test", ipAddress: null, userAgent: null },
  });
  const legacyList = (query: Record<string, string> = {}, role: "owner" | "admin" = "admin") =>
    listResultsForCurrentScreen(
      ctxOf(role === "owner" ? owner : admin, role),
      listResultsQuerySchema.parse(query),
    );

  it("既定は submittedAt 降順・page 1・pageSize 50。受験ごとの行で、owner は区分（kind）付き", async () => {
    const res = await legacyList();
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(50);
    expect(res.total).toBe(3);
    expect(res.items.map((i) => i.name)).toEqual(["阿部 次郎", "鈴木 花子", "佐藤 一郎"]);
    const first = res.items[0]!;
    expect(first).toMatchObject({
      resultId: applicants[2]!.resultId,
      respondentId: applicants[2]!.respondentId,
      phoneNumber: "070-3333-3333",
      kind: "applicant",
      teamCode: null,
      isExcluded: false,
      aiGenerationStatus: "not_generated",
    });
    expect(typeof first.aptitudeType).toBe("string");
    expect(typeof first.socialStyle).toBe("string");
    const byOwner = await legacyList({}, "owner");
    expect(byOwner.total).toBe(4);
    expect(byOwner.items.find((i) => i.resultId === executive.resultId)?.kind).toBe("executive");
    expect((await legacyList({ kind: "executive" })).total).toBe(0);
    expect((await legacyList({ kind: "executive" }, "owner")).total).toBe(1);
  });

  it("氏名・電話番号の部分一致（q）", async () => {
    expect((await legacyList({ q: "鈴木" })).items.map((i) => i.name)).toEqual(["鈴木 花子"]);
    expect((await legacyList({ q: "3333" })).items.map((i) => i.name)).toEqual(["阿部 次郎"]);
    expect((await legacyList({ q: "nomatch" })).total).toBe(0);
  });

  it("チーム（none = 未設定）・除外で絞り込み、sort=teamCode は未設定を後ろに置く（チーム・除外は今の画面と同じ PATCH で変える）", async () => {
    const [sato, suzuki] = applicants;
    const patch = (respondentId: string, body: unknown) =>
      callRoute(patchRespondentRoute, {
        method: "PATCH",
        url: `/api/v1/admin/respondents/${respondentId}`,
        params: { respondentId },
        body,
        cookieHeader: admin.cookieHeader,
      });
    expect((await patch(sato!.respondentId, { teamCode: "B" })).status).toBe(200);
    expect((await patch(suzuki!.respondentId, { teamCode: "A", isExcluded: true })).status).toBe(
      200,
    );
    try {
      expect((await legacyList({ teamCode: "A" })).items.map((i) => i.name)).toEqual(["鈴木 花子"]);
      expect((await legacyList({ teamCode: "none" })).items.map((i) => i.name)).toEqual([
        "阿部 次郎",
      ]);
      expect((await legacyList({ excluded: "only" })).items.map((i) => i.name)).toEqual([
        "鈴木 花子",
      ]);
      expect((await legacyList({ excluded: "none" })).total).toBe(2);
      expect((await legacyList({ sort: "teamCode" })).items.map((i) => i.teamCode)).toEqual([
        "A",
        "B",
        null,
      ]);
      expect(
        (await legacyList({ sort: "teamCode", order: "desc" })).items.map((i) => i.teamCode),
      ).toEqual([null, "B", "A"]);
    } finally {
      await patch(sato!.respondentId, { teamCode: null });
      await patch(suzuki!.respondentId, { teamCode: null, isExcluded: false });
    }
  });

  it("sort=name は日本語の照合順、ページングは total を保つ", async () => {
    const names = (await legacyList({ sort: "name" })).items.map((i) => i.name);
    expect(names).toEqual([...names].sort(new Intl.Collator("ja").compare));
    const page2 = await legacyList({ page: "2", pageSize: "2" });
    expect(page2.total).toBe(3);
    expect(page2.items.map((i) => i.name)).toEqual(["佐藤 一郎"]);
    const beyond = await legacyList({ page: "9", pageSize: "2" });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(3);
  });

  it("URL のクエリの不正は safeParse が失敗する（画面は既定値に戻す）", () => {
    for (const query of [
      { page: "0" },
      { pageSize: "201" },
      { sort: "phone" },
      { teamCode: "a" },
      { excluded: "yes" },
      { kind: "staff" },
      { order: "up" },
    ]) {
      expect(listResultsQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });

  it("監査ログ result.list の details は今のまま { count, page }", async () => {
    await legacyList({ page: "1" });
    const logs = (await listDocs(COLLECTIONS.auditLogs))
      .map((d) => d.data)
      .filter((d) => d.organizationId === org.organizationId && d.action === "result.list");
    expect(logs.map((l) => l.details)).toContainEqual({ count: 3, page: 1 });
  });
});
