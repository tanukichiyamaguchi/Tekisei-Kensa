// M7-list-23〜27・29（と M7-list-31 の再受験の分）受検者の更新 PATCH /api/v1/admin/respondents/{id}（11-2 §3.2・§3.6・§3.10・
// §5.2、§2.10・§2.11・§2.13〜§2.15・§2.23・§2.24）。つながりは受検者 API の再受験リンク（previousResultId）で作る。
// M7-list-27 の「途中に既存スタッフの受験を持つつながり」の求職者の代表は API では作れない（再受験は既存スタッフ扱い）ので、
// 08 D08-18 の例外として受検者区分の 3 つの複製を直接書き込みで同じ値にし、テスト名に書く。書く文書が 450 件を超える
// つながり（受験 160 件）も、受検者 API では作れない（登録のレート制限。04 §2.8）ので、同じ例外として直接書く
import { Timestamp, WriteBatch } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  DELETE as deleteRespondentRoute,
  PATCH as patchRespondentRoute,
} from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { GET as listUsageLogsRoute } from "@/app/api/v1/admin/usage-logs/route";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { fetchPopulation } from "@/lib/db/repositories/results-repository";
import { scoreAnswers } from "@/lib/scoring/score";
import type { PersonUpdatedDto, ResultListDto, UsageLogListDto } from "@/lib/services/dto/admin";

import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import { registerViaApi } from "../helpers/respondent-api";
import { callRoute, errorCode } from "../helpers/routes";

type Submitted = Awaited<ReturnType<typeof submitAnswerSet>>;
type Doc = Record<string, unknown> & { updatedAt: Timestamp };

const patch = (admin: TestAdmin, respondentId: string, body: unknown) =>
  callRoute(patchRespondentRoute, {
    method: "PATCH",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    body,
    cookieHeader: admin.cookieHeader,
  });

async function patchOk(admin: TestAdmin, respondentId: string, body: unknown) {
  const res = await patch(admin, respondentId, body);
  expect(res.status, JSON.stringify(body)).toBe(200);
  return (await res.json()) as PersonUpdatedDto;
}

