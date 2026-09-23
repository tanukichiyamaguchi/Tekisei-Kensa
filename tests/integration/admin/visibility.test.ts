// I-20〜I-22 幹部データの可視性（00 §5、04 D04-07・D04-31）と、回答一覧・組織内分類・利用履歴の応答（04 §5.3・§5.7・§5.8）
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
import type {
  ClassificationDto,
  PagedDto,
  ResultListItemDto,
  UsageLogItemDto,
} from "@/lib/services/dto/admin";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
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
import { countDocs } from "../helpers/firestore";
import { registerViaApi } from "../helpers/respondent-api";
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

const listResults = (admin: TestAdmin, query = "") =>
  getJson<PagedDto<ResultListItemDto>>(listResultsRoute, `/api/v1/admin/results${query}`, admin);

let org: TestOrganization;
let owner: TestAdmin;
let admin: TestAdmin;
const applicants: Array<Awaited<ReturnType<typeof submitAnswerSet>>> = [];
let executive: Awaited<ReturnType<typeof submitAnswerSet>>;
let pendingSessionId: string;

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
  // 送信前の受検者（利用履歴にだけ出る）
  pendingSessionId = (
    await registerViaApi({ organizationId: org.organizationId, name: "未送信 者" })
  ).sessionId;
});

describe("I-20 回答一覧の幹部の可視性", () => {
  it("admin は求職者 3 件（total = 3）、owner は幹部を含む 4 件", async () => {
    const byAdmin = await listResults(admin);
    expect(byAdmin.total).toBe(3);
    expect(byAdmin.items).toHaveLength(3);
    expect(byAdmin.items.every((i) => i.kind === "applicant")).toBe(true);

    const byOwner = await listResults(owner);
    expect(byOwner.total).toBe(4);
    expect(byOwner.items.map((i) => i.resultId)).toContain(executive.resultId);
  });

  it("admin が kind=executive で絞っても 0 件（クエリ条件で除外）", async () => {
    const res = await listResults(admin, "?kind=executive");
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
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

    const patch = await callRoute(patchRespondentRoute, {
      method: "PATCH",
      url: `/api/v1/admin/respondents/${executive.respondentId}`,
      params: { respondentId: executive.respondentId },
      body: { teamCode: "A" },
      cookieHeader: admin.cookieHeader,
    });
    expect(patch.status).toBe(404);
    expect(await errorCode(patch)).toBe("RESPONDENT_NOT_FOUND");

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
    const list = await listResults(other.owner);
    expect(list.total).toBe(0);
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

  it("利用履歴: admin は幹部を含まず、total が count() と一致。応答は { items, total, page, pageSize }", async () => {
    const byAdmin = await getJson<PagedDto<UsageLogItemDto>>(
      listUsageLogsRoute,
      "/api/v1/admin/usage-logs",
      admin,
    );
    const byOwner = await getJson<PagedDto<UsageLogItemDto>>(
      listUsageLogsRoute,
      "/api/v1/admin/usage-logs",
      owner,
    );
    // 求職者 3 件 + 未送信 1 件、owner はさらに幹部 1 件
    expect(byAdmin.total).toBe(
      await countDocs(COLLECTIONS.usageLogs, [
        ["organizationId", "==", org.organizationId],
        ["respondentKind", "==", "applicant"],
      ]),
    );
    expect(byAdmin.total).toBe(4);
    expect(byOwner.total).toBe(
      await countDocs(COLLECTIONS.usageLogs, [["organizationId", "==", org.organizationId]]),
    );
    expect(byOwner.total).toBe(5);
    expect(Object.keys(byAdmin).sort()).toEqual(["items", "page", "pageSize", "total"]);
    expect(byAdmin.items.every((i) => i.kind === "applicant")).toBe(true);
    expect(byOwner.items.some((i) => i.kind === "executive")).toBe(true);

    // 既定は registeredAt 降順。未送信は submittedAt / resultId が null
    const pending = byAdmin.items[0]!;
    expect(pending.name).toBe("未送信 者");
    expect(pending.submittedAt).toBeNull();
    expect(pending.resultId).toBeNull();
    expect(pendingSessionId).toBeTruthy();
    const registered = byOwner.items.map((i) => Date.parse(i.registeredAt));
    expect(registered).toEqual([...registered].sort((a, b) => b - a));

    // ページング・昇順
    const paged = await getJson<PagedDto<UsageLogItemDto>>(
      listUsageLogsRoute,
      "/api/v1/admin/usage-logs?page=2&pageSize=2&order=asc",
      owner,
    );
    expect(paged.total).toBe(5);
    expect(paged.page).toBe(2);
    expect(paged.pageSize).toBe(2);
    expect(paged.items.map((i) => i.usageLogId)).toEqual(
      [...byOwner.items]
        .reverse()
        .slice(2, 4)
        .map((i) => i.usageLogId),
    );
  });
});

describe("回答一覧の絞り込み・検索・並び替え・ページング（04 §5.3）", () => {
  it("既定は submittedAt 降順・page 1・pageSize 50", async () => {
    const res = await listResults(admin);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(50);
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
  });

  it("氏名・電話番号の部分一致（q）", async () => {
    expect(
      (await listResults(admin, `?q=${encodeURIComponent("鈴木")}`)).items.map((i) => i.name),
    ).toEqual(["鈴木 花子"]);
    expect((await listResults(admin, "?q=3333")).items.map((i) => i.name)).toEqual(["阿部 次郎"]);
    expect((await listResults(admin, "?q=nomatch")).total).toBe(0);
  });

  it("チーム（none = 未設定）・除外で絞り込み、sort=teamCode は未設定を後ろに置く", async () => {
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
      expect((await listResults(admin, "?teamCode=A")).items.map((i) => i.name)).toEqual([
        "鈴木 花子",
      ]);
      expect((await listResults(admin, "?teamCode=none")).items.map((i) => i.name)).toEqual([
        "阿部 次郎",
      ]);
      expect((await listResults(admin, "?excluded=only")).items.map((i) => i.name)).toEqual([
        "鈴木 花子",
      ]);
      expect((await listResults(admin, "?excluded=none")).total).toBe(2);
      expect((await listResults(admin, "?sort=teamCode")).items.map((i) => i.teamCode)).toEqual([
        "A",
        "B",
        null,
      ]);
      expect(
        (await listResults(admin, "?sort=teamCode&order=desc")).items.map((i) => i.teamCode),
      ).toEqual([null, "B", "A"]);
    } finally {
      await patch(sato!.respondentId, { teamCode: null });
      await patch(suzuki!.respondentId, { teamCode: null, isExcluded: false });
    }
  });

  it("sort=name は日本語の照合順、ページングは total を保つ", async () => {
    const byName = await listResults(admin, "?sort=name");
    const names = byName.items.map((i) => i.name);
    expect(names).toEqual([...names].sort(new Intl.Collator("ja").compare));
    const page2 = await listResults(admin, "?page=2&pageSize=2");
    expect(page2.total).toBe(3);
    expect(page2.items.map((i) => i.name)).toEqual(["佐藤 一郎"]);
    const beyond = await listResults(admin, "?page=9&pageSize=2");
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(3);
  });

  it("クエリの不正は 422 VALIDATION_ERROR", async () => {
    for (const query of [
      "?page=0",
      "?pageSize=201",
      "?sort=phone",
      "?teamCode=a",
      "?excluded=yes",
      "?kind=staff",
      "?order=up",
    ]) {
      const res = await get(listResultsRoute, `/api/v1/admin/results${query}`, admin);
      expect(res.status, query).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    }
  });

  it("Cookie なしは 401 UNAUTHENTICATED（クエリの検証より先に認可する）", async () => {
    const res = await callRoute(listResultsRoute, {
      method: "GET",
      url: "/api/v1/admin/results?page=0",
    });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  });
});
