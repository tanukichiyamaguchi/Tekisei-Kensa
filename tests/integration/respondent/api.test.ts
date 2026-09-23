// 受検者 API（04 §4）: I-10〜I-18、PF-03 と、レート制限・進行状態・開始・再開判定
import { createHash, randomBytes } from "node:crypto";

import { Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { getExamPage } from "@/lib/presentation/exam-pages";
import type {
  AnswersSavedDto,
  AssessmentLinkDto,
  SessionCreatedDto,
  SessionProgressDto,
  SessionStartedDto,
  SessionSubmittedDto,
} from "@/lib/services/dto/respondent";
import { registerRespondent as registerService } from "@/lib/services/respondent-registration";
import { registerRespondentInputSchema } from "@/lib/services/schemas/respondent";
import { scoreAnswers } from "@/lib/scoring/score";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type AnswerMap,
} from "@/lib/scoring/types";

import {
  createTestOrganization,
  cyclicAnswers,
  uniformAnswers,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import {
  completeViaApi,
  registerViaApi,
  registrationBody,
  respondentApi,
  saveAllPagesViaApi,
} from "../helpers/respondent-api";
import { cookieHeaderFrom, errorCode, setCookieLine } from "../helpers/routes";

type Doc = Record<string, unknown>;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const tokenOf = (cookieHeader: string) => cookieHeader.slice(`${RESPONDENT_COOKIE_NAME}=`.length);

async function issuesOf(res: Response): Promise<Array<{ path: string; message: string }>> {
  const body = (await res.clone().json()) as {
    error: { details: { issues?: Array<{ path: string; message: string }> } };
  };
  return body.error.details.issues ?? [];
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

async function sessionDoc(sessionId: string): Promise<Doc> {
  const doc = await getDocForTest(COLLECTIONS.assessmentSessions, sessionId);
  if (!doc) throw new Error("assessmentSessions が見つかりません");
  return doc;
}

let org: TestOrganization;

beforeAll(async () => {
  org = await createTestOrganization("受検テスト歯科");
});

describe("I-10 受検リンクの検証 GET /respondent/organizations/{id}", () => {
  it("存在しない ID・論理削除済みの ID は 404 ORGANIZATION_NOT_FOUND、形式不正は 404 NOT_FOUND", async () => {
    const missing = await respondentApi.organization("NoSuchOrganization00");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("ORGANIZATION_NOT_FOUND");

    const doomed = await createTestOrganization("削除済み歯科");
    await writeDocForTest(COLLECTIONS.organizations, doomed.organizationId, {
      deletedAt: Timestamp.now(),
    });
    const deleted = await respondentApi.organization(doomed.organizationId);
    expect(deleted.status).toBe(404);
    expect(await errorCode(deleted)).toBe("ORGANIZATION_NOT_FOUND");

    const malformed = await respondentApi.organization("bad-id");
    expect(malformed.status).toBe(404);
    expect(await errorCode(malformed)).toBe("NOT_FOUND");
  });

  it("有効な組織は 200（kind 省略時は applicant、Cookie が無ければ resumable は null）。kind が区分外なら 422", async () => {
    const res = await respondentApi.organization(org.organizationId);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual<AssessmentLinkDto>({
      organizationId: org.organizationId,
      organizationName: "受検テスト歯科",
      kind: "applicant",
      resumable: null,
    });
    const exec = await respondentApi.organization(org.organizationId, { query: "?kind=executive" });
    expect(((await exec.json()) as AssessmentLinkDto).kind).toBe("executive");
    const bad = await respondentApi.organization(org.organizationId, { query: "?kind=manager" });
    expect(bad.status).toBe(422);
    expect(await errorCode(bad)).toBe("VALIDATION_ERROR");
  });

  it("resumable は同じ組織・同じ区分の draft だけ（別区分・別組織・送信済み・不正な Cookie は null。エラーにしない）", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(1));
    const same = (await (
      await respondentApi.organization(org.organizationId, { cookieHeader: r.cookieHeader })
    ).json()) as AssessmentLinkDto;
    expect(same.resumable).toEqual({
      sessionId: r.sessionId,
      answeredCount: getExamPage(1).questions.length,
    });

    const otherKind = (await (
      await respondentApi.organization(org.organizationId, {
        query: "?kind=executive",
        cookieHeader: r.cookieHeader,
      })
    ).json()) as AssessmentLinkDto;
    expect(otherKind.resumable).toBeNull();

    const other = await createTestOrganization("別の歯科");
    const otherOrg = await respondentApi.organization(other.organizationId, {
      cookieHeader: r.cookieHeader,
    });
    expect(((await otherOrg.json()) as AssessmentLinkDto).resumable).toBeNull();

    const junk = await respondentApi.organization(org.organizationId, {
      cookieHeader: `${RESPONDENT_COOKIE_NAME}=not-a-real-token`,
    });
    expect(junk.status).toBe(200);
    expect(((await junk.json()) as AssessmentLinkDto).resumable).toBeNull();

    const done = await completeViaApi(org.organizationId, uniformAnswers(2));
    const afterSubmit = await respondentApi.organization(org.organizationId, {
      cookieHeader: done.cookieHeader,
    });
    expect(((await afterSubmit.json()) as AssessmentLinkDto).resumable).toBeNull();
  });
});