async function getJson<T>(handler: Parameters<typeof callRoute>[0], url: string, admin: TestAdmin) {
  const res = await callRoute(handler, { method: "GET", url, cookieHeader: admin.cookieHeader });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

/** つながりの受験の 3 文書（受検者・受験・利用履歴） */
async function docsOf(exam: Submitted) {
  const [respondent, result, usageLog] = await Promise.all([
    getDocForTest<Doc>(COLLECTIONS.respondents, exam.respondentId),
    getDocForTest<Doc>(COLLECTIONS.results, exam.resultId),
    getDocForTest<Doc>(COLLECTIONS.usageLogs, exam.usageLogId),
  ]);
  return { respondent: respondent!, result: result!, usageLog: usageLog! };
}

/** 監査ログ（action ごと）。listDocs の順は文書 ID の順なので、件数と中身で確かめる */
async function auditLogs(organizationId: string, action: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((d) => d.data)
    .filter((d) => d.organizationId === organizationId && d.action === action);
}

/** 1 回目（求職者用リンク）と、その再受験（再受験リンク。既存スタッフ扱いで区分は在籍）のつながり */
async function chainOf(org: TestOrganization): Promise<[first: Submitted, retake: Submitted]> {
  const first = await submitAnswerSet(org, uniformAnswers(2));
  const retake = await submitAnswerSet(org, uniformAnswers(4), {
    previousResultId: first.resultId,
  });
  return [first, retake];
}

/**
 * 08 D08-18 の例外: 受験 length 件のつながり（1 回目 ← 2 回目 ← …）と、その受検者・利用履歴を直接書く（項目のそろった M7 の
 * 文書）。受検者区分はすべて求職者（役職の変更で全件の受検者区分が変わる形。区分の混ざったつながりは 11-7 の手動の組み合わせで起きる）
 */
async function writeLongChain(organizationId: string, length: number) {
  const score = toResultDocFields(scoreAnswers(cyclicAnswers()));
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const exams = Array.from({ length }, (_, i) => {
    const no = String(i).padStart(4, "0");
    return {
      respondentId: `LongRespondent${no}`,
      sessionId: `LongSession${no}`,
      resultId: `LongResult${no}`,
      usageLogId: `LongUsageLog${no}`,
    };
  });
  const writes = exams.flatMap((exam, i) => {
    const previousResultId = i === 0 ? null : exams[i - 1]!.resultId;
    const submittedAt = Timestamp.fromMillis(base + i * 60_000);
    const person = {
      name: `長い ${i}`,
      phoneNumber: "000-0000-0000",
      diagnosisExperience: "first_time",
    };
    const stamps = { createdAt: submittedAt, updatedAt: submittedAt };
    return [
      () =>
        writeDocForTest(COLLECTIONS.respondents, exam.respondentId, {
          organizationId,
          kind: "applicant",
          ...person,
          occupationCode: 2,
          teamCode: null,
          isExcluded: false,
          sessionId: exam.sessionId,
          usageLogId: exam.usageLogId,
          resultId: exam.resultId,
          previousResultId,
          ...stamps,
          deletedAt: null,
        }),
      () =>
        writeDocForTest(COLLECTIONS.results, exam.resultId, {
          ...score,
          organizationId,
          respondentId: exam.respondentId,
          sessionId: exam.sessionId,
          respondentKind: "applicant",
          teamCode: null,
          isExcluded: false,
          submittedAt,
          aiGenerationStatus: "not_generated",
          aiGenerationStartedAt: null,
          aiGenerationError: null,
          latestAiAnalysisId: null,
          employmentStatus: "candidate",
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
          ...stamps,
          deletedAt: null,
        }),
      () =>
        writeDocForTest(COLLECTIONS.usageLogs, exam.usageLogId, {
          organizationId,
          respondentId: exam.respondentId,
          resultId: exam.resultId,
          respondentKind: "applicant",
          ...person,
          registeredAt: submittedAt,
          submittedAt,
          ...stamps,
        }),
    ];
  });
  for (let i = 0; i < writes.length; i += 100) {
    await Promise.all(writes.slice(i, i + 100).map((write) => write()));
  }
  return exams;
}

/** updatedAt の値（秒とナノ秒。ミリ秒に丸めずに比べる） */
const stampOf = (doc: Record<string, unknown>) => {
  const t = doc.updatedAt as Timestamp;
  return `${t.seconds}.${t.nanoseconds}`;
};

let org: TestOrganization;
let owner: TestAdmin;
let admin: TestAdmin;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("受検者の更新サロン"));
  admin = await createAdmin(org, "admin");
});

describe("M7-list-23 PATCH チーム", () => {
  it("代表の受検者に送ると、つながった全受検者と全受験の teamCode が同じ値で、4 文書の updatedAt が同じ。受検者ごとに respondent.update_team", async () => {
    const [first, retake] = await chainOf(org);
    const teamA = () =>
      fetchPopulation({
        organizationId: org.organizationId,
        scope: { kind: "team", teamCode: "A" },
      });
    expect((await teamA()).map((p) => p.resultId)).not.toContain(retake.resultId);
    const logsBefore = (await auditLogs(org.organizationId, "respondent.update_team")).length;

    const dto = await patchOk(owner, retake.respondentId, { teamCode: "A" });
    expect(dto).toMatchObject({
      respondentId: retake.respondentId,
      resultIds: [retake.resultId, first.resultId],
      teamCode: "A",
      isExcluded: false,
      employment: { status: "employed", hiredOn: null, leftOn: null },
      staffRole: null,
      isVisibleAfterUpdate: true,
    });
    const a = await docsOf(first);
    const b = await docsOf(retake);
    for (const doc of [a.respondent, a.result, b.respondent, b.result]) {
      expect(doc.teamCode).toBe("A");
      expect(doc.updatedAt.isEqual(b.respondent.updatedAt)).toBe(true);
    }
    // 比較の母集団のチーム条件が変わる（前回は置き換わった結果なので入らない。11-5 §2.1.2）
    expect((await teamA()).map((p) => p.resultId)).toEqual([retake.resultId]);

    const logs = await auditLogs(org.organizationId, "respondent.update_team");
    expect(logs).toHaveLength(logsBefore + 2);
    const mine = logs.filter((l) =>
      [first.respondentId, retake.respondentId].includes(l.targetId as string),
    );
    expect(mine).toHaveLength(2);
    for (const log of mine) {
      expect(log).toMatchObject({
        targetCollection: COLLECTIONS.respondents,
        actorUid: owner.uid,
        actorRole: "owner",
        details: { before: null, after: "A" },
      });
    }
  });

  it("1 回目の受検者 ID に送っても同じ行の全件に書く。null で未設定に戻せる（K-32 ⑦）", async () => {
    const [first, retake] = await chainOf(org);
    const dto = await patchOk(owner, first.respondentId, { teamCode: "B" });
    expect(dto.resultIds).toEqual([retake.resultId, first.resultId]);
    expect(dto.teamCode).toBe("B");
    for (const exam of [first, retake]) {
      const { respondent, result } = await docsOf(exam);
      expect([respondent.teamCode, result.teamCode]).toEqual(["B", "B"]);
    }
    expect((await patchOk(owner, retake.respondentId, { teamCode: null })).teamCode).toBeNull();
    for (const exam of [first, retake]) {
      const { respondent, result } = await docsOf(exam);
      expect([respondent.teamCode, result.teamCode]).toEqual([null, null]);
    }
  });
});

