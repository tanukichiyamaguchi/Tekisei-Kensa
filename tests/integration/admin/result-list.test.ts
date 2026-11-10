// M7-list-21・22・28 回答一覧の API（11-2 §3.5・§3.7・§5.2、§2.2・§2.9・§2.16・§2.25）と PF-08（1,000 件の一覧と更新の時間）。
// つながりは受検者 API の再受験リンク（previousResultId）で作る。API では作れない次の 3 つは、08 D08-18 の例外として
// 直接書き込みで作り、テスト名に書く: 経年比較の状態（生成は 11-6 の PR）、代表が求職者で前回が既存スタッフのつながり
// （再受験は既存スタッフ扱い。受検者区分の 3 つの複製を同じ値に書く）、経年比較の項目の無い M7 より前の形。PF-08 の 1,000 件
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { DELETE as deleteRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { PATCH as patchRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { GET as listUsageLogsRoute } from "@/app/api/v1/admin/usage-logs/route";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { adminFirestore } from "@/lib/firebase/admin";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ResultListDto, ResultListRowDto, UsageLogListDto } from "@/lib/services/dto/admin";

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
import { callRoute, errorCode } from "../helpers/routes";

type Submitted = Awaited<ReturnType<typeof submitAnswerSet>>;

async function getList(admin: TestAdmin, query = ""): Promise<ResultListDto> {
  const res = await callRoute(listResultsRoute, {
    method: "GET",
    url: `/api/v1/admin/results${query}`,
    cookieHeader: admin.cookieHeader,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ResultListDto;
}

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

async function auditLogsOf(organizationId: string, action: string) {
  return (await listDocs(COLLECTIONS.auditLogs)).filter(
    (d) => d.data.organizationId === organizationId && d.data.action === action,
  );
}

const rowOf = (list: ResultListDto, resultId: string): ResultListRowDto | undefined =>
  list.rows.find((row) => row.resultId === resultId);
const examIds = (row: ResultListRowDto | undefined) => row?.exams.map((e) => e.resultId);

const ROW_KEYS = [
  "aptitudeType",
  "employmentStatus",
  "exams",
  "hiredOn",
  "isExcluded",
  "leftOn",
  "name",
  "occupationCode",
  "phoneNumber",
  "respondentId",
  "resultId",
  "staffRole",
  "submittedAt",
  "teamCode",
];
const EXAM_KEYS = ["hasLongitudinalReport", "respondentId", "resultId", "submittedAt"];
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("M7-list-21 GET /admin/results の行とつながり", () => {
  let org: TestOrganization;
  let owner: TestAdmin;
  let admin: TestAdmin;
  const applicants: Submitted[] = [];
  let staff: Submitted;
  let first: Submitted; // つながりの 1 回目（求職者用リンク）
  let retake: Submitted; // 再受験（前回 = first。既存スタッフ扱い）

  beforeAll(async () => {
    ({ org, owner } = await createOrganizationWithOwner("一覧の行サロン"));
    admin = await createAdmin(org, "admin");
    // 送信の順: 求職者 1 → 1 回目 → 求職者 2 → 既存スタッフ → 求職者 3 → 再受験
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(1), {
        name: "見本 一郎",
        phoneNumber: "000-0000-1001",
      }),
    );
    first = await submitAnswerSet(org, uniformAnswers(2), {
      name: "以前 花子",
      phoneNumber: "000-0000-2001",
    });
    applicants.push(
      await submitAnswerSet(org, uniformAnswers(3), {
        name: "見本 二郎",
        phoneNumber: "000-0000-1002",
      }),
    );
    staff = await submitAnswerSet(org, uniformAnswers(4), {
      kind: "executive",
      name: "見本 幹部",
      phoneNumber: "000-0000-3001",
    });
    applicants.push(
      await submitAnswerSet(org, cyclicAnswers(), {
        name: "見本 三郎",
        phoneNumber: "000-0000-1003",
      }),
    );
    // 再受験リンク（prev）で登録して送信する。前回とは別の氏名・電話番号で登録する
    retake = await submitAnswerSet(org, uniformAnswers(5), {
      previousResultId: first.resultId,
      name: "最新 花子",
      phoneNumber: "000-0000-2002",
    });
  });

  it("オーナー: 5 行（求職者 3・既存スタッフ 1・つながり 2 件の人 1）。行は代表の submittedAt の降順、exams は [代表, 前回]", async () => {
    const list = await getList(owner);
    expect(list.rows.map((r) => r.resultId)).toEqual([
      retake.resultId,
      applicants[2]!.resultId,
      staff.resultId,
      applicants[1]!.resultId,
      applicants[0]!.resultId,
    ]);
    const person = list.rows[0]!;
    expect(examIds(person)).toEqual([retake.resultId, first.resultId]);
    expect(person.exams.map((e) => e.respondentId)).toEqual([
      retake.respondentId,
      first.respondentId,
    ]);
    expect(person).toMatchObject({
      respondentId: retake.respondentId,
      name: "最新 花子",
      phoneNumber: "000-0000-2002",
      employmentStatus: "employed", // 再受験は在籍（K-28）
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      teamCode: null,
      isExcluded: false,
    });
    expect(person.submittedAt).toBe(person.exams[0]!.submittedAt);
    expect(Date.parse(person.exams[1]!.submittedAt)).toBeLessThan(Date.parse(person.submittedAt));
    // 前回以前の受験の氏名・電話番号は返さない
    const json = JSON.stringify(list);
    expect(json).not.toContain("以前 花子");
    expect(json).not.toContain("000-0000-2001");
    // 既存スタッフの受験も同じ表に混ぜる（区分列・既存スタッフのラベルは無い）
    expect(rowOf(list, staff.resultId)).toMatchObject({
      name: "見本 幹部",
      employmentStatus: "employed",
    });
    expect(rowOf(list, applicants[0]!.resultId)?.employmentStatus).toBe("candidate");
    for (const row of list.rows) {
      expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
      for (const exam of row.exams) {
        expect(Object.keys(exam).sort()).toEqual(EXAM_KEYS);
        expect(exam.hasLongitudinalReport).toBe(false);
      }
    }
  });

  it("オーナー以外: 既存スタッフの受験が無く、つながりがそこで切れる（再受験が見えず 1 回目だけの行）", async () => {
    const list = await getList(admin);
    expect(list.rows.map((r) => r.resultId)).toEqual([
      applicants[2]!.resultId,
      applicants[1]!.resultId,
      first.resultId,
      applicants[0]!.resultId,
    ]);
    expect(examIds(rowOf(list, first.resultId))).toEqual([first.resultId]);
    expect(rowOf(list, first.resultId)).toMatchObject({
      name: "以前 花子",
      employmentStatus: "candidate",
    });
    const json = JSON.stringify(list);
    for (const hidden of [retake.resultId, staff.resultId, "最新 花子", "見本 幹部"]) {
      expect(json).not.toContain(hidden);
    }
  });

  it("区分・入社日・退職日・役職を変えると、その値が行に出る", async () => {
    const target = applicants[0]!;
    const employment = { status: "left", hiredOn: "2025-04-01", leftOn: "2026-10-31" };
    expect((await patchRespondent(owner, target.respondentId, { employment })).status).toBe(200);
    expect((await patchRespondent(owner, target.respondentId, { staffRole: "staff" })).status).toBe(
      200,
    );
    expect(rowOf(await getList(owner), target.resultId)).toMatchObject({
      employmentStatus: "left",
      hiredOn: "2025-04-01",
      leftOn: "2026-10-31",
      staffRole: "staff",
    });
  });

  it("generatedAt はサーバの時刻（ISO 8601）。クエリは無視する（今の q・kind・page などを付けても同じ行）", async () => {
    const before = Date.now();
    const list = await getList(owner);
    const after = Date.now();
    expect(list.generatedAt).toMatch(ISO_8601);
    expect(Date.parse(list.generatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(list.generatedAt)).toBeLessThanOrEqual(after);
    expect(Object.keys(list).sort()).toEqual(["generatedAt", "rows"]);
    const withQuery = await getList(admin, "?q=nomatch&kind=executive&page=9&pageSize=0&sort=x");
    expect(withQuery.rows).toEqual((await getList(admin)).rows);
  });

  it("監査ログ result.list の details は { rowCount, examCount }（行と受験の数）で、氏名・電話番号を含まない", async () => {
    const before = new Set((await auditLogsOf(org.organizationId, "result.list")).map((d) => d.id));
    await getList(owner);
    await getList(admin);
    const logs = (await auditLogsOf(org.organizationId, "result.list"))
      .filter((d) => !before.has(d.id))
      .map((d) => d.data);
    expect(logs.map((l) => l.details)).toEqual(
      expect.arrayContaining([
        { rowCount: 5, examCount: 6 },
        { rowCount: 4, examCount: 4 },
      ]),
    );
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log.targetCollection).toBe(COLLECTIONS.results);
      expect(log.targetId).toBeNull();
      const details = JSON.stringify(log.details);
      expect(details).not.toContain("花子");
      expect(details).not.toContain("000-0000");
    }
  });
});

