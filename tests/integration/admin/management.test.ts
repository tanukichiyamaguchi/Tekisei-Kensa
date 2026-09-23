// I-31 監査ログ、I-32 論理削除、I-36 複製フィールドの同期（04 §5.6、00 §2.2・D-34、04 §10 (7)）
import type { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { GET as getClassificationRoute } from "@/app/api/v1/admin/classification/route";
import { PATCH as patchMeRoute } from "@/app/api/v1/admin/me/route";
import {
  DELETE as deleteRespondentRoute,
  PATCH as patchRespondentRoute,
} from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { GET as getComparisonRoute } from "@/app/api/v1/admin/results/[resultId]/comparison/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { GET as listUsageLogsRoute } from "@/app/api/v1/admin/usage-logs/route";
import { COLLECTIONS } from "@/lib/db/collections";
import type { PagedDto, ResultListItemDto, RespondentUpdatedDto } from "@/lib/services/dto/admin";

import {
  createOrganizationWithOwner,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
} from "../helpers/fixtures";
import { getDocForTest, listDocs } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

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

const getDetail = (admin: TestAdmin, resultId: string) =>
  callRoute(getResultRoute, {
    method: "GET",
    url: `/api/v1/admin/results/${resultId}`,
    params: { resultId },
    cookieHeader: admin.cookieHeader,
  });

async function auditLogsOf(organizationId: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((d) => d.data)
    .filter((d) => d.organizationId === organizationId);
}

describe("I-31 管理者 API の監査ログ", () => {
  it("AuditAction ごとに 1 文書。details に氏名・電話番号が無く、必須項目がある", async () => {
    const { org, owner } = await createOrganizationWithOwner("監査ログ歯科");
    const name = "監査 対象者";
    const phoneNumber = "090-4444-5555";
    const target = await submitAnswerSet(org, uniformAnswers(2), { name, phoneNumber });
    await submitAnswerSet(org, uniformAnswers(4));
    const beforeActions = new Set((await auditLogsOf(org.organizationId)).map((d) => d.action));

    const call = async (res: Promise<Response>, status = 200) =>
      expect((await res).status).toBe(status);
    await call(
      callRoute(listResultsRoute, {
        method: "GET",
        url: "/api/v1/admin/results",
        cookieHeader: owner.cookieHeader,
      }),
    );
    await call(getDetail(owner, target.resultId));
    await call(
      callRoute(getComparisonRoute, {
        method: "GET",
        url: `/api/v1/admin/results/${target.resultId}/comparison?scope=organization`,
        params: { resultId: target.resultId },
        cookieHeader: owner.cookieHeader,
      }),
    );
    await call(patchRespondent(owner, target.respondentId, { teamCode: "C" }));
    await call(patchRespondent(owner, target.respondentId, { isExcluded: true }));
    await call(
      callRoute(listUsageLogsRoute, {
        method: "GET",
        url: "/api/v1/admin/usage-logs",
        cookieHeader: owner.cookieHeader,
      }),
    );
    await call(
      callRoute(getClassificationRoute, {
        method: "GET",
        url: "/api/v1/admin/classification",
        cookieHeader: owner.cookieHeader,
      }),
    );
    await call(
      callRoute(patchMeRoute, {
        method: "PATCH",
        url: "/api/v1/admin/me",
        body: { name: "監査 管理者" },
        cookieHeader: owner.cookieHeader,
      }),
    );
    await call(deleteRespondent(owner, target.respondentId), 204);

    const logs = (await auditLogsOf(org.organizationId)).filter(
      (d) => !beforeActions.has(d.action as string),
    );
    const byAction = (action: string) => logs.filter((d) => d.action === action);
    const expected = [
      "result.list",
      "result.view",
      "result.comparison",
      "respondent.update_team",
      "respondent.update_exclusion",
      "usage_log.view",
      "classification.view",
      "account.update",
      "respondent.delete",
    ];
    for (const action of expected) expect(byAction(action), action).toHaveLength(1);
    expect(logs).toHaveLength(expected.length);

    for (const log of logs) {
      expect(log.organizationId).toBe(org.organizationId);
      expect(log.actorUid).toBe(owner.uid);
      expect(log.actorRole).toBe("owner");
      expect(log.actorKind).toBe("admin");
      expect(log.createdAt).toBeDefined();
      const details = JSON.stringify(log.details);
      expect(details).not.toContain(name);
      expect(details).not.toContain(phoneNumber);
    }
    expect(byAction("result.comparison")[0]!.details).toEqual({
      scope: "organization",
      teamCode: null,
      populationSize: 2,
    });
    expect(byAction("respondent.update_team")[0]!.details).toEqual({ before: null, after: "C" });
    expect(byAction("respondent.update_exclusion")[0]!.details).toEqual({
      before: false,
      after: true,
    });
    expect(byAction("account.update")[0]!.details).toEqual({ fields: ["name"] });
    expect(byAction("respondent.delete")[0]!.targetId).toBe(target.respondentId);
  });

  it("同じ値への PATCH は 200 で監査ログを書かない", async () => {
    const { org, owner } = await createOrganizationWithOwner("監査ログ変更なし歯科");
    const target = await submitAnswerSet(org, uniformAnswers(2));
    const before = (await auditLogsOf(org.organizationId)).length;
    const res = await patchRespondent(owner, target.respondentId, {
      teamCode: null,
      isExcluded: false,
    });
    expect(res.status).toBe(200);
    expect((await auditLogsOf(org.organizationId)).length).toBe(before);
  });
});

describe("I-32 DELETE /admin/respondents/{id}", () => {
  it("1 回目 204、2 回目 404、GET 404。3 文書の deletedAt が同じ Timestamp", async () => {
    const { org, owner } = await createOrganizationWithOwner("削除テスト歯科");
    const target = await submitAnswerSet(org, uniformAnswers(3));

    const first = await deleteRespondent(owner, target.respondentId);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");
    const second = await deleteRespondent(owner, target.respondentId);
    expect(second.status).toBe(404);
    expect(await errorCode(second)).toBe("RESPONDENT_NOT_FOUND");
    const detail = await getDetail(owner, target.resultId);
    expect(detail.status).toBe(404);
    expect(await errorCode(detail)).toBe("RESULT_NOT_FOUND");

    type WithDeletedAt = { deletedAt: Timestamp | null };
    const respondent = await getDocForTest<WithDeletedAt>(
      COLLECTIONS.respondents,
      target.respondentId,
    );
    const session = await getDocForTest<WithDeletedAt>(
      COLLECTIONS.assessmentSessions,
      target.sessionId,
    );
    const result = await getDocForTest<WithDeletedAt>(COLLECTIONS.results, target.resultId);
    expect(respondent!.deletedAt).not.toBeNull();
    expect(session!.deletedAt!.isEqual(respondent!.deletedAt!)).toBe(true);
    expect(result!.deletedAt!.isEqual(respondent!.deletedAt!)).toBe(true);
    // 利用履歴は残す（00 §2.2）
    const usageLog = await getDocForTest(COLLECTIONS.usageLogs, target.usageLogId);
    expect(usageLog).not.toBeNull();

    const logs = (await auditLogsOf(org.organizationId)).filter(
      (d) => d.action === "respondent.delete",
    );
    expect(logs).toHaveLength(1);

    // 一覧・更新からも消える
    const list = await callRoute(listResultsRoute, {
      method: "GET",
      url: "/api/v1/admin/results",
      cookieHeader: owner.cookieHeader,
    });
    expect(((await list.json()) as PagedDto<ResultListItemDto>).total).toBe(0);
    const patch = await patchRespondent(owner, target.respondentId, { isExcluded: true });
    expect(patch.status).toBe(404);
  });

  it("respondentId が文書 ID の形式でなければ 404 NOT_FOUND", async () => {
    const { owner } = await createOrganizationWithOwner("削除形式歯科");
    const res = await deleteRespondent(owner, "bad id");
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("NOT_FOUND");
  });
});

describe("I-36 複製フィールドの同期", () => {
  it("teamCode A → B → null、isExcluded true → false のたびに respondents と results が一致し updatedAt が同じ", async () => {
    const { org, owner } = await createOrganizationWithOwner("同期テスト歯科");
    const target = await submitAnswerSet(org, uniformAnswers(2));
    type Flags = {
      teamCode: string | null;
      isExcluded: boolean;
      respondentKind?: string;
      kind?: string;
      updatedAt: Timestamp;
    };

    const steps: Array<{
      body: Record<string, unknown>;
      teamCode: string | null;
      isExcluded: boolean;
    }> = [
      { body: { teamCode: "A" }, teamCode: "A", isExcluded: false },
      { body: { teamCode: "B" }, teamCode: "B", isExcluded: false },
      { body: { teamCode: null }, teamCode: null, isExcluded: false },
      { body: { isExcluded: true }, teamCode: null, isExcluded: true },
      { body: { isExcluded: false }, teamCode: null, isExcluded: false },
    ];
    for (const step of steps) {
      const res = await patchRespondent(owner, target.respondentId, step.body);
      expect(res.status).toBe(200);
      const dto = (await res.json()) as RespondentUpdatedDto;
      expect(dto).toMatchObject({
        respondentId: target.respondentId,
        teamCode: step.teamCode,
        isExcluded: step.isExcluded,
      });

      const respondent = await getDocForTest<Flags>(COLLECTIONS.respondents, target.respondentId);
      const result = await getDocForTest<Flags>(COLLECTIONS.results, target.resultId);
      expect(respondent!.teamCode).toBe(step.teamCode);
      expect(result!.teamCode).toBe(step.teamCode);
      expect(respondent!.isExcluded).toBe(step.isExcluded);
      expect(result!.isExcluded).toBe(step.isExcluded);
      expect(result!.updatedAt.isEqual(respondent!.updatedAt)).toBe(true);
      expect(respondent!.kind).toBe("applicant");
      expect(result!.respondentKind).toBe("applicant");

      const list = await callRoute(listResultsRoute, {
        method: "GET",
        url: "/api/v1/admin/results",
        cookieHeader: owner.cookieHeader,
      });
      const [item] = ((await list.json()) as PagedDto<ResultListItemDto>).items;
      expect(item).toMatchObject({ teamCode: step.teamCode, isExcluded: step.isExcluded });
    }
  });

  it("本文の不正（項目なし・小文字・2 文字・boolean 以外）は 422", async () => {
    const { org, owner } = await createOrganizationWithOwner("同期検証歯科");
    const target = await submitAnswerSet(org, uniformAnswers(2));
    for (const body of [{}, { teamCode: "a" }, { teamCode: "AB" }, { isExcluded: "true" }]) {
      const res = await patchRespondent(owner, target.respondentId, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    }
  });
});
