// M7 のデータモデル（11 総論 5.4 の PR-7.2 の完了条件「項目の無い既存の文書を読んでも壊れない」、08 §8.2 の 5・D08-30）。
// (1) 作成時の値: M7-exam-20・24・25 のデータの分、M7-list-31（求職者・既存スタッフ）、M7-ai-37 の作成時の値、
//     aiAnalyses の 3 項目、adminUsers の既読
// (2) M7 より前の形の文書: M7 で足した項目を消した文書を、リポジトリと今の API・印刷用ページのデータが補って読む
//     （M7-exam-31、M7-list-32 の補いの分、M7-ai-34 の M7 より前の形の文書の分）。公開の時点で受験中の人の
//     保存と送信（11-1 §3.6）、M7 より前の組織の招待の受け付けとリンクの作り直しも確かめる
import { FieldValue } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getMeRoute } from "@/app/api/v1/admin/me/route";
import { POST as rotateInviteRoute } from "@/app/api/v1/admin/organization/invite-token/route";
import { PATCH as patchRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import {
  GET as getAiRoute,
  POST as postAiRoute,
} from "@/app/api/v1/admin/results/[resultId]/ai-analysis/route";
import { GET as getComparisonRoute } from "@/app/api/v1/admin/results/[resultId]/comparison/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { GET as listResultsRoute } from "@/app/api/v1/admin/results/route";
import { POST as postInviteRoute } from "@/app/auth/invite/route";
import type { Viewer } from "@/lib/auth/claims";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { issuePdfToken } from "@/lib/auth/pdf-token";
import { COLLECTIONS, type CollectionName } from "@/lib/db/collections";
import { getAdminUser } from "@/lib/db/repositories/admin-users-repository";
import { getAiAnalysis } from "@/lib/db/repositories/ai-analyses-repository";
import { getSession } from "@/lib/db/repositories/assessment-sessions-repository";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import { getRespondent } from "@/lib/db/repositories/respondents-repository";
import { getResult } from "@/lib/db/repositories/results-repository";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { getExamPage } from "@/lib/presentation/exam-pages";
import type { InviteRotatedDto, RespondentUpdatedDto } from "@/lib/services/dto/admin";
import { loadPrintData, type PrintData } from "@/lib/services/print-data";

import {
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  uniqueEmail,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { getDocForTest } from "../helpers/firestore";
import { registerViaApi, respondentApi, type RegisteredViaApi } from "../helpers/respondent-api";
import { callRoute } from "../helpers/routes";

type Doc = Record<string, unknown>;

/** results に M7 で足した項目（11-2 §3.1、11-7 §3.1、11-6 §3.1） */
const RESULT_M7_FIELDS = [
  "employmentStatus",
  "hiredOn",
  "leftOn",
  "staffRole",
  "previousResultId",
  "trainingAiStatus",
  "trainingAiStartedAt",
  "trainingAiError",
  "latestTrainingAiAnalysisId",
  "trainingContext",
  "longitudinalAiStatus",
  "longitudinalAiStartedAt",
  "longitudinalAiError",
  "latestLongitudinalAiAnalysisId",
] as const;

/** 育成・定着と経年比較の AI 解説の作成時の値（11-6 §3.1） */
const AI_INITIAL = {
  trainingAiStatus: "not_generated",
  trainingAiStartedAt: null,
  trainingAiError: null,
  latestTrainingAiAnalysisId: null,
  trainingContext: null,
  longitudinalAiStatus: "not_generated",
  longitudinalAiStartedAt: null,
  longitudinalAiError: null,
  latestLongitudinalAiAnalysisId: null,
} as const;

/**
 * 例外的な直接書き込み（08 D08-18 に足す M7 の例外）: M7 で足した項目を消して、M7 より前の形の文書にする
 */
async function stripFields(
  collection: CollectionName,
  id: string,
  fields: readonly string[],
): Promise<void> {
  await adminFirestore()
    .collection(collection)
    .doc(id)
    .update(Object.fromEntries(fields.map((f) => [f, FieldValue.delete()])));
}

/** ページ pageNo の全設問に choice を付けた本文 */
function pageBody(pageNo: number, choice = 3) {
  return {
    pageNo,
    answers: getExamPage(pageNo).questions.map((q) => ({
      questionNo: q.questionNo,
      choiceCode: choice,
    })),
  };
}

/** 呼ぶたびに変わる値（比較の計算の時刻）を除いた応答 */
function stableBody(name: string, body: unknown): unknown {
  if (name !== "comparison") return body;
  const { computedAt, ...rest } = body as Doc;
  expect(typeof computedAt).toBe("string");
  return rest;
}

const adminGet = (
  handler: Parameters<typeof callRoute>[0],
  url: string,
  admin: TestAdmin,
  params: Record<string, string> = {},
) => callRoute(handler, { method: "GET", url, params, cookieHeader: admin.cookieHeader });

let org: TestOrganization;
let owner: TestAdmin;
let viewer: Viewer;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("データモデルサロン"));
  viewer = { uid: owner.uid, organizationId: org.organizationId, role: "owner" };
});