describe("I-11 受検者登録 POST /respondent/sessions", () => {
  it("201 と HttpOnly の tk_session。4 文書が 1 バッチで相互参照し、平文トークンは Firestore のどこにも無い", async () => {
    const res = await respondentApi.register(
      registrationBody({
        organizationId: org.organizationId,
        name: "　山田 太郎　",
        phoneNumber: "０９０－１２３４－５６７８",
        occupationCode: 5,
        diagnosisExperience: "experienced",
      }),
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as SessionCreatedDto;
    expect(dto).toMatchObject({
      organizationId: org.organizationId,
      kind: "applicant",
      status: "draft",
      nextUrl: `/exam/${dto.sessionId}`,
    });
    expect(Object.keys(dto).sort()).toEqual(
      ["kind", "nextUrl", "organizationId", "sessionId", "status", "tokenExpiresAt"].sort(),
    );

    const line = setCookieLine(res, RESPONDENT_COOKIE_NAME)!;
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//);
    expect(line).toMatch(/Expires=/);
    expect(line).not.toMatch(/Secure/i); // ローカル（http://localhost）のみ Secure を外す（01 §5.8）
    const token = tokenOf(cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME)!);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(dto)).not.toContain(token);

    const session = await sessionDoc(dto.sessionId);
    expect(session).toMatchObject({
      organizationId: org.organizationId,
      status: "draft",
      sessionTokenHash: sha256(token),
      answers: {},
      lastSavedPageNo: null,
      startedAt: null,
      submittedAt: null,
      resultId: null,
      deletedAt: null,
    });
    expect((session.tokenExpiresAt as Timestamp).toDate().toISOString()).toBe(dto.tokenExpiresAt);
    const respondentId = session.respondentId as string;
    const respondent = (await getDocForTest(COLLECTIONS.respondents, respondentId))!;
    expect(respondent).toMatchObject({
      organizationId: org.organizationId,
      kind: "applicant",
      name: "山田 太郎",
      phoneNumber: "090-1234-5678",
      occupationCode: 5,
      diagnosisExperience: "experienced",
      teamCode: null,
      isExcluded: false,
      sessionId: dto.sessionId,
      resultId: null,
      deletedAt: null,
    });
    expect(Object.hasOwn(respondent, "deletedAt")).toBe(true);
    const usage = (await getDocForTest(COLLECTIONS.usageLogs, respondent.usageLogId as string))!;
    expect(usage).toMatchObject({
      organizationId: org.organizationId,
      respondentId,
      respondentKind: "applicant",
      name: "山田 太郎",
      phoneNumber: "090-1234-5678",
      resultId: null,
      submittedAt: null,
    });
    const audits = await listDocs(COLLECTIONS.auditLogs);
    const register = audits.filter(
      (a) => a.data.action === "respondent.register" && a.data.targetId === respondentId,
    );
    expect(register).toHaveLength(1);
    expect(register[0]!.data).toMatchObject({
      organizationId: org.organizationId,
      actorKind: "respondent",
      actorUid: respondentId,
      actorRole: null,
      targetCollection: COLLECTIONS.respondents,
      details: { kind: "applicant" },
    });

    // 平文トークンは 8 コレクションのどの文書にも無い（00 D-32）
    for (const name of Object.values(COLLECTIONS)) {
      expect(JSON.stringify(await listDocs(name))).not.toContain(token);
    }
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["氏名が空白のみ", { name: "　 " }, "name"],
    ["氏名が 101 文字", { name: "あ".repeat(101) }, "name"],
    ["電話番号が 8 文字未満", { phoneNumber: "12345" }, "phoneNumber"],
    ["電話番号に英字", { phoneNumber: "abc-1234-5678" }, "phoneNumber"],
    ["職業が 10", { occupationCode: 10 }, "occupationCode"],
    ["職業が文字列", { occupationCode: "2" }, "occupationCode"],
    ["診断経験が区分外", { diagnosisExperience: "never" }, "diagnosisExperience"],
    ["区分が区分外", { kind: "manager" }, "kind"],
    ["組織 ID の形式不正", { organizationId: "a/b" }, "organizationId"],
  ])(
    "%s は 422 VALIDATION_ERROR（issues の path、値は返さない）で何も書かない",
    async (_, patch, path) => {
      const before = await countDocs(COLLECTIONS.respondents);
      const res = await respondentApi.register({
        ...registrationBody({ organizationId: org.organizationId }),
        ...patch,
      });
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
      expect((await issuesOf(res)).map((i) => i.path)).toContain(path);
      expect(JSON.stringify(await res.clone().json())).not.toContain("abc-1234-5678");
      expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
      expect(await countDocs(COLLECTIONS.respondents)).toBe(before);
    },
  );

  it("Content-Type が JSON でなければ 415、JSON の構文エラーは 400、存在しない組織は 404 ORGANIZATION_NOT_FOUND", async () => {
    const { callRoute } = await import("../helpers/routes");
    const { POST } = await import("@/app/api/v1/respondent/sessions/route");
    const text = await callRoute(POST, {
      method: "POST",
      url: "/api/v1/respondent/sessions",
      rawBody: "{}",
      contentType: "text/plain",
    });
    expect(text.status).toBe(415);
    const broken = await callRoute(POST, {
      method: "POST",
      url: "/api/v1/respondent/sessions",
      rawBody: "{",
    });
    expect(broken.status).toBe(400);
    expect(await errorCode(broken)).toBe("INVALID_JSON");
    const missing = await respondentApi.register(
      registrationBody({ organizationId: "NoSuchOrganization00" }),
    );
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("同じ組織・同じ IP の 21 件目は 429 RATE_LIMITED（Retry-After: 600）。別 IP・別組織は数えない（04 §2.8、09 §6.4 の 27）", async () => {
    const limited = await createTestOrganization("レート制限歯科");
    const ip = { "x-forwarded-for": "198.51.100.7, 10.0.0.1" };
    for (let i = 0; i < 20; i += 1) {
      const res = await respondentApi.register(
        registrationBody({ organizationId: limited.organizationId }),
        ip,
      );
      expect(res.status).toBe(201);
    }
    const over = await respondentApi.register(
      registrationBody({ organizationId: limited.organizationId }),
      ip,
    );
    expect(over.status).toBe(429);
    expect(await errorCode(over)).toBe("RATE_LIMITED");
    expect(over.headers.get("retry-after")).toBe("600");
    expect(
      await countDocs(COLLECTIONS.respondents, [["organizationId", "==", limited.organizationId]]),
    ).toBe(20);

    const otherIp = await respondentApi.register(
      registrationBody({ organizationId: limited.organizationId }),
      { "x-forwarded-for": "198.51.100.8" },
    );
    expect(otherIp.status).toBe(201);
    const otherOrg = await respondentApi.register(
      registrationBody({ organizationId: org.organizationId }),
      ip,
    );
    expect(otherOrg.status).toBe(201);
  });
});

describe("進行状態の取得と開始（04 §4.3）", () => {
  it("GET は保存済み回答を questionNo 昇順の配列で返し、氏名・電話番号は返さない", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId, name: "非表示 太郎" });
    const initial = await respondentApi.progress(r.sessionId, r.cookieHeader);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual<SessionProgressDto>({
      sessionId: r.sessionId,
      organizationName: "受検テスト歯科",
      kind: "applicant",
      status: "draft",
      startedAt: null,
      lastSavedPageNo: null,
      answeredCount: 0,
      totalCount: 144,
      answers: [],
      tokenExpiresAt: r.dto.tokenExpiresAt,
    });
    expect(setCookieLine(initial, RESPONDENT_COOKIE_NAME)).toBeNull(); // GET は期限を延長しない

    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(2, 4));
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(1, 5));
    const body = (await (
      await respondentApi.progress(r.sessionId, r.cookieHeader)
    ).json()) as SessionProgressDto;
    expect(body.answeredCount).toBe(
      getExamPage(1).questions.length + getExamPage(2).questions.length,
    );
    expect(body.lastSavedPageNo).toBe(1);
    expect(body.answers.map((a) => a.questionNo)).toEqual(
      [...getExamPage(1).questions, ...getExamPage(2).questions].map((q) => q.questionNo),
    );
    expect(body.answers[0]).toEqual({ questionNo: 1, choiceCode: 5 });
    expect(JSON.stringify(body)).not.toContain("非表示");
    expect(JSON.stringify(body)).not.toContain("090");
  });

  it("start は startedAt を 1 回だけ設定し（冪等）、期限を延長して同じトークンの Cookie を再発行する。session.start は 1 件", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const first = await respondentApi.start(r.sessionId, r.cookieHeader);
    expect(first.status).toBe(200);
    const dto = (await first.json()) as SessionStartedDto;
    expect(dto.sessionId).toBe(r.sessionId);
    expect(new Date(dto.tokenExpiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(r.dto.tokenExpiresAt).getTime(),
    );
    expect(cookieHeaderFrom(first, RESPONDENT_COOKIE_NAME)).toBe(r.cookieHeader);
    expect(setCookieLine(first, RESPONDENT_COOKIE_NAME)).toContain(
      `Expires=${new Date(dto.tokenExpiresAt).toUTCString()}`,
    );
    const session = await sessionDoc(r.sessionId);
    expect((session.startedAt as Timestamp).toDate().toISOString()).toBe(dto.startedAt);
    expect((session.tokenExpiresAt as Timestamp).toDate().toISOString()).toBe(dto.tokenExpiresAt);

    const second = (await (
      await respondentApi.start(r.sessionId, r.cookieHeader)
    ).json()) as SessionStartedDto;
    expect(second.startedAt).toBe(dto.startedAt);
    expect(
      await countDocs(COLLECTIONS.auditLogs, [
        ["action", "==", "session.start"],
        ["targetId", "==", r.sessionId],
      ]),
    ).toBe(1);
  });

  it("Cookie なしは 401 RESPONDENT_TOKEN_INVALID、sessionId の形式不正は 404 NOT_FOUND、存在しない sessionId も 401", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    for (const res of [
      await respondentApi.progress(r.sessionId),
      await respondentApi.start(r.sessionId),
      await respondentApi.saveAnswers(r.sessionId, undefined, pageBody(1)),
      await respondentApi.submit(r.sessionId),
      await respondentApi.progress("NoSuchSession0000000", r.cookieHeader),
    ]) {
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("RESPONDENT_TOKEN_INVALID");
    }
    const malformed = await respondentApi.progress("bad-id", r.cookieHeader);
    expect(malformed.status).toBe(404);
    expect(await errorCode(malformed)).toBe("NOT_FOUND");
  });

  it("論理削除されたセッションは 401 RESPONDENT_TOKEN_INVALID（存在を区別しない）", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await writeDocForTest(COLLECTIONS.assessmentSessions, r.sessionId, {
      deletedAt: Timestamp.now(),
    });
    const res = await respondentApi.progress(r.sessionId, r.cookieHeader);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("RESPONDENT_TOKEN_INVALID");
  });
});

