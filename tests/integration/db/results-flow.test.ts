// I-00（Emulator 接続・results の保存形）、受検の登録 → 保存 → 送信のリポジトリ経路、I-36（複製フィールドの同期）、
// 論理削除の同一バッチ。受検者 API・管理者 API は M3・M4 で追加し、そこで API 経由の I-11〜I-18・I-04 を行う
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/auth/claims";
import { issueRespondentToken } from "@/lib/auth/respondent-token";
import { RepositoryError } from "@/lib/db/errors";
import {
  getSession,
  markSessionStarted,
  saveAnswers,
  submitSession,
} from "@/lib/db/repositories/assessment-sessions-repository";
import {
  getRespondent,
  registerRespondent,
  softDeleteRespondent,
  updateRespondentFlags,
} from "@/lib/db/repositories/respondents-repository";
import { fetchPopulation, getResult, listResults } from "@/lib/db/repositories/results-repository";
import { listUsageLogs } from "@/lib/db/repositories/usage-logs-repository";
import { adminFirestore } from "@/lib/firebase/admin";
import { scoreAnswers } from "@/lib/scoring/score";
import { SCORING_VERSION } from "@/lib/scoring/version";

import {
  createOrganizationWithOwner,
  cyclicAnswers,
  meta,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest } from "../helpers/firestore";

let org: TestOrganization;
let owner: TestAdmin;
let viewer: Viewer;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("結果テスト歯科"));
  viewer = { uid: owner.uid, organizationId: org.organizationId, role: "owner" };
});

async function register(kind: "applicant" | "executive" = "applicant") {
  const token = issueRespondentToken(new Date());
  const registered = await registerRespondent({
    organizationId: org.organizationId,
    kind,
    name: "テスト 花子",
    phoneNumber: "09011112222",
    occupationCode: 1,
    diagnosisExperience: "first_time",
    sessionTokenHash: token.tokenHash,
    tokenExpiresAt: token.expiresAt,
    meta,
  });
  return { ...registered, token };
}

async function expectRepositoryError(
  promise: Promise<unknown>,
  code: string,
): Promise<RepositoryError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  expect((error as RepositoryError).code).toBe(code);
  return error as RepositoryError;
}

describe("I-00 Emulator 接続と results 文書の保存形", () => {
  it("FIREBASE_SERVICE_ACCOUNT_KEY 無しで Emulator に接続でき、ScoreResult の値が倍精度で変化しない", async () => {
    expect(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "").toBe("");
    const answers = cyclicAnswers();
    const { resultId } = await submitAnswerSet(org, answers);
    const expected = scoreAnswers(answers);
    const doc = await getDocForTest(`results`, resultId);
    expect(doc).not.toBeNull();
    for (const key of [
      "traits",
      "compatibility",
      "aptitudes",
      "risks",
      "aptitudeTypeScores",
      "socialStyles",
    ] as const) {
      expect(doc![key]).toStrictEqual({ ...expected[key] });
    }
    for (const key of [
      "scoringVersion",
      "aptitudeFirst",
      "aptitudeSecond",
      "aptitudeType",
      "socialStyle",
      "reliability",
    ] as const) {
      expect(doc![key]).toBe(expected[key]);
    }
    expect(doc!.createdAt).toBeInstanceOf(Timestamp);
    expect(doc!.submittedAt).toBeInstanceOf(Timestamp);
    // deletedAt はフィールド欠落ではなく null として存在する
    expect(Object.prototype.hasOwnProperty.call(doc, "deletedAt")).toBe(true);
    expect(doc!.deletedAt).toBeNull();

    // マッパー経由（getResult）でも深い等価
    const result = await getResult({ resultId, viewer });
    expect(result?.traits).toStrictEqual(expected.traits);
    expect(result?.compatibility).toStrictEqual(expected.compatibility);
  });

  it("倍精度の端数（0.1 + 0.2 など）が保存・読み戻しで変化しない（09 §6.4 の 19）", async () => {
    const values = [0.1 + 0.2, -48.12345678901234, 1 / 3, 2 ** 53 - 1, -0.5];
    const ref = adminFirestore().collection("results").doc();
    await ref.set({ probe: values });
    const snap = await ref.get();
    expect(snap.get("probe")).toStrictEqual(values);
    await ref.delete();
  });

  it("undefined を含む書き込みは拒否される（ignoreUndefinedProperties は既定の false。09 §6.4 の 44）", async () => {
    const ref = adminFirestore().collection("results").doc();
    // Admin SDK は送信前に同期的に例外を投げる
    expect(() => ref.set({ a: 1, b: undefined })).toThrow(/undefined/i);
    expect((await ref.get()).exists).toBe(false);
  });
});