describe("作成時の値（M7 の項目を書く）", () => {
  it("M7-exam-20 のデータの分: 登録した respondents.previousResultId と assessmentSessions.lastSavedStepNo が null", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const session = (await getDocForTest<Doc>(COLLECTIONS.assessmentSessions, r.sessionId))!;
    expect(session).toMatchObject({ lastSavedStepNo: null, lastSavedPageNo: null });
    const respondent = (await getDocForTest<Doc>(
      COLLECTIONS.respondents,
      session.respondentId as string,
    ))!;
    expect(respondent).toMatchObject({ previousResultId: null });
    expect(Object.hasOwn(respondent, "previousResultId")).toBe(true);
  });

  it("M7-exam-24・M7-list-31・M7-ai-37: 求職者用で送信した results は candidate、入社日・退職日・役職・前回は null、AI の 9 項目は作成時の値", async () => {
    const submitted = await submitAnswerSet(org, cyclicAnswers());
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, submitted.resultId))!;
    expect(result).toMatchObject({
      respondentKind: "applicant",
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
      ...AI_INITIAL,
      // 採用向けの 4 項目は今のまま
      aiGenerationStatus: "not_generated",
      aiGenerationStartedAt: null,
      aiGenerationError: null,
      latestAiAnalysisId: null,
    });
    for (const field of RESULT_M7_FIELDS) expect(Object.hasOwn(result, field), field).toBe(true);
  });

  it("M7-exam-25・M7-list-31: 既存スタッフ用の受験は employed で、results.respondentKind・usageLogs.respondentKind が executive", async () => {
    const submitted = await submitAnswerSet(org, uniformAnswers(4), { kind: "executive" });
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, submitted.resultId))!;
    const usage = (await getDocForTest<Doc>(COLLECTIONS.usageLogs, submitted.usageLogId))!;
    expect(result).toMatchObject({
      respondentKind: "executive",
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
    });
    expect(usage.respondentKind).toBe("executive");
  });

  it("今の AI の API（スタブ）で作った aiAnalyses は trainingContext・previousResultId・usedTrainingAction が null", async () => {
    const submitted = await submitAnswerSet(org, uniformAnswers(2), { name: "生成 花子" });
    const res = await callRoute(postAiRoute, {
      method: "POST",
      url: `/api/v1/admin/results/${submitted.resultId}/ai-analysis`,
      params: { resultId: submitted.resultId },
      cookieHeader: owner.cookieHeader,
    });
    expect(res.status).toBe(200);
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, submitted.resultId))!;
    const analysis = (await getDocForTest<Doc>(
      COLLECTIONS.aiAnalyses,
      result.latestAiAnalysisId as string,
    ))!;
    expect(analysis).toMatchObject({
      analysisKind: "recruitment",
      trainingContext: null,
      previousResultId: null,
      usedTrainingAction: null,
    });
    // 育成・定着と経年比較の項目は変わらない
    expect(result).toMatchObject({ aiGenerationStatus: "completed", ...AI_INITIAL });
  });

  it("createAdminAccount で作った adminUsers.dismissedAnnouncements は {}、organizations は inviteToken を持つ", async () => {
    expect(
      (await getDocForTest<Doc>(COLLECTIONS.adminUsers, owner.uid))!.dismissedAnnouncements,
    ).toEqual({});
    expect(
      (await getDocForTest<Doc>(COLLECTIONS.organizations, org.organizationId))!.inviteToken,
    ).toBe(org.inviteToken);
  });
});

