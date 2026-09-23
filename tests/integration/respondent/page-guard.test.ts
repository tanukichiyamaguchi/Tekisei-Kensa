// 受検者画面の判定（05 §1.3、§6.2、§10.6 の guardRespondentPage）。Cookie は next/headers をモックして渡す
import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { getExamPage } from "@/lib/presentation/exam-pages";

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

/** ページ 1〜n の全設問に回答を保存する */
async function savePages(sessionId: string, cookieHeader: string, n: number) {
  for (let pageNo = 1; pageNo <= n; pageNo += 1) {
    await respondentApi.saveAnswers(sessionId, cookieHeader, {
      pageNo,
      answers: getExamPage(pageNo).questions.map((q) => ({
        questionNo: q.questionNo,
        choiceCode: 3,
      })),
    });
  }
}

let organizationId: string;

beforeAll(async () => {
  ({ organizationId } = await createTestOrganization("画面判定歯科"));
});

beforeEach(() => {
  cookieValue = null;
});

describe("05 §1.3 セッション状態と画面の対応", () => {
  it("Cookie なし・不一致・文書 ID の形式不正・削除済み・期限切れは session_unavailable", async () => {
    const r = await registerViaApi({ organizationId });
    const unavailable = { kind: "error", error: "session_unavailable" };
    expect(await guard(r.sessionId, "start")).toEqual(unavailable);
    useCookie(`${RESPONDENT_COOKIE_NAME}=forged-token`);
    expect(await guard(r.sessionId, "start")).toEqual(unavailable);
    useCookie(r.cookieHeader);
    expect(await guard("bad-id", "start")).toEqual(unavailable);

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
    expect(await guard(deleted.sessionId, { pageNo: 1 })).toEqual(unavailable);
  });

  it("draft・未開始: R-02 を表示し、設問ページは R-02 へ、完了画面は /exam/{id} へリダイレクト", async () => {
    const r = await registerViaApi({ organizationId });
    useCookie(r.cookieHeader);
    expect(await guard(r.sessionId, "start")).toMatchObject({ kind: "ok", resumePageNo: 1 });
    expect(await guard(r.sessionId, { pageNo: 1 })).toEqual({
      kind: "redirect",
      to: `/exam/${r.sessionId}`,
    });
    expect(await guard(r.sessionId, "complete")).toEqual({
      kind: "redirect",
      to: `/exam/${r.sessionId}`,
    });
  });

  it("05/T-08: ページ 3 まで保存して開始済みなら /exam/{id} は /questions/4 へ。/questions/10 も /questions/4 へ。1〜4 は表示", async () => {
    const r = await registerViaApi({ organizationId });
    await respondentApi.start(r.sessionId, r.cookieHeader);
    await savePages(r.sessionId, r.cookieHeader, 3);
    useCookie(r.cookieHeader);
    const toPage4 = { kind: "redirect", to: `/exam/${r.sessionId}/questions/4` };
    expect(await guard(r.sessionId, "start")).toEqual(toPage4);
    expect(await guard(r.sessionId, { pageNo: 10 })).toEqual(toPage4);
    for (const pageNo of [1, 3, 4]) {
      const result = await guard(r.sessionId, { pageNo });
      expect(result).toMatchObject({ kind: "ok", resumePageNo: 4 });
    }
    expect(await guard(r.sessionId, "complete")).toEqual({
      kind: "redirect",
      to: `/exam/${r.sessionId}`,
    });
  });

  it("送信済み: 完了画面を表示し、それ以外の URL は完了画面へ（05/T-13）", async () => {
    const r = await completeViaApi(organizationId, uniformAnswers(1));
    useCookie(r.cookieHeader);
    const toComplete = { kind: "redirect", to: `/exam/${r.sessionId}/complete` };
    expect(await guard(r.sessionId, "start")).toEqual(toComplete);
    expect(await guard(r.sessionId, { pageNo: 20 })).toEqual(toComplete);
    const complete = await guard(r.sessionId, "complete");
    expect(complete).toMatchObject({ kind: "ok", resumePageNo: 20 });
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
