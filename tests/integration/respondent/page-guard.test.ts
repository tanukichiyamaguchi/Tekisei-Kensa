// 受験者側の画面の判定（11-1 §2.1.2 の表、§2.4.8 の guardRespondentPage）。Cookie は next/headers をモックして渡す。
// 05 §1.3 の表のテストを 11-1 §2.1.2 に改めた（11-1 §5.5）
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { getExamStep, type ExamStepNo } from "@/lib/presentation/exam-steps";

import { createTestOrganization, uniformAnswers } from "../helpers/fixtures";
import { writeDocForTest } from "../helpers/firestore";
import { completeViaApi, registerViaApi, respondentApi } from "../helpers/respondent-api";

let cookieValue: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === RESPONDENT_COOKIE_NAME && cookieValue !== null ? { value: cookieValue } : undefined,
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

// React の cache() はリクエストの外（テスト）では記憶しないため、呼ぶたびに Firestore を読み直す
const guard = guardRespondentPage;

const useCookie = (cookieHeader: string | null) => {
  cookieValue = cookieHeader ? cookieHeader.slice(`${RESPONDENT_COOKIE_NAME}=`.length) : null;
};

/** ステップ stepNo の設問に回答を保存する（skip の設問は除く） */
async function saveStep(
  sessionId: string,
  cookieHeader: string,
  stepNo: ExamStepNo,
  skip: readonly number[] = [],
) {
  const res = await respondentApi.saveAnswers(sessionId, cookieHeader, {
    stepNo,
    answers: getExamStep(stepNo)
      .questions.filter((q) => !skip.includes(q.questionNo))
      .map((q) => ({ questionNo: q.questionNo, choiceCode: 3 })),
  });
  expect(res.status).toBe(200);
}

let organizationId: string;

beforeAll(async () => {
  ({ organizationId } = await createTestOrganization("画面判定歯科"));
});

beforeEach(() => {
  cookieValue = null;
});

describe("11-1 §2.1.2 セッションの状態と返す画面", () => {
  it("Cookie なし・不一致・文書 ID の形の不正・削除済み・期限切れは session_unavailable（どの画面でも）", async () => {
    const r = await registerViaApi({ organizationId });
    const unavailable = { kind: "error", error: "session_unavailable" };
    for (const screen of ["start", "questions", "complete"] as const) {
      expect(await guard(r.sessionId, screen)).toEqual(unavailable);
    }
    useCookie(`${RESPONDENT_COOKIE_NAME}=forged-token`);
    expect(await guard(r.sessionId, "questions")).toEqual(unavailable);
    useCookie(r.cookieHeader);
    expect(await guard("bad-id", "start")).toEqual(unavailable);
    // 別のセッションの Cookie（パスの sessionId と一致しない）
    const other = await registerViaApi({ organizationId });
    useCookie(other.cookieHeader);
    expect(await guard(r.sessionId, "start")).toEqual(unavailable);

    const expired = await registerViaApi({ organizationId });
    await writeDocForTest(COLLECTIONS.assessmentSessions, expired.sessionId, {
      tokenExpiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    useCookie(expired.cookieHeader);
    expect(await guard(expired.sessionId, "complete")).toEqual(unavailable);

    const deleted = await registerViaApi({ organizationId });
    await writeDocForTest(COLLECTIONS.assessmentSessions, deleted.sessionId, {
      deletedAt: Timestamp.now(),
    });
    useCookie(deleted.cookieHeader);
    expect(await guard(deleted.sessionId, "questions")).toEqual(unavailable);
  });

  it("draft・未開始: R-02 を表示し、受験画面と完了画面は /exam/{id} へリダイレクト", async () => {
    const r = await registerViaApi({ organizationId });
    useCookie(r.cookieHeader);
    expect(await guard(r.sessionId, "start")).toMatchObject({ kind: "ok", currentStepNo: 1 });
    const toStart = { kind: "redirect", to: `/exam/${r.sessionId}` };
    expect(await guard(r.sessionId, "questions")).toEqual(toStart);
    expect(await guard(r.sessionId, "complete")).toEqual(toStart);
  });

  it("draft・開始済み: /exam/{id} は /exam/{id}/questions へ。受験画面は表示し、Step 1 を保存すると currentStepNo = 2（K-41）", async () => {
    const r = await registerViaApi({ organizationId });
    await respondentApi.start(r.sessionId, r.cookieHeader);
    useCookie(r.cookieHeader);
    const toQuestions = { kind: "redirect", to: `/exam/${r.sessionId}/questions` };
    expect(await guard(r.sessionId, "start")).toEqual(toQuestions);
    expect(await guard(r.sessionId, "questions")).toMatchObject({ kind: "ok", currentStepNo: 1 });

    await saveStep(r.sessionId, r.cookieHeader, 1);
    expect(await guard(r.sessionId, "start")).toEqual(toQuestions);
    expect(await guard(r.sessionId, "questions")).toMatchObject({ kind: "ok", currentStepNo: 2 });
    expect(await guard(r.sessionId, "complete")).toEqual({
      kind: "redirect",
      to: `/exam/${r.sessionId}`,
    });

    // 途中までの回答は保存したまま、未回答の設問がある最初のステップ（Step 2 を保存しても Step 1 に穴があれば 1）
    const gap = await registerViaApi({ organizationId });
    await respondentApi.start(gap.sessionId, gap.cookieHeader);
    await saveStep(gap.sessionId, gap.cookieHeader, 1, [5]);
    await saveStep(gap.sessionId, gap.cookieHeader, 2);
    useCookie(gap.cookieHeader);
    const result = await guard(gap.sessionId, "questions");
    expect(result).toMatchObject({ kind: "ok", currentStepNo: 1 });
    if (result.kind === "ok") expect(result.session.answeredCount).toBe(81);
  });

  it("送信済み: 完了画面を表示し、それ以外の URL は完了画面へ", async () => {
    const r = await completeViaApi(organizationId, uniformAnswers(1));
    useCookie(r.cookieHeader);
    const toComplete = { kind: "redirect", to: `/exam/${r.sessionId}/complete` };
    expect(await guard(r.sessionId, "start")).toEqual(toComplete);
    expect(await guard(r.sessionId, "questions")).toEqual(toComplete);
    const complete = await guard(r.sessionId, "complete");
    expect(complete).toMatchObject({ kind: "ok", currentStepNo: 4 });
    if (complete.kind === "ok") expect(complete.session.status).toBe("submitted");
  });

  it("組織が論理削除された後は session_unavailable", async () => {
    const org = await createTestOrganization("削除される歯科");
    const r = await registerViaApi({ organizationId: org.organizationId });
    await writeDocForTest(COLLECTIONS.organizations, org.organizationId, {
      deletedAt: Timestamp.now(),
    });
    useCookie(r.cookieHeader);
    expect(await guard(r.sessionId, "start")).toEqual({
      kind: "error",
      error: "session_unavailable",
    });
  });
});