describe("I-12 回答の保存 PUT …/answers", () => {
  it('20 ページを保存すると answers は "1"〜"144" のキーだけで値は 1〜5。ページ保存は部分更新で、期限と lastSavedPageNo が毎回更新される', async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    let previousExpiry = new Date(r.dto.tokenExpiresAt).getTime();
    for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
      const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(pageNo, 4));
      expect(res.status).toBe(200);
      const dto = (await res.json()) as AnswersSavedDto;
      const size = getExamPage(pageNo).questions.length;
      expect(dto).toMatchObject({
        sessionId: r.sessionId,
        pageNo,
        savedCount: size,
        totalCount: 144,
        lastSavedPageNo: pageNo,
      });
      const expiry = new Date(dto.tokenExpiresAt).getTime();
      expect(expiry).toBeGreaterThanOrEqual(previousExpiry);
      previousExpiry = expiry;
      expect(cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME)).toBe(r.cookieHeader);
      const session = await sessionDoc(r.sessionId);
      expect(session.lastSavedPageNo).toBe(pageNo);
      expect((session.tokenExpiresAt as Timestamp).toMillis()).toBe(expiry);
      expect(dto.answeredCount).toBe(Object.keys(session.answers as Doc).length);
    }
    const answers = (await sessionDoc(r.sessionId)).answers as Record<string, number>;
    expect(Object.keys(answers).sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 144 }, (_, i) => String(i + 1)),
    );
    expect(Object.values(answers).every((v) => v === 4)).toBe(true);
    // 文書サイズの目安（09 §6.4 の 13。1 MiB の上限に対して十分小さいこと）
    expect(JSON.stringify(await sessionDoc(r.sessionId)).length).toBeLessThan(10_000);

    // ページ 2 を上書きしてもページ 1 の値は残る
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(2, 1));
    const after = (await sessionDoc(r.sessionId)).answers as Record<string, number>;
    for (const q of getExamPage(1).questions) expect(after[String(q.questionNo)]).toBe(4);
    for (const q of getExamPage(2).questions) expect(after[String(q.questionNo)]).toBe(1);
  });

  it("ページ内の一部だけの保存も受け付ける（D04-19）", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, {
      pageNo: 1,
      answers: [{ questionNo: 3, choiceCode: 2 }],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AnswersSavedDto).answeredCount).toBe(1);
  });

  it.each<[string, unknown, string]>([
    [
      "questionNo = 145",
      { pageNo: 20, answers: [{ questionNo: 145, choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    [
      "choiceCode = 6",
      { pageNo: 1, answers: [{ questionNo: 1, choiceCode: 6 }] },
      "answers[0].choiceCode",
    ],
    [
      "choiceCode = 0",
      { pageNo: 1, answers: [{ questionNo: 1, choiceCode: 0 }] },
      "answers[0].choiceCode",
    ],
    [
      "questionNo が数字でない",
      { pageNo: 1, answers: [{ questionNo: "abc", choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    [
      "questionNo が数字文字列",
      { pageNo: 1, answers: [{ questionNo: "1", choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    ["pageNo = 0", { pageNo: 0, answers: [{ questionNo: 1, choiceCode: 1 }] }, "pageNo"],
    ["pageNo = 21", { pageNo: 21, answers: [{ questionNo: 1, choiceCode: 1 }] }, "pageNo"],
    ["answers が空", { pageNo: 1, answers: [] }, "answers"],
    [
      "9 件以上",
      {
        pageNo: 1,
        answers: Array.from({ length: 9 }, (_, i) => ({ questionNo: i + 1, choiceCode: 1 })),
      },
      "answers",
    ],
    [
      "設問番号の重複",
      {
        pageNo: 1,
        answers: [
          { questionNo: 1, choiceCode: 1 },
          { questionNo: 1, choiceCode: 2 },
        ],
      },
      "answers[1].questionNo",
    ],
    [
      "ページに属さない設問",
      { pageNo: 2, answers: [{ questionNo: 1, choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
  ])("%s は 422 VALIDATION_ERROR で何も書かない", async (_, body, path) => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(1, 3));
    const before = await sessionDoc(r.sessionId);
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, body);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    expect((await issuesOf(res)).map((i) => i.path)).toContain(path);
    expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
    const after = await sessionDoc(r.sessionId);
    expect(after.answers).toEqual(before.answers);
    expect((after.updatedAt as Timestamp).isEqual(before.updatedAt as Timestamp)).toBe(true);
  });

  it("ページに属さない設問の文言は「このページの設問ではありません」", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, {
      pageNo: 2,
      answers: [{ questionNo: 1, choiceCode: 1 }],
    });
    expect(await issuesOf(res)).toEqual([
      { path: "answers[0].questionNo", message: "このページの設問ではありません" },
    ]);
  });
});

describe("I-13 送信 POST …/submit", () => {
  it("results 1 文書が scoreAnswers と完全一致し、5 書き込みが同じ submittedAt で反映される。応答に採点結果を含めない", async () => {
    const answers: AnswerMap = cyclicAnswers();
    const r = await registerViaApi({ organizationId: org.organizationId });
    await respondentApi.start(r.sessionId, r.cookieHeader);
    await saveAllPagesViaApi(r.sessionId, r.cookieHeader, answers);
    const res = await respondentApi.submit(r.sessionId, r.cookieHeader);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as SessionSubmittedDto;
    expect(dto).toEqual({
      sessionId: r.sessionId,
      status: "submitted",
      submittedAt: dto.submittedAt,
      nextUrl: `/exam/${r.sessionId}/complete`,
    });
    expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull(); // Cookie は削除も延長もしない

    const session = await sessionDoc(r.sessionId);
    const resultId = session.resultId as string;
    expect(session.status).toBe("submitted");
    expect(JSON.stringify(dto)).not.toContain(resultId);
    const result = (await getDocForTest(COLLECTIONS.results, resultId))!;
    const expected = toResultDocFields(scoreAnswers(answers));
    for (const [key, value] of Object.entries(expected)) expect(result[key]).toEqual(value);
    expect(result.scoringVersion).toBe("1.0.0");
    const keyCount = (field: string) => Object.keys(result[field] as Doc).length;
    expect([
      keyCount("traits"),
      keyCount("compatibility"),
      keyCount("risks"),
      keyCount("aptitudes"),
      keyCount("aptitudeTypeScores"),
      keyCount("socialStyles"),
    ]).toEqual([
      TRAIT_KEYS.length,
      COMPATIBILITY_KEYS.length,
      RISK_KEYS.length,
      APTITUDE_KEYS.length,
      APTITUDE_TYPE_KEYS.length,
      SOCIAL_STYLE_KEYS.length,
    ]);
    expect(APTITUDE_KEYS).toContain(result.aptitudeFirst);
    expect(APTITUDE_KEYS).toContain(result.aptitudeSecond);
    expect(APTITUDE_TYPE_KEYS).toContain(result.aptitudeType);
    expect(SOCIAL_STYLE_KEYS).toContain(result.socialStyle);
    expect(result).toMatchObject({
      organizationId: org.organizationId,
      sessionId: r.sessionId,
      respondentKind: "applicant",
      teamCode: null,
      isExcluded: false,
      deletedAt: null,
      aiGenerationStatus: "not_generated",
    });

    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      result.respondentId as string,
    ))!;
    const usage = (await getDocForTest(COLLECTIONS.usageLogs, respondent.usageLogId as string))!;
    expect(respondent.resultId).toBe(resultId);
    expect(usage.resultId).toBe(resultId);
    const submittedAt = result.submittedAt as Timestamp;
    expect((session.submittedAt as Timestamp).isEqual(submittedAt)).toBe(true);
    expect((usage.submittedAt as Timestamp).isEqual(submittedAt)).toBe(true);
    expect(submittedAt.toDate().toISOString()).toBe(dto.submittedAt);
    expect(
      await countDocs(COLLECTIONS.auditLogs, [
        ["action", "==", "session.submit"],
        ["targetId", "==", resultId],
      ]),
    ).toBe(1);

    // 送信後も GET は 200（完了画面の確認用）。開始・保存・送信は 409
    const progress = await respondentApi.progress(r.sessionId, r.cookieHeader);
    expect(progress.status).toBe(200);
    expect(((await progress.json()) as SessionProgressDto).status).toBe("submitted");
    for (const again of [
      await respondentApi.start(r.sessionId, r.cookieHeader),
      await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, pageBody(1)),
      await respondentApi.submit(r.sessionId, r.cookieHeader),
    ]) {
      expect(again.status).toBe(409);
      expect(await errorCode(again)).toBe("SESSION_ALREADY_SUBMITTED");
    }
    expect(await countDocs(COLLECTIONS.results, [["sessionId", "==", r.sessionId]])).toBe(1);
  });
});

describe("I-14 未回答で送信", () => {
  it("Q100 欠落は 422 ANSWERS_INCOMPLETE（details.missing = [100]）。results は作られず draft のまま", async () => {
    const answers: Record<number, number> = { ...uniformAnswers(3) };
    delete answers[100];
    const r = await registerViaApi({ organizationId: org.organizationId });
    await saveAllPagesViaApi(r.sessionId, r.cookieHeader, answers);
    const res = await respondentApi.submit(r.sessionId, r.cookieHeader);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: Doc } };
    expect(body.error.code).toBe("ANSWERS_INCOMPLETE");
    expect(body.error.details).toEqual({ missing: [100] });
    expect(await countDocs(COLLECTIONS.results, [["sessionId", "==", r.sessionId]])).toBe(0);
    expect((await sessionDoc(r.sessionId)).status).toBe("draft");
  });
});

describe("I-15 二重送信", () => {
  it("同じセッションに submit を並行して 2 回 → 片方 200、他方 409。results は 1 文書で usageLogs.resultId はその 1 件", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await saveAllPagesViaApi(r.sessionId, r.cookieHeader, uniformAnswers(2));
    const responses = await Promise.all([
      respondentApi.submit(r.sessionId, r.cookieHeader),
      respondentApi.submit(r.sessionId, r.cookieHeader),
    ]);
    expect(responses.map((x) => x.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((x) => x.status === 409)!;
    expect(await errorCode(conflict)).toBe("SESSION_ALREADY_SUBMITTED");
    const results = (await listDocs(COLLECTIONS.results)).filter(
      (d) => d.data.sessionId === r.sessionId,
    );
    expect(results).toHaveLength(1);
    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      (await sessionDoc(r.sessionId)).respondentId as string,
    ))!;
    const usage = (await getDocForTest(COLLECTIONS.usageLogs, respondent.usageLogId as string))!;
    expect(usage.resultId).toBe(results[0]!.id);
  });
});

describe("I-16 期限切れ", () => {
  it("発行時刻を 8 日前にして登録したトークン（期限は 1 日前）は 401 RESPONDENT_TOKEN_EXPIRED、再開候補にも出ない", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const input = registerRespondentInputSchema.parse(
      registrationBody({ organizationId: org.organizationId }),
    );
    const { dto, issued } = await registerService(
      input,
      { requestId: "i-16", ipAddress: null, userAgent: "vitest" },
      eightDaysAgo,
    );
    const cookieHeader = `${RESPONDENT_COOKIE_NAME}=${issued.token}`;
    for (const res of [
      await respondentApi.saveAnswers(dto.sessionId, cookieHeader, pageBody(1)),
      await respondentApi.progress(dto.sessionId, cookieHeader),
      await respondentApi.start(dto.sessionId, cookieHeader),
      await respondentApi.submit(dto.sessionId, cookieHeader),
    ]) {
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("RESPONDENT_TOKEN_EXPIRED");
    }
    expect((await sessionDoc(dto.sessionId)).answers).toEqual({});
    const link = (await (
      await respondentApi.organization(org.organizationId, { cookieHeader })
    ).json()) as AssessmentLinkDto;
    expect(link.resumable).toBeNull();
  });
});

describe("I-17 他人のトークン", () => {
  it("別セッションの Cookie、乱数だけ変えた Cookie、壊れた Cookie は 401 RESPONDENT_TOKEN_INVALID", async () => {
    const a = await registerViaApi({ organizationId: org.organizationId });
    const b = await registerViaApi({ organizationId: org.organizationId });
    const forged = `${RESPONDENT_COOKIE_NAME}=${randomBytes(32).toString("base64url")}`;
    for (const cookie of [b.cookieHeader, forged, `${RESPONDENT_COOKIE_NAME}=%E0%A4%A`]) {
      const res = await respondentApi.saveAnswers(a.sessionId, cookie, pageBody(1));
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("RESPONDENT_TOKEN_INVALID");
    }
    expect((await sessionDoc(a.sessionId)).answers).toEqual({});
  });
});

describe("I-18 幹部の送信", () => {
  it("kind = executive の結果は results.respondentKind・usageLogs.respondentKind が executive（サーバコードで複製）", async () => {
    const r = await completeViaApi(org.organizationId, uniformAnswers(4), { kind: "executive" });
    expect(r.dto.kind).toBe("executive");
    const session = await sessionDoc(r.sessionId);
    const result = (await getDocForTest(COLLECTIONS.results, session.resultId as string))!;
    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      session.respondentId as string,
    ))!;
    const usage = (await getDocForTest(COLLECTIONS.usageLogs, respondent.usageLogId as string))!;
    expect(respondent.kind).toBe("executive");
    expect(result.respondentKind).toBe("executive");
    expect(usage.respondentKind).toBe("executive");
  });
});