describe("M7-list-22 経年比較あり（hasLongitudinalReport）", () => {
  let org: TestOrganization;
  let owner: TestAdmin;
  let admin: TestAdmin;
  let previous: Submitted;
  let latest: Submitted; // 前回 = previous（再受験。既存スタッフ）

  const setLongitudinal = (resultId: string, status: string) =>
    writeDocForTest(COLLECTIONS.results, resultId, { longitudinalAiStatus: status });
  const flagsOf = (list: ResultListDto, resultId: string) =>
    list.rows
      .flatMap((r) => r.exams)
      .filter((e) => e.resultId === resultId)
      .map((e) => e.hasLongitudinalReport);

  beforeAll(async () => {
    ({ org, owner } = await createOrganizationWithOwner("経年比較ありサロン"));
    admin = await createAdmin(org, "admin");
    previous = await submitAnswerSet(org, uniformAnswers(2));
    latest = await submitAnswerSet(org, uniformAnswers(3), {
      previousResultId: previous.resultId,
    });
  });

  it("例外（直接書き込み: 経年比較の状態）: completed で前回あり → 真。前回のない受験は偽", async () => {
    await setLongitudinal(latest.resultId, "completed");
    const list = await getList(owner);
    expect(rowOf(list, latest.resultId)?.exams).toMatchObject([
      { resultId: latest.resultId, hasLongitudinalReport: true },
      { resultId: previous.resultId, hasLongitudinalReport: false },
    ]);
  });

  it("例外（直接書き込み: 経年比較の状態）: generating・failed・not_generated → 偽", async () => {
    for (const status of ["generating", "failed", "not_generated"]) {
      await setLongitudinal(latest.resultId, status);
      expect(flagsOf(await getList(owner), latest.resultId), status).toEqual([false]);
    }
    await setLongitudinal(latest.resultId, "completed");
  });

  it("例外（直接書き込み: 受検者区分と経年比較の状態）: 前回が既存スタッフの受験なら、オーナー以外は偽・オーナーは真", async () => {
    const staff = await submitAnswerSet(org, uniformAnswers(4), { kind: "executive" });
    const head = await submitAnswerSet(org, uniformAnswers(1), {
      previousResultId: staff.resultId,
    });
    // 代表を求職者にする（再受験は既存スタッフ扱いなので API では作れない。3 つの複製を同じ値に書く）
    await writeDocForTest(COLLECTIONS.respondents, head.respondentId, { kind: "applicant" });
    await writeDocForTest(COLLECTIONS.results, head.resultId, { respondentKind: "applicant" });
    await writeDocForTest(COLLECTIONS.usageLogs, head.usageLogId, {
      respondentKind: "applicant",
    });
    await setLongitudinal(head.resultId, "completed");

    const byAdmin = await getList(admin);
    expect(examIds(rowOf(byAdmin, head.resultId))).toEqual([head.resultId]);
    expect(flagsOf(byAdmin, head.resultId)).toEqual([false]);
    const byOwner = await getList(owner);
    expect(examIds(rowOf(byOwner, head.resultId))).toEqual([head.resultId, staff.resultId]);
    expect(flagsOf(byOwner, head.resultId)).toEqual([true]);
  });

  it("例外（直接書き込み: M7 より前の形）: 経年比較の項目が無い受験は偽", async () => {
    const before = await submitAnswerSet(org, uniformAnswers(2));
    const legacy = await submitAnswerSet(org, cyclicAnswers(), {
      previousResultId: before.resultId,
    });
    await adminFirestore().collection(COLLECTIONS.results).doc(legacy.resultId).update({
      longitudinalAiStatus: FieldValue.delete(),
      longitudinalAiStartedAt: FieldValue.delete(),
      longitudinalAiError: FieldValue.delete(),
      latestLongitudinalAiAnalysisId: FieldValue.delete(),
    });
    const list = await getList(owner);
    expect(examIds(rowOf(list, legacy.resultId))).toEqual([legacy.resultId, before.resultId]);
    expect(flagsOf(list, legacy.resultId)).toEqual([false]);
  });

  it("前回を論理削除すると偽（K-39 Q-35）。行も代表だけになる", async () => {
    expect(flagsOf(await getList(owner), latest.resultId)).toEqual([true]);
    expect((await deleteRespondent(owner, previous.respondentId)).status).toBe(204);
    const list = await getList(owner);
    expect(examIds(rowOf(list, latest.resultId))).toEqual([latest.resultId]);
    expect(flagsOf(list, latest.resultId)).toEqual([false]);
  });
});