describe("M7 より前の形の文書を読んでも壊れない（例外的な直接書き込み: M7 で足した項目を消す）", () => {
  let legacyOrg: TestOrganization;
  let legacyOwner: TestAdmin;
  let target: Awaited<ReturnType<typeof submitAnswerSet>>;
  let executive: Awaited<ReturnType<typeof submitAnswerSet>>;
  let draft: RegisteredViaApi;
  let aiAnalysisId: string;
  /** 項目を消す前の応答（同じ形と値を返すことを確かめる） */
  const before = new Map<string, unknown>();
  let printBefore: PrintData | null;

  /** 印刷用ページのデータ（PDF。比較なし・full）。トークンはその時刻で作る */
  const loadPrint = () => {
    const now = new Date();
    const token = issuePdfToken(
      {
        resultId: target.resultId,
        organizationId: legacyOrg.organizationId,
        adminUid: legacyOwner.uid,
        role: "owner",
        mode: "full",
        scope: null,
      },
      now,
    );
    return loadPrintData({ resultId: target.resultId, query: { mode: "full", token }, now });
  };

  const calls = () => {
    const resultId = target.resultId;
    return {
      list: () => adminGet(listResultsRoute, "/api/v1/admin/results", legacyOwner),
      detail: () =>
        adminGet(getResultRoute, `/api/v1/admin/results/${resultId}`, legacyOwner, { resultId }),
      executiveDetail: () =>
        adminGet(getResultRoute, `/api/v1/admin/results/${executive.resultId}`, legacyOwner, {
          resultId: executive.resultId,
        }),
      comparison: () =>
        adminGet(
          getComparisonRoute,
          `/api/v1/admin/results/${resultId}/comparison?scope=organization`,
          legacyOwner,
          { resultId },
        ),
      ai: () =>
        adminGet(getAiRoute, `/api/v1/admin/results/${resultId}/ai-analysis`, legacyOwner, {
          resultId,
        }),
      me: () => adminGet(getMeRoute, "/api/v1/admin/me", legacyOwner),
      session: () => respondentApi.progress(draft.sessionId, draft.cookieHeader),
    };
  };

  beforeAll(async () => {
    ({ org: legacyOrg, owner: legacyOwner } = await createOrganizationWithOwner("移行前サロン"));
    target = await submitAnswerSet(legacyOrg, cyclicAnswers(), { name: "移行前 太郎" });
    executive = await submitAnswerSet(legacyOrg, uniformAnswers(4), { kind: "executive" });
    const generated = await callRoute(postAiRoute, {
      method: "POST",
      url: `/api/v1/admin/results/${target.resultId}/ai-analysis`,
      params: { resultId: target.resultId },
      cookieHeader: legacyOwner.cookieHeader,
    });
    expect(generated.status).toBe(200);
    aiAnalysisId = (await getDocForTest<Doc>(COLLECTIONS.results, target.resultId))!
      .latestAiAnalysisId as string;
    // 受験中のセッション（lastSavedPageNo だけを持つ形にする）
    draft = await registerViaApi({ organizationId: legacyOrg.organizationId });
    expect(
      (await respondentApi.saveAnswers(draft.sessionId, draft.cookieHeader, pageBody(1))).status,
    ).toBe(200);

    for (const [name, call] of Object.entries(calls())) {
      const res = await call();
      expect(res.status, name).toBe(200);
      before.set(name, stableBody(name, await res.json()));
    }
    printBefore = await loadPrint();
    expect(printBefore?.visibility.showAiAnalysis).toBe(true);

    for (const r of [target, executive]) {
      await stripFields(COLLECTIONS.results, r.resultId, RESULT_M7_FIELDS);
      await stripFields(COLLECTIONS.respondents, r.respondentId, ["previousResultId"]);
      await stripFields(COLLECTIONS.assessmentSessions, r.sessionId, ["lastSavedStepNo"]);
    }
    const draftSession = (await getDocForTest<Doc>(
      COLLECTIONS.assessmentSessions,
      draft.sessionId,
    ))!;
    await stripFields(COLLECTIONS.assessmentSessions, draft.sessionId, ["lastSavedStepNo"]);
    await stripFields(COLLECTIONS.respondents, draftSession.respondentId as string, [
      "previousResultId",
    ]);
    await stripFields(COLLECTIONS.aiAnalyses, aiAnalysisId, [
      "trainingContext",
      "previousResultId",
      "usedTrainingAction",
    ]);
    await stripFields(COLLECTIONS.adminUsers, legacyOwner.uid, ["dismissedAnnouncements"]);
    await stripFields(COLLECTIONS.organizations, legacyOrg.organizationId, ["inviteToken"]);
  });

  it("項目が消えている（M7 より前の形）", async () => {
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, target.resultId))!;
    for (const field of RESULT_M7_FIELDS) expect(result, field).not.toHaveProperty(field);
    const session = (await getDocForTest<Doc>(COLLECTIONS.assessmentSessions, draft.sessionId))!;
    expect(session).not.toHaveProperty("lastSavedStepNo");
    expect(session.lastSavedPageNo).toBe(1);
    expect(await getDocForTest<Doc>(COLLECTIONS.adminUsers, legacyOwner.uid)).not.toHaveProperty(
      "dismissedAnnouncements",
    );
    expect(
      await getDocForTest<Doc>(COLLECTIONS.organizations, legacyOrg.organizationId),
    ).not.toHaveProperty("inviteToken");
  });

  it("リポジトリが補いの値を返す（getResult・getRespondent・getSession・getAdminUser・getOrganization・getAiAnalysis）", async () => {
    const legacyViewer: Viewer = {
      ...viewer,
      uid: legacyOwner.uid,
      organizationId: legacyOrg.organizationId,
    };
    expect(await getResult({ resultId: target.resultId, viewer: legacyViewer })).toMatchObject({
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
      ...AI_INITIAL,
      aiGenerationStatus: "completed",
      latestAiAnalysisId: aiAnalysisId,
    });
    expect(await getResult({ resultId: executive.resultId, viewer: legacyViewer })).toMatchObject({
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
    expect(
      (await getRespondent({ respondentId: target.respondentId, viewer: legacyViewer }))
        ?.previousResultId,
    ).toBeNull();
    expect(await getSession(draft.sessionId)).toMatchObject({
      lastSavedStepNo: null,
      lastSavedPageNo: 1,
    });
    expect((await getAdminUser(legacyOwner.uid))?.dismissedAnnouncements.size).toBe(0);
    expect((await getOrganization(legacyOrg.organizationId))?.inviteToken).toBeNull();
    expect(
      await getAiAnalysis({
        aiAnalysisId,
        resultId: target.resultId,
        organizationId: legacyOrg.organizationId,
      }),
    ).toMatchObject({ trainingContext: null, previousResultId: null, usedTrainingAction: null });
  });

  it("今の API（一覧・詳細・比較・AI 解説・GET /me・受検者の進行状態）が 200 で、項目を消す前と同じ応答を返す", async () => {
    for (const [name, call] of Object.entries(calls())) {
      const res = await call();
      expect(res.status, name).toBe(200);
      expect(stableBody(name, await res.json()), name).toEqual(before.get(name));
    }
  });

  it("印刷用ページのデータ（loadPrintData。PDF）も補って読み、項目を消す前と同じ値を返す", async () => {
    expect(await loadPrint()).toEqual(printBefore);
  });

  it("PATCH /admin/respondents/{id} も補って読み、200 で今の応答の形を返す", async () => {
    const res = await callRoute(patchRespondentRoute, {
      method: "PATCH",
      url: `/api/v1/admin/respondents/${target.respondentId}`,
      params: { respondentId: target.respondentId },
      body: { teamCode: "A" },
      cookieHeader: legacyOwner.cookieHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RespondentUpdatedDto;
    expect(body).toMatchObject({ respondentId: target.respondentId, teamCode: "A" });
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, target.resultId))!;
    expect(result.teamCode).toBe("A");
    // 移行（backfill-m7）の前なので、M7 の項目は書かれないまま
    expect(result).not.toHaveProperty("employmentStatus");
  });

  it("公開の時点で受験中の人（11-1 §3.6）: M7 より前の形の受検者・セッションのまま残りを保存して送信でき、results に M7 の項目が入る", async () => {
    for (let pageNo = 2; pageNo <= 20; pageNo += 1) {
      const saved = await respondentApi.saveAnswers(
        draft.sessionId,
        draft.cookieHeader,
        pageBody(pageNo),
      );
      expect(saved.status, `ページ ${pageNo}`).toBe(200);
    }
    expect((await respondentApi.submit(draft.sessionId, draft.cookieHeader)).status).toBe(200);

    const session = (await getDocForTest<Doc>(COLLECTIONS.assessmentSessions, draft.sessionId))!;
    expect(session.status).toBe("submitted");
    const result = (await getDocForTest<Doc>(COLLECTIONS.results, session.resultId as string))!;
    expect(result).toMatchObject({
      respondentKind: "applicant",
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
      ...AI_INITIAL,
    });
    for (const field of RESULT_M7_FIELDS) expect(Object.hasOwn(result, field), field).toBe(true);
    // 既存の受検者は変えない（11-1 §3.6）。送信も previousResultId を足さない（読み取りで null とみなす）
    const respondent = (await getDocForTest<Doc>(
      COLLECTIONS.respondents,
      session.respondentId as string,
    ))!;
    expect(respondent.resultId).toBe(session.resultId);
    expect(respondent).not.toHaveProperty("previousResultId");
  });

  it("M7 より前の組織（inviteToken なし）でも招待を受け付け、作った管理者の dismissedAnnouncements は {}", async () => {
    const email = uniqueEmail("legacy-invite");
    const res = await callRoute(postInviteRoute, {
      method: "POST",
      url: "/auth/invite",
      body: { inviteToken: legacyOrg.inviteToken, name: "移行前 招待", email },
    });
    expect(res.status).toBe(200);
    const { uid } = await adminAuth().getUserByEmail(email);
    const invited = (await getDocForTest<Doc>(COLLECTIONS.adminUsers, uid))!;
    expect(invited).toMatchObject({ organizationId: legacyOrg.organizationId, role: "admin" });
    expect(invited.dismissedAnnouncements).toEqual({});
    // 組織の文書は変わらない（inviteToken は無いまま）
    expect(
      await getDocForTest<Doc>(COLLECTIONS.organizations, legacyOrg.organizationId),
    ).not.toHaveProperty("inviteToken");
  });

  it("M7 より前の組織（inviteToken なし）で招待のリンクを作り直すと、平文とハッシュが同じトークンで入る", async () => {
    const res = await callRoute(rotateInviteRoute, {
      method: "POST",
      url: "/api/v1/admin/organization/invite-token",
      cookieHeader: legacyOwner.cookieHeader,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InviteRotatedDto;
    const orgDoc = (await getDocForTest<Doc>(COLLECTIONS.organizations, legacyOrg.organizationId))!;
    const token = orgDoc.inviteToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toBe(legacyOrg.inviteToken);
    expect(orgDoc.inviteTokenHash).toBe(hashInviteToken(token));
    expect(body.adminInvite.endsWith(`?q=${token}`)).toBe(true);
    expect((await getOrganization(legacyOrg.organizationId))?.inviteToken).toBe(token);
  });
});