describe("受検の登録 → 保存 → 送信（リポジトリ経路）", () => {
  it("登録は respondents / assessmentSessions / usageLogs / auditLogs を 1 バッチで作り、相互参照が一致する", async () => {
    const r = await register();
    const respondent = await getDocForTest("respondents", r.respondentId);
    const session = await getDocForTest("assessmentSessions", r.sessionId);
    const usage = await getDocForTest("usageLogs", r.usageLogId);
    expect(respondent).toMatchObject({
      sessionId: r.sessionId,
      usageLogId: r.usageLogId,
      resultId: null,
      deletedAt: null,
    });
    expect(session).toMatchObject({
      respondentId: r.respondentId,
      status: "draft",
      answers: {},
      resultId: null,
    });
    expect(session!.sessionTokenHash).toBe(r.token.tokenHash);
    expect(usage).toMatchObject({
      respondentId: r.respondentId,
      resultId: null,
      submittedAt: null,
    });
    // 平文トークンはどの文書にも保存しない
    expect(JSON.stringify([respondent, session, usage])).not.toContain(r.token.token);
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", r.respondentId],
        ["action", "==", "respondent.register"],
      ]),
    ).toBe(1);
  });

  it("存在しない組織への登録は ORGANIZATION_NOT_FOUND で何も書かない", async () => {
    const before = await countDocs("respondents");
    const token = issueRespondentToken(new Date());
    await expectRepositoryError(
      registerRespondent({
        organizationId: "doesNotExist0000",
        kind: "applicant",
        name: "テスト",
        phoneNumber: "09011112222",
        occupationCode: 1,
        diagnosisExperience: "first_time",
        sessionTokenHash: token.tokenHash,
        tokenExpiresAt: token.expiresAt,
        meta,
      }),
      "ORGANIZATION_NOT_FOUND",
    );
    expect(await countDocs("respondents")).toBe(before);
  });

  it("開始の記録は冪等（session.start は 1 件）", async () => {
    const r = await register();
    const first = await markSessionStarted({
      sessionId: r.sessionId,
      tokenExpiresAt: r.token.expiresAt,
      meta,
    });
    const second = await markSessionStarted({
      sessionId: r.sessionId,
      tokenExpiresAt: r.token.expiresAt,
      meta,
    });
    expect(first.isFirstStart).toBe(true);
    expect(second.isFirstStart).toBe(false);
    expect(second.startedAt.getTime()).toBe(first.startedAt.getTime());
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", r.sessionId],
        ["action", "==", "session.start"],
      ]),
    ).toBe(1);
  });

  it("ページ保存は他ページの回答を消さず、上書きは最後の値。範囲外の値は VALIDATION_ERROR", async () => {
    const r = await register();
    await saveAnswers({
      sessionId: r.sessionId,
      answers: { 1: 1, 2: 2 },
      lastSavedPageNo: 1,
      tokenExpiresAt: r.token.expiresAt,
    });
    const second = await saveAnswers({
      sessionId: r.sessionId,
      answers: { 8: 5, 2: 4 },
      lastSavedPageNo: 2,
      tokenExpiresAt: r.token.expiresAt,
    });
    expect(second.answeredCount).toBe(3);
    const s = await getSession(r.sessionId);
    expect(s?.answers).toStrictEqual({ 1: 1, 2: 4, 8: 5 });
    expect(s?.lastSavedPageNo).toBe(2);
    await expectRepositoryError(
      saveAnswers({
        sessionId: r.sessionId,
        answers: { 3: 6 as 1 },
        lastSavedPageNo: 1,
        tokenExpiresAt: r.token.expiresAt,
      }),
      "VALIDATION_ERROR",
    );
    await expectRepositoryError(
      saveAnswers({
        sessionId: r.sessionId,
        answers: { 145: 1 },
        lastSavedPageNo: 1,
        tokenExpiresAt: r.token.expiresAt,
      }),
      "VALIDATION_ERROR",
    );
  });

  it("未回答があると ANSWERS_INCOMPLETE（details.missing）で results を作らない", async () => {
    const r = await register();
    await saveAnswers({
      sessionId: r.sessionId,
      answers: { 1: 1 },
      lastSavedPageNo: 1,
      tokenExpiresAt: r.token.expiresAt,
    });
    const before = await countDocs("results");
    const error = await expectRepositoryError(
      submitSession({ sessionId: r.sessionId, meta }),
      "ANSWERS_INCOMPLETE",
    );
    const missing = (error.details as { missing: number[] }).missing;
    expect(missing).toHaveLength(143);
    expect(missing[0]).toBe(2);
    expect(await countDocs("results")).toBe(before);
    expect((await getSession(r.sessionId))?.status).toBe("draft");
  });

  it("送信は results を作り、session・respondent・usageLog に resultId と同じ submittedAt を入れる。2 回目は SESSION_ALREADY_SUBMITTED", async () => {
    const { respondentId, sessionId, resultId, usageLogId } = await submitAnswerSet(
      org,
      uniformAnswers(3),
    );
    const session = await getDocForTest("assessmentSessions", sessionId);
    const respondent = await getDocForTest("respondents", respondentId);
    const usage = await getDocForTest("usageLogs", usageLogId);
    const result = await getDocForTest("results", resultId);
    expect(session).toMatchObject({ status: "submitted", resultId });
    expect(respondent).toMatchObject({ resultId });
    expect(usage).toMatchObject({ resultId });
    expect((session!.submittedAt as Timestamp).isEqual(result!.submittedAt as Timestamp)).toBe(
      true,
    );
    expect((usage!.submittedAt as Timestamp).isEqual(result!.submittedAt as Timestamp)).toBe(true);
    expect(result).toMatchObject({
      organizationId: org.organizationId,
      respondentId,
      sessionId,
      respondentKind: "applicant",
      teamCode: null,
      isExcluded: false,
      aiGenerationStatus: "not_generated",
      latestAiAnalysisId: null,
      scoringVersion: SCORING_VERSION,
    });
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", resultId],
        ["action", "==", "session.submit"],
      ]),
    ).toBe(1);

    const before = await countDocs("results");
    await expectRepositoryError(submitSession({ sessionId, meta }), "SESSION_ALREADY_SUBMITTED");
    await expectRepositoryError(
      saveAnswers({
        sessionId,
        answers: { 1: 1 },
        lastSavedPageNo: 1,
        tokenExpiresAt: new Date(Date.now() + 60_000),
      }),
      "SESSION_ALREADY_SUBMITTED",
    );
    expect(await countDocs("results")).toBe(before);
  });

  it("同じセッションを並行して 2 回送信しても results は 1 件（トランザクション）", async () => {
    const r = await register();
    const answers = uniformAnswers(2);
    for (let start = 1; start <= 144; start += 8) {
      const page: Record<number, 2> = {};
      for (let q = start; q < start + 8 && q <= 144; q += 1) page[q] = answers[q] as 2;
      await saveAnswers({
        sessionId: r.sessionId,
        answers: page,
        lastSavedPageNo: 1,
        tokenExpiresAt: r.token.expiresAt,
      });
    }
    const settled = await Promise.allSettled([
      submitSession({ sessionId: r.sessionId, meta }),
      submitSession({ sessionId: r.sessionId, meta }),
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]!.reason as RepositoryError).code).toBe("SESSION_ALREADY_SUBMITTED");
    expect(await countDocs("results", [["sessionId", "==", r.sessionId]])).toBe(1);
  });
});