describe("M7-list-28 DELETE と代表の交代", () => {
  it("代表（再受験）を削除すると 3 文書が同じ deletedAt で論理削除され、次の GET で前回が代表の行（exams は [前回]）。利用履歴は残り、2 回目の DELETE は 404", async () => {
    const { org, owner } = await createOrganizationWithOwner("代表の交代サロン");
    const r1 = await submitAnswerSet(org, uniformAnswers(2));
    const r2 = await submitAnswerSet(org, uniformAnswers(4), { previousResultId: r1.resultId });
    const before = await getList(owner);
    expect(before.rows.map((r) => examIds(r))).toEqual([[r2.resultId, r1.resultId]]);

    expect((await deleteRespondent(owner, r2.respondentId)).status).toBe(204);
    type Deleted = { deletedAt: Timestamp | null; previousResultId?: string | null };
    const [respondent, session, result] = await Promise.all([
      getDocForTest<Deleted>(COLLECTIONS.respondents, r2.respondentId),
      getDocForTest<Deleted>(COLLECTIONS.assessmentSessions, r2.sessionId),
      getDocForTest<Deleted>(COLLECTIONS.results, r2.resultId),
    ]);
    expect(respondent!.deletedAt).toBeInstanceOf(Timestamp);
    expect(session!.deletedAt!.isEqual(respondent!.deletedAt!)).toBe(true);
    expect(result!.deletedAt!.isEqual(respondent!.deletedAt!)).toBe(true);
    // 削除した受験の previousResultId は書き換えない（11-2 §3.7、11-7 §2.2.3）
    expect(result!.previousResultId).toBe(r1.resultId);

    const after = await getList(owner);
    expect(after.rows.map((r) => r.resultId)).toEqual([r1.resultId]);
    expect(examIds(after.rows[0])).toEqual([r1.resultId]);
    expect(after.rows[0]!.respondentId).toBe(r1.respondentId);

    const usage = await callRoute(listUsageLogsRoute, {
      method: "GET",
      url: "/api/v1/admin/usage-logs",
      cookieHeader: owner.cookieHeader,
    });
    const logs = (await usage.json()) as UsageLogListDto;
    expect(logs.items.map((i) => i.usageLogId)).toContain(r2.usageLogId);

    const second = await deleteRespondent(owner, r2.respondentId);
    expect(second.status).toBe(404);
    expect(await errorCode(second)).toBe("RESPONDENT_NOT_FOUND");
  });
});