describe("M7-list-23・26 書く文書が 450 件を超えるつながり（11-2 §3.6）", () => {
  it(
    "例外（直接書き込み: 受験 160 件のつながりとその受検者・利用履歴）: 受験ごとの書き込みを分けずに 450 件までのバッチに分けて順に書き、全件が同じ値・同じ updatedAt で、監査ログは受験ごとに 1 件",
    { timeout: 120_000 },
    async () => {
      const { org: longOrg, owner: longOwner } =
        await createOrganizationWithOwner("長いつながりサロン");
      const exams = await writeLongChain(longOrg.organizationId, 160);
      const newestFirst = exams.map((e) => e.resultId).reverse();
      const docs = async (collection: string) =>
        (await listDocs(collection))
          .map((d) => d.data)
          .filter((d) => d.organizationId === longOrg.organizationId);

      // コミットしたバッチごとに、積んだ書き込み（update と監査ログの create）の数を数える
      const commit = vi.spyOn(WriteBatch.prototype, "commit");
      const update = vi.spyOn(WriteBatch.prototype, "update");
      const create = vi.spyOn(WriteBatch.prototype, "create");
      const batchSizes = () =>
        commit.mock.contexts.map(
          (batch) =>
            update.mock.contexts.filter((c) => c === batch).length +
            create.mock.contexts.filter((c) => c === batch).length,
        );
      try {
        // チーム: 受験ごとに受検者・受験・監査ログの 3 件。480 件を 450 件（受験 150 件）と 30 件の 2 回で書く
        const team = await patchOk(longOwner, exams.at(-1)!.respondentId, { teamCode: "B" });
        expect(team.resultIds).toEqual(newestFirst);
        expect(batchSizes()).toEqual([450, 30]);
        const respondents = await docs(COLLECTIONS.respondents);
        const results = await docs(COLLECTIONS.results);
        expect(respondents).toHaveLength(160);
        expect(results).toHaveLength(160);
        for (const doc of [...respondents, ...results]) expect(doc.teamCode).toBe("B");
        const teamStamps = new Set([...respondents, ...results].map(stampOf));
        expect(teamStamps.size).toBe(1); // バッチをまたいでも同じ updatedAt（I-36）
        const teamLogs = await auditLogs(longOrg.organizationId, "respondent.update_team");
        expect(new Set(teamLogs.map((l) => l.targetId))).toEqual(
          new Set(exams.map((e) => e.respondentId)),
        );
        expect(teamLogs).toHaveLength(160);

        commit.mockClear();
        update.mockClear();
        create.mockClear();
        // 役職: 受験ごとに受検者・受験・利用履歴・監査ログの 4 件。640 件を、受験の途中で分けずに 448 件（受験 112 件）と 192 件で書く
        const role = await patchOk(longOwner, exams[0]!.respondentId, { staffRole: "leader" });
        expect(role).toMatchObject({ resultIds: newestFirst, staffRole: "leader" });
        expect(batchSizes()).toEqual([448, 192]);
        const roleRespondents = await docs(COLLECTIONS.respondents);
        const roleResults = await docs(COLLECTIONS.results);
        const roleUsageLogs = await docs(COLLECTIONS.usageLogs);
        for (const doc of roleRespondents) expect(doc.kind).toBe("executive");
        for (const doc of roleResults) {
          // 受検者区分の複製と役職。区分は変えない（K-28）
          expect(doc).toMatchObject({
            respondentKind: "executive",
            staffRole: "leader",
            employmentStatus: "candidate",
          });
        }
        for (const doc of roleUsageLogs) expect(doc.respondentKind).toBe("executive");
        const roleStamps = new Set(
          [...roleRespondents, ...roleResults, ...roleUsageLogs].map(stampOf),
        );
        expect(roleStamps.size).toBe(1);
        expect(roleStamps).not.toEqual(teamStamps);
        const roleLogs = await auditLogs(longOrg.organizationId, "result.update_staff_role");
        expect(new Set(roleLogs.map((l) => l.targetId))).toEqual(
          new Set(exams.map((e) => e.resultId)),
        );
        expect(roleLogs).toHaveLength(160);
      } finally {
        commit.mockRestore();
        update.mockRestore();
        create.mockRestore();
      }
    },
  );
});