describe("I-36 複製フィールドの同期（updateRespondentFlags）", () => {
  it("teamCode A → B → null、isExcluded true → false で respondents と results が常に一致し updatedAt が同じ", async () => {
    const { respondentId, resultId } = await submitAnswerSet(org, uniformAnswers(4));
    const steps: Array<{ teamCode?: "A" | "B" | null; isExcluded?: boolean }> = [
      { teamCode: "A" },
      { teamCode: "B" },
      { teamCode: null },
      { isExcluded: true },
      { isExcluded: false },
    ];
    for (const patch of steps) {
      await updateRespondentFlags({ respondentId, viewer, patch, meta });
      const r = await getDocForTest("respondents", respondentId);
      const res = await getDocForTest("results", resultId);
      expect(res!.teamCode).toBe(r!.teamCode);
      expect(res!.isExcluded).toBe(r!.isExcluded);
      expect((res!.updatedAt as Timestamp).isEqual(r!.updatedAt as Timestamp)).toBe(true);
      expect(res!.respondentKind).toBe(r!.kind);
      const row = (await listResults({ viewer })).find((x) => x.resultId === resultId);
      expect(row?.teamCode).toBe(r!.teamCode);
      expect(row?.isExcluded).toBe(r!.isExcluded);
    }
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", respondentId],
        ["action", "==", "respondent.update_team"],
      ]),
    ).toBe(3);
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", respondentId],
        ["action", "==", "respondent.update_exclusion"],
      ]),
    ).toBe(2);
  });

  it("変更が無ければ何も書かない。不正なチーム（A〜Z 以外）は VALIDATION_ERROR、他組織の受検者は RESPONDENT_NOT_FOUND", async () => {
    const { respondentId } = await submitAnswerSet(org, uniformAnswers(4));
    const before = await countDocs("auditLogs");
    await updateRespondentFlags({
      respondentId,
      viewer,
      patch: { teamCode: null, isExcluded: false },
      meta,
    });
    expect(await countDocs("auditLogs")).toBe(before);
    await expectRepositoryError(
      updateRespondentFlags({ respondentId, viewer, patch: { teamCode: "AA" as "A" }, meta }),
      "VALIDATION_ERROR",
    );
    const other = { ...viewer, organizationId: "otherOrganization0001" };
    await expectRepositoryError(
      updateRespondentFlags({ respondentId, viewer: other, patch: { teamCode: "A" }, meta }),
      "RESPONDENT_NOT_FOUND",
    );
  });

  it("admin は幹部の受検者を変更できない（存在を見せない）", async () => {
    const { respondentId } = await submitAnswerSet(org, uniformAnswers(1), { kind: "executive" });
    await expectRepositoryError(
      updateRespondentFlags({
        respondentId,
        viewer: { ...viewer, role: "admin" },
        patch: { teamCode: "A" },
        meta,
      }),
      "RESPONDENT_NOT_FOUND",
    );
  });
});