describe("PF-08 回答一覧と受検者の更新の応答時間（1,000 件。ローカル Emulator）", () => {
  it(
    "例外（直接書き込み: 受験 1,000 件とその受検者。200 人は 2 回受けたつながり）: GET /admin/results と PATCH（チーム）の時間を記録する",
    { timeout: 180_000 },
    async () => {
      const { org, owner } = await createOrganizationWithOwner("性能計測サロン");
      const score = toResultDocFields(scoreAnswers(cyclicAnswers()));
      const base = Date.parse("2026-01-01T00:00:00.000Z");
      const total = 1000;
      const ids = Array.from({ length: total }, (_, i) => ({
        respondentId: `PfRespondent${String(i).padStart(5, "0")}`,
        sessionId: `PfSession${String(i).padStart(5, "0")}`,
        resultId: `PfResult${String(i).padStart(5, "0")}`,
      }));
      const writes: Array<() => Promise<void>> = [];
      ids.forEach((id, i) => {
        // 5 件ごとに 1 件を、1 つ前の受験の再受験にする（200 人が 2 回）
        const previousResultId = i % 5 === 4 ? ids[i - 1]!.resultId : null;
        const kind = previousResultId === null ? "applicant" : "executive";
        const submittedAt = Timestamp.fromMillis(base + i * 60_000);
        writes.push(() =>
          writeDocForTest(COLLECTIONS.respondents, id.respondentId, {
            organizationId: org.organizationId,
            kind,
            name: `計測 ${i}`,
            phoneNumber: "000-0000-0000",
            occupationCode: 2,
            diagnosisExperience: "first_time",
            teamCode: null,
            isExcluded: false,
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
            isExcluded: false,
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

      const listMs: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const started = performance.now();
        const list = await getList(owner);
        listMs.push(performance.now() - started);
        expect(list.rows).toHaveLength(800);
        expect(list.rows.reduce((sum, row) => sum + row.exams.length, 0)).toBe(total);
      }
      // 更新は一覧の全件を読んでからつながりに書く。最新の再受験（2 件のつながり）のチームを変える
      const target = ids[total - 1]!;
      const patchMs: number[] = [];
      for (const teamCode of ["A", "B", null]) {
        const started = performance.now();
        const res = await patchRespondent(owner, target.respondentId, { teamCode });
        patchMs.push(performance.now() - started);
        expect(res.status).toBe(200);
        expect(((await res.json()) as { resultIds: string[] }).resultIds).toEqual([
          target.resultId,
          ids[total - 2]!.resultId,
        ]);
      }
      const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      // eslint-disable-next-line no-console -- PF-08 の計測値をテストログに残す（08 §3.9）。目安の値は無いので閾値は置かない
      console.info(
        `PF-08 GET /admin/results（1,000 件・800 行）: median ${median(listMs).toFixed(0)} ms, max ${Math.max(...listMs).toFixed(0)} ms / PATCH（チーム）: median ${median(patchMs).toFixed(0)} ms, max ${Math.max(...patchMs).toFixed(0)} ms`,
      );
    },
  );
});