describe("M7-list-24 PATCH 除外", () => {
  it("つながりの全件に書き、組織全体の母集団の件数が 1 減る。受検者ごとに respondent.update_exclusion", async () => {
    const [first, retake] = await chainOf(org);
    const population = async () =>
      (
        await fetchPopulation({
          organizationId: org.organizationId,
          scope: { kind: "organization" },
        })
      ).length;
    const before = await population();
    const dto = await patchOk(owner, retake.respondentId, { isExcluded: true });
    expect(dto.isExcluded).toBe(true);
    for (const exam of [first, retake]) {
      const { respondent, result } = await docsOf(exam);
      expect([respondent.isExcluded, result.isExcluded]).toEqual([true, true]);
    }
    expect(await population()).toBe(before - 1);
    const logs = (await auditLogs(org.organizationId, "respondent.update_exclusion")).filter((l) =>
      [first.respondentId, retake.respondentId].includes(l.targetId as string),
    );
    expect(logs.map((l) => l.details)).toEqual([
      { before: false, after: true },
      { before: false, after: true },
    ]);
  });
});

describe("M7-list-25 PATCH 区分と日付", () => {
  const employment = { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" };

  it("つながりの全受験の 3 項目に書く。受験ごとに result.update_employment（6 つの details）", async () => {
    const [first, retake] = await chainOf(org);
    const dto = await patchOk(owner, retake.respondentId, { employment });
    expect(dto.employment).toEqual(employment);
    for (const exam of [first, retake]) {
      const { result } = await docsOf(exam);
      expect(result).toMatchObject({
        employmentStatus: "left",
        hiredOn: "2025-04-01",
        leftOn: "2026-10-31",
      });
    }
    const logs = (await auditLogs(org.organizationId, "result.update_employment")).filter((l) =>
      [first.resultId, retake.resultId].includes(l.targetId as string),
    );
    expect(logs).toHaveLength(2);
    const byTarget = new Map(logs.map((l) => [l.targetId, l]));
    expect(byTarget.get(first.resultId)).toMatchObject({
      targetCollection: COLLECTIONS.results,
      details: {
        before: "candidate",
        after: "left",
        hiredOnBefore: null,
        hiredOnAfter: "2025-04-01",
        leftOnBefore: null,
        leftOnAfter: "2026-10-31",
      },
    });
    expect((byTarget.get(retake.resultId)!.details as Record<string, unknown>).before).toBe(
      "employed",
    );
  });

  it("退職日 < 入社日は 422 LEFT_BEFORE_HIRED、区分が退職でない退職日・実在しない日は 422 VALIDATION_ERROR（書き込みなし）", async () => {
    const target = await submitAnswerSet(org, uniformAnswers(3));
    const before = await docsOf(target);
    const cases: Array<[unknown, string]> = [
      [
        { employment: { status: "left", hiredOn: "2026-04-01", leftOn: "2025-04-01" } },
        "LEFT_BEFORE_HIRED",
      ],
      [
        { employment: { status: "employed", hiredOn: null, leftOn: "2026-10-31" } },
        "VALIDATION_ERROR",
      ],
      [{ employment: { status: "left", hiredOn: null, leftOn: "2026-02-30" } }, "VALIDATION_ERROR"],
      [{ staffRole: "owner" }, "VALIDATION_ERROR"],
      [{}, "VALIDATION_ERROR"],
    ];
    for (const [body, code] of cases) {
      const res = await patch(owner, target.respondentId, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await errorCode(res)).toBe(code);
    }
    const left = await patch(owner, target.respondentId, cases[0]![0]);
    expect(((await left.json()) as { error: { message: string } }).error.message).toBe(
      "退職日が入社日より前になっています",
    );
    const after = await docsOf(target);
    expect(after.result.updatedAt.isEqual(before.result.updatedAt)).toBe(true);
    expect(after.result.employmentStatus).toBe("candidate");
  });

  it("送信前の受検者: employment・staffRole は 404 RESULT_NOT_FOUND、teamCode は 200 でその受検者だけに書く", async () => {
    const draft = await registerViaApi({ organizationId: org.organizationId });
    const session = await getDocForTest<{ respondentId: string }>(
      COLLECTIONS.assessmentSessions,
      draft.sessionId,
    );
    const respondentId = session!.respondentId;
    for (const body of [{ employment }, { staffRole: "leader" }]) {
      const res = await patch(owner, respondentId, body);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("RESULT_NOT_FOUND");
    }
    const dto = await patchOk(owner, respondentId, { teamCode: "C" });
    expect(dto).toMatchObject({
      respondentId,
      resultIds: [],
      teamCode: "C",
      isExcluded: false,
      employment: null,
      staffRole: null,
      isVisibleAfterUpdate: true,
    });
    expect((await getDocForTest<Doc>(COLLECTIONS.respondents, respondentId))!.teamCode).toBe("C");
  });
});

describe("M7-list-26 PATCH 役職", () => {
  it("責任者・幹部にすると、つながりの全件の受検者区分の 3 つの複製が executive・staffRole が leader になり、区分は変わらない。スタッフで applicant に戻る", async () => {
    const [first, retake] = await chainOf(org);
    const dto = await patchOk(owner, retake.respondentId, { staffRole: "leader" });
    expect(dto).toMatchObject({ staffRole: "leader", isVisibleAfterUpdate: true });
    const a = await docsOf(first);
    const b = await docsOf(retake);
    for (const [docs, status] of [
      [a, "candidate"],
      [b, "employed"],
    ] as const) {
      expect(docs.respondent.kind).toBe("executive");
      expect(docs.result).toMatchObject({
        respondentKind: "executive",
        staffRole: "leader",
        employmentStatus: status, // 役職では区分を変えない（K-28）
      });
      expect(docs.usageLog.respondentKind).toBe("executive");
    }
    // 書いた文書（1 回目の受検者・受験・利用履歴と、再受験の受験）の updatedAt は同じ。再受験の受検者は区分が変わらないので書かない
    for (const doc of [a.result, a.usageLog, b.result]) {
      expect(doc.updatedAt.isEqual(a.respondent.updatedAt)).toBe(true);
    }
    expect(b.respondent.updatedAt.isEqual(a.respondent.updatedAt)).toBe(false);
    const logs = (await auditLogs(org.organizationId, "result.update_staff_role")).filter((l) =>
      [first.resultId, retake.resultId].includes(l.targetId as string),
    );
    expect(new Map(logs.map((l) => [l.targetId, l.details]))).toEqual(
      new Map([
        [
          first.resultId,
          { before: null, after: "leader", kindBefore: "applicant", kindAfter: "executive" },
        ],
        [
          retake.resultId,
          { before: null, after: "leader", kindBefore: "executive", kindAfter: "executive" },
        ],
      ]),
    );

    await patchOk(owner, first.respondentId, { staffRole: "staff" });
    for (const exam of [first, retake]) {
      const { respondent, result, usageLog } = await docsOf(exam);
      expect([respondent.kind, result.respondentKind, usageLog.respondentKind]).toEqual([
        "applicant",
        "applicant",
        "applicant",
      ]);
      expect(result.staffRole).toBe("staff");
    }
  });

  it("同じ役職をもう一度送ると 200 で、書き込みも監査ログも無い", async () => {
    const target = await submitAnswerSet(org, cyclicAnswers());
    await patchOk(owner, target.respondentId, { staffRole: "manager" });
    const before = await docsOf(target);
    const logsBefore = (await auditLogs(org.organizationId, "result.update_staff_role")).length;
    const dto = await patchOk(owner, target.respondentId, { staffRole: "manager" });
    expect(dto).toMatchObject({ staffRole: "manager", resultIds: [target.resultId] });
    const after = await docsOf(target);
    expect(after.result.updatedAt.isEqual(before.result.updatedAt)).toBe(true);
    expect(after.respondent.updatedAt.isEqual(before.respondent.updatedAt)).toBe(true);
    expect((await auditLogs(org.organizationId, "result.update_staff_role")).length).toBe(
      logsBefore,
    );
  });

  it("オーナー以外が求職者を責任者にすると isVisibleAfterUpdate が false。以後その管理者からは詳細・PATCH・DELETE が 404 で、一覧と利用履歴からも消える。オーナーには出る", async () => {
    const target = await submitAnswerSet(org, uniformAnswers(1));
    const dto = await patchOk(admin, target.respondentId, { staffRole: "manager" });
    expect(dto).toMatchObject({
      staffRole: "manager",
      isVisibleAfterUpdate: false,
      resultIds: [target.resultId],
    });

    const detail = await callRoute(getResultRoute, {
      method: "GET",
      url: `/api/v1/admin/results/${target.resultId}`,
      params: { resultId: target.resultId },
      cookieHeader: admin.cookieHeader,
    });
    expect(detail.status).toBe(404);
    expect(await errorCode(detail)).toBe("RESULT_NOT_FOUND");
    const again = await patch(admin, target.respondentId, { teamCode: "A" });
    expect(again.status).toBe(404);
    expect(await errorCode(again)).toBe("RESPONDENT_NOT_FOUND");
    const del = await callRoute(deleteRespondentRoute, {
      method: "DELETE",
      url: `/api/v1/admin/respondents/${target.respondentId}`,
      params: { respondentId: target.respondentId },
      cookieHeader: admin.cookieHeader,
    });
    expect(del.status).toBe(404);
    expect(await errorCode(del)).toBe("RESPONDENT_NOT_FOUND");

    const listOf = (who: TestAdmin) =>
      getJson<ResultListDto>(listResultsRoute, "/api/v1/admin/results", who);
    const logsOf = (who: TestAdmin) =>
      getJson<UsageLogListDto>(listUsageLogsRoute, "/api/v1/admin/usage-logs", who);
    expect((await listOf(admin)).rows.map((r) => r.resultId)).not.toContain(target.resultId);
    expect((await logsOf(admin)).items.map((i) => i.usageLogId)).not.toContain(target.usageLogId);
    expect((await listOf(owner)).rows.map((r) => r.resultId)).toContain(target.resultId);
    expect((await logsOf(owner)).items.map((i) => i.usageLogId)).toContain(target.usageLogId);
  });
});

describe("M7-list-27 閲覧範囲の書き込み", () => {
  it("オーナー以外は既存スタッフの受検者への PATCH（チーム・区分と日付・役職）と DELETE が 404 RESPONDENT_NOT_FOUND", async () => {
    const staff = await submitAnswerSet(org, uniformAnswers(5), { kind: "executive" });
    for (const body of [
      { teamCode: "A" },
      { employment: { status: "employed", hiredOn: "2025-04-01", leftOn: null } },
      { staffRole: "staff" },
    ]) {
      const res = await patch(admin, staff.respondentId, body);
      expect(res.status, JSON.stringify(body)).toBe(404);
      expect(await errorCode(res)).toBe("RESPONDENT_NOT_FOUND");
    }
    const del = await callRoute(deleteRespondentRoute, {
      method: "DELETE",
      url: `/api/v1/admin/respondents/${staff.respondentId}`,
      params: { respondentId: staff.respondentId },
      cookieHeader: admin.cookieHeader,
    });
    expect(del.status).toBe(404);
    expect(await errorCode(del)).toBe("RESPONDENT_NOT_FOUND");
    expect((await docsOf(staff)).result.teamCode).toBeNull();
  });

  it("例外（直接書き込み: 受検者区分）: 途中に既存スタッフの受験を持つつながりの求職者の行を変えると、閲覧範囲の受験だけに書き、既存スタッフの受験は変わらない", async () => {
    const [r1, r2] = await chainOf(org); // r2 は再受験（既存スタッフ）
    const r3 = await submitAnswerSet(org, cyclicAnswers(), { previousResultId: r2.resultId });
    // r3 を求職者にする（手動の組み合わせで起きる形。3 つの複製を同じ値に書く）
    await writeDocForTest(COLLECTIONS.respondents, r3.respondentId, { kind: "applicant" });
    await writeDocForTest(COLLECTIONS.results, r3.resultId, { respondentKind: "applicant" });
    await writeDocForTest(COLLECTIONS.usageLogs, r3.usageLogId, { respondentKind: "applicant" });

    const dto = await patchOk(admin, r3.respondentId, { teamCode: "C" });
    expect(dto.resultIds).toEqual([r3.resultId]);
    expect((await docsOf(r3)).result.teamCode).toBe("C");
    expect((await docsOf(r2)).result.teamCode).toBeNull();
    expect((await docsOf(r1)).result.teamCode).toBeNull();

    // オーナーなら同じ行の 3 件に書く
    const byOwner = await patchOk(owner, r3.respondentId, { teamCode: "D" });
    expect(byOwner.resultIds).toEqual([r3.resultId, r2.resultId, r1.resultId]);
    for (const exam of [r1, r2, r3]) expect((await docsOf(exam)).result.teamCode).toBe("D");
  });
});

describe("M7-list-29 再受験の直後（K-39 Q-34。M7-list-31 の再受験の分）", () => {
  it("1 回目にチーム・除外・退職・幹部を付けたあと再受験すると、新しい受験は前回の値を引き継がず、行はその値を出す。一覧から変えると 2 件ともそろう", async () => {
    const first = await submitAnswerSet(org, uniformAnswers(3));
    await patchOk(owner, first.respondentId, { teamCode: "A" });
    await patchOk(owner, first.respondentId, { isExcluded: true });
    await patchOk(owner, first.respondentId, {
      employment: { status: "left", hiredOn: "2024-04-01", leftOn: "2026-03-31" },
    });
    await patchOk(owner, first.respondentId, { staffRole: "leader" });

    const retake = await submitAnswerSet(org, uniformAnswers(2), {
      previousResultId: first.resultId,
    });
    const { respondent, result } = await docsOf(retake);
    expect(respondent).toMatchObject({ teamCode: null, isExcluded: false, kind: "executive" });
    expect(result).toMatchObject({
      teamCode: null,
      isExcluded: false,
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: first.resultId,
    });
    const list = await getJson<ResultListDto>(listResultsRoute, "/api/v1/admin/results", owner);
    const row = list.rows.find((r) => r.resultId === retake.resultId)!;
    expect(row).toMatchObject({
      teamCode: null,
      isExcluded: false,
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
    expect(row.exams.map((e) => e.resultId)).toEqual([retake.resultId, first.resultId]);

    await patchOk(owner, row.respondentId, { teamCode: "B" });
    for (const exam of [first, retake]) expect((await docsOf(exam)).result.teamCode).toBe("B");
  });
});