describe("論理削除（softDeleteRespondent）", () => {
  it("respondents / assessmentSessions / results の deletedAt が同じ Timestamp。一覧・詳細・母集団から消え、利用履歴は残る", async () => {
    const { respondentId, sessionId, resultId, usageLogId } = await submitAnswerSet(
      org,
      uniformAnswers(5),
    );
    await softDeleteRespondent({ respondentId, viewer, meta });
    const docs = await Promise.all([
      getDocForTest("respondents", respondentId),
      getDocForTest("assessmentSessions", sessionId),
      getDocForTest("results", resultId),
    ]);
    const stamps = docs.map((d) => d!.deletedAt as Timestamp);
    expect(stamps[0]).toBeInstanceOf(Timestamp);
    expect(stamps[1]!.isEqual(stamps[0]!)).toBe(true);
    expect(stamps[2]!.isEqual(stamps[0]!)).toBe(true);

    expect(await getResult({ resultId, viewer })).toBeNull();
    expect(await getRespondent({ respondentId, viewer })).toBeNull();
    expect((await listResults({ viewer })).some((r) => r.resultId === resultId)).toBe(false);
    const population = await fetchPopulation({
      organizationId: org.organizationId,
      scope: { kind: "organization" },
    });
    expect(population.some((p) => p.resultId === resultId)).toBe(false);
    // usageLogs は変更しない（利用履歴は削除後も残る。10 K-04）
    expect(await getDocForTest("usageLogs", usageLogId)).not.toBeNull();
    const usage = await listUsageLogs({ viewer, order: "desc", offset: 0, limit: 200 });
    expect(usage.items.some((u) => u.id === usageLogId)).toBe(true);
    expect(
      await countDocs("auditLogs", [
        ["targetId", "==", respondentId],
        ["action", "==", "respondent.delete"],
      ]),
    ).toBe(1);

    await expectRepositoryError(
      softDeleteRespondent({ respondentId, viewer, meta }),
      "RESPONDENT_NOT_FOUND",
    );
  });
});