describe("PF-03 送信 API の応答時間（ローカル Emulator）", () => {
  it("POST …/submit は 2 秒以内（5 回の最大値）、登録から送信応答までも 2 秒以内（中央値）", async () => {
    const submitMs: number[] = [];
    const totalMs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();
      const r = await registerViaApi({ organizationId: org.organizationId });
      await respondentApi.start(r.sessionId, r.cookieHeader);
      await saveAllPagesViaApi(r.sessionId, r.cookieHeader, cyclicAnswers());
      const submitStarted = performance.now();
      const res = await respondentApi.submit(r.sessionId, r.cookieHeader);
      const ended = performance.now();
      expect(res.status).toBe(200);
      submitMs.push(ended - submitStarted);
      totalMs.push(ended - started);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    // eslint-disable-next-line no-console -- PF-03 の計測値をテストログに残す（08 §4）
    console.info(
      `PF-03 submit: median ${median(submitMs).toFixed(0)} ms, max ${Math.max(...submitMs).toFixed(0)} ms / 登録〜送信: median ${median(totalMs).toFixed(0)} ms, max ${Math.max(...totalMs).toFixed(0)} ms`,
    );
    expect(Math.max(...submitMs)).toBeLessThan(2000);
    // 08 §2.4 の完了条件（登録から送信応答まで）。20 回の保存を含むため中央値で判定する
    expect(median(totalMs)).toBeLessThan(2000);
  });
});
