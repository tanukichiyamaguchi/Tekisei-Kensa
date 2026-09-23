// I-23〜I-30 比較 API（04 §5.5）。母集団の条件（00 §1.11）、POPULATION_EMPTY、非永続化、応答内の整合
import { describe, expect, it } from "vitest";

import { GET as getComparisonRoute } from "@/app/api/v1/admin/results/[resultId]/comparison/route";
import { PATCH as patchRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { COLLECTIONS } from "@/lib/db/collections";
import { adminFirestore } from "@/lib/firebase/admin";
import type { ComparisonDto } from "@/lib/services/dto/result";
import { COMPATIBILITY_KEYS, TRAIT_KEYS } from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

import {
  createAdmin,
  createOrganizationWithOwner,
  createTestOrganization,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { getDocForTest, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

const compare = (admin: TestAdmin, resultId: string, query = "?scope=organization") =>
  callRoute(getComparisonRoute, {
    method: "GET",
    url: `/api/v1/admin/results/${resultId}/comparison${query}`,
    params: { resultId },
    cookieHeader: admin.cookieHeader,
  });

const patchRespondent = (admin: TestAdmin, respondentId: string, body: unknown) =>
  callRoute(patchRespondentRoute, {
    method: "PATCH",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    body,
    cookieHeader: admin.cookieHeader,
  });

async function compareOk(admin: TestAdmin, resultId: string, query?: string) {
  const res = await compare(admin, resultId, query);
  expect(res.status).toBe(200);
  return (await res.json()) as ComparisonDto;
}

/** 1 組織を作り、求職者 2 件（全問 1、全問 3）を送信する（I-23 の状態） */
async function setupI23() {
  const { org, owner } = await createOrganizationWithOwner("比較テスト歯科");
  const admin = await createAdmin(org, "admin");
  const low = await submitAnswerSet(org, uniformAnswers(1));
  const mid = await submitAnswerSet(org, uniformAnswers(3));
  return { org, owner, admin, low, mid };
}

describe("I-23 組織全体の比較（03 T-12 と同値）", () => {
  it("母集団 2 件で平均 15.5・合致度 96・偏差値 64・A・strong_leader", async () => {
    const { owner, low } = await setupI23();
    const body = await compareOk(owner, low.resultId);
    expect(body.populationSize).toBe(2);
    expect(body.includesSubject).toBe(true);
    expect(body.scope).toEqual({ kind: "organization" });
    for (const key of TRAIT_KEYS) expect(body.traitAverages[key]).toBe(15.5);
    expect(body.matchScore).toBe(96);
    expect(COMPATIBILITY_KEYS.map((k) => body.axisDeviations[k])).toEqual([70, 75, 75, 65, 35]);
    expect(body.deviationScore).toBe(64);
    expect(body.grade).toBe("A");
    expect(body.position).toBe("strong_leader");
    expect(body.resultId).toBe(low.resultId);
    expect(body.scoringVersion).toBe(SCORING_VERSION);
    expect(Number.isNaN(Date.parse(body.computedAt))).toBe(false);
  });
});

describe("I-24 除外を反映した比較", () => {
  it("全問 3 を除外すると母集団 1 件（本人のみ）で差分 0・100・50・B・cooperative_leader", async () => {
    const { owner, low, mid } = await setupI23();
    const patched = await patchRespondent(owner, mid.respondentId, { isExcluded: true });
    expect(patched.status).toBe(200);
    const body = await compareOk(owner, low.resultId);
    expect(body.populationSize).toBe(1);
    for (const key of TRAIT_KEYS) expect(body.traitDiffs[key]).toBe(0);
    expect(body.matchScore).toBe(100);
    expect(body.deviationScore).toBe(50);
    expect(body.grade).toBe("B");
    expect(body.position).toBe("cooperative_leader");
    const result = await getDocForTest<{ isExcluded: boolean }>(COLLECTIONS.results, mid.resultId);
    expect(result?.isExcluded).toBe(true);
  });

  it("除外された本人の比較は includesSubject = false（母集団に含まれない）", async () => {
    const { owner, low, mid } = await setupI23();
    await patchRespondent(owner, mid.respondentId, { isExcluded: true });
    const body = await compareOk(owner, mid.resultId);
    expect(body.populationSize).toBe(1);
    expect(body.includesSubject).toBe(false);
    expect(low.resultId).not.toBe(mid.resultId);
  });
});

describe("I-25 幹部は admin が閲覧できなくても母集団に含まれる（10 K-01）", () => {
  it("admin の比較で populationSize = 3", async () => {
    const { org, admin, low } = await setupI23();
    await submitAnswerSet(org, uniformAnswers(3), { kind: "executive" });
    const body = await compareOk(admin, low.resultId);
    expect(body.populationSize).toBe(3);
  });
});

describe("I-26 別組織の受検者は母集団に含まれない", () => {
  it("別組織に送信しても populationSize は 2 のまま", async () => {
    const { owner, low } = await setupI23();
    const other: TestOrganization = await createTestOrganization("別組織歯科");
    await submitAnswerSet(other, uniformAnswers(5));
    const body = await compareOk(owner, low.resultId);
    expect(body.populationSize).toBe(2);
  });
});

describe("I-27 採点方式の版が異なる結果は母集団から外れる", () => {
  it("writeDocForTest（直接書き込みの例外）で scoringVersion を 0.9.9 にした 1 件が外れる", async () => {
    const { owner, low, mid } = await setupI23();
    await writeDocForTest(COLLECTIONS.results, mid.resultId, { scoringVersion: "0.9.9" });
    const body = await compareOk(owner, low.resultId);
    expect(body.populationSize).toBe(1);
  });
});

describe("I-28 チーム単位の比較", () => {
  it("チーム A の母集団は 1 件、誰もいないチーム C は 409 POPULATION_EMPTY", async () => {
    const { owner, low, mid } = await setupI23();
    expect((await patchRespondent(owner, low.respondentId, { teamCode: "A" })).status).toBe(200);
    expect((await patchRespondent(owner, mid.respondentId, { teamCode: "B" })).status).toBe(200);

    const teamA = await compareOk(owner, low.resultId, "?scope=team&teamCode=A");
    expect(teamA.populationSize).toBe(1);
    expect(teamA.scope).toEqual({ kind: "team", teamCode: "A" });
    expect(teamA.includesSubject).toBe(true);

    // 本人がチーム A でもチーム B とも比較できる（本人を含まない母集団）
    const teamB = await compareOk(owner, low.resultId, "?scope=team&teamCode=B");
    expect(teamB.populationSize).toBe(1);
    expect(teamB.includesSubject).toBe(false);

    const empty = await compare(owner, low.resultId, "?scope=team&teamCode=C");
    expect(empty.status).toBe(409);
    const error = (await empty.json()) as { error: { code: string; details?: unknown } };
    expect(error.error.code).toBe("POPULATION_EMPTY");
    expect(error.error.details).toEqual({ scope: "team", teamCode: "C" });
  });

  it("組織全体の母集団が 0 件（全員除外）も 409 POPULATION_EMPTY（scope: organization）", async () => {
    const { owner, low, mid } = await setupI23();
    await patchRespondent(owner, low.respondentId, { isExcluded: true });
    await patchRespondent(owner, mid.respondentId, { isExcluded: true });
    const res = await compare(owner, low.resultId);
    expect(res.status).toBe(409);
    const error = (await res.json()) as { error: { code: string; details?: unknown } };
    expect(error.error.details).toEqual({ scope: "organization" });
  });

  it("クエリの不正（scope なし、team で teamCode なし、organization に teamCode、小文字）は 422", async () => {
    const { owner, low } = await setupI23();
    for (const query of [
      "",
      "?scope=team",
      "?scope=organization&teamCode=A",
      "?scope=team&teamCode=a",
      "?scope=all",
    ]) {
      const res = await compare(owner, low.resultId, query);
      expect(res.status, query).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    }
  });

  it("resultId が文書 ID の形式でなければ 404 NOT_FOUND、存在しなければ 404 RESULT_NOT_FOUND", async () => {
    const { owner } = await setupI23();
    const bad = await compare(owner, "bad id!");
    expect(bad.status).toBe(404);
    expect(await errorCode(bad)).toBe("NOT_FOUND");
    const missing = await compare(owner, "NoSuchResult00000000");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("RESULT_NOT_FOUND");
  });
});

describe("I-29 比較値を保存しない（要件定義書 §11 の 6 番）", () => {
  it("3 回・別チームで呼んでも adminUsers・results・respondents が変わらず、比較用のコレクションも無い", async () => {
    const { owner, low, mid } = await setupI23();
    await patchRespondent(owner, low.respondentId, { teamCode: "A" });
    await patchRespondent(owner, mid.respondentId, { teamCode: "B" });

    const snapshot = async () => ({
      adminUser: await getDocForTest(COLLECTIONS.adminUsers, owner.uid),
      lowResult: await getDocForTest(COLLECTIONS.results, low.resultId),
      midResult: await getDocForTest(COLLECTIONS.results, mid.resultId),
      lowRespondent: await getDocForTest(COLLECTIONS.respondents, low.respondentId),
      midRespondent: await getDocForTest(COLLECTIONS.respondents, mid.respondentId),
    });
    const before = await snapshot();

    await compareOk(owner, low.resultId);
    await compareOk(owner, low.resultId, "?scope=team&teamCode=A");
    await compareOk(owner, low.resultId, "?scope=team&teamCode=B");

    expect(await snapshot()).toEqual(before);
    const collections = (await adminFirestore().listCollections()).map((c) => c.id);
    const allowed: string[] = Object.values(COLLECTIONS);
    for (const id of collections) expect(allowed).toContain(id);
  });
});

describe("I-30 応答内の整合（レーダーの比較系列と合致度が同一母集団）", () => {
  it("traitDiffs = |traitAverages − 受検者|、matchScore = 100 − Σ差分 / 2 を応答から再計算できる", async () => {
    const { org, owner, low } = await setupI23();
    await submitAnswerSet(org, uniformAnswers(5));
    const body = await compareOk(owner, low.resultId);
    expect(body.populationSize).toBe(3);
    const subject = await getDocForTest<{ traits: Record<string, number> }>(
      COLLECTIONS.results,
      low.resultId,
    );
    let sum = 0;
    for (const key of TRAIT_KEYS) {
      const diff = Math.abs(body.traitAverages[key] - subject!.traits[key]!);
      expect(body.traitDiffs[key]).toBeCloseTo(diff, 10);
      sum += diff;
    }
    expect(body.matchScore).toBeCloseTo(100 - sum / 2, 10);
  });
});
