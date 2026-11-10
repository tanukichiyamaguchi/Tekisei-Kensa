// 受検者 API（04 §4、11-1 §3.4）: I-10、M7-exam-20〜25・27〜30（再受験のつながり。11-1 §2.2.8・§2.7.3、11-7 §2.2・§3.4）・
// 31（API の分）・32、I-14・I-16・I-17、PF-03 と、レート制限・進行状態・開始・再開判定。
// I-11〜I-13・I-15・I-18 は M7-exam-20〜25・32 に置き換えた（11-1 §5.5）
import { createHash, randomBytes } from "node:crypto";

import { DocumentReference, Query, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DELETE as deleteRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { toResultDocFields } from "@/lib/db/mappers/result";
import { getExamStep, type ExamStepNo } from "@/lib/presentation/exam-steps";
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
  createOrganizationWithOwner,
  createTestOrganization,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import {
  completeViaApi,
  registerViaApi,
  registrationBody,
  respondentApi,
  saveAllStepsViaApi,
  type RegisteredViaApi,
} from "../helpers/respondent-api";
import { callRoute, cookieHeaderFrom, errorCode, setCookieLine } from "../helpers/routes";

type Doc = Record<string, unknown>;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const tokenOf = (cookieHeader: string) => cookieHeader.slice(`${RESPONDENT_COOKIE_NAME}=`.length);

async function issuesOf(res: Response): Promise<Array<{ path: string; message: string }>> {
  const body = (await res.clone().json()) as {
    error: { details: { issues?: Array<{ path: string; message: string }> } };
  };
  return body.error.details.issues ?? [];
}

/** ステップ stepNo の全設問に choice を付けた本文 { stepNo, answers }（11-1 §3.4.2） */
function stepBody(stepNo: ExamStepNo, choice = 3) {
  return {
    stepNo,
    answers: getExamStep(stepNo).questions.map((q) => ({
      questionNo: q.questionNo,
      choiceCode: choice,
    })),
  };
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function sessionDoc(sessionId: string): Promise<Doc> {
  const doc = await getDocForTest(COLLECTIONS.assessmentSessions, sessionId);
  if (!doc) throw new Error("assessmentSessions が見つかりません");
  return doc;
}

let org: TestOrganization;
/** 再受験のつながりのテスト（M7-exam-27〜30）の組織。前回の論理削除にオーナーの API を使う */
let linkOrg: TestOrganization;
let linkOwner: TestAdmin;

beforeAll(async () => {
  org = await createTestOrganization("受検テスト歯科");
  ({ org: linkOrg, owner: linkOwner } = await createOrganizationWithOwner("再受験テストサロン"));
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
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(1));
    const same = (await (
      await respondentApi.organization(org.organizationId, { cookieHeader: r.cookieHeader })
    ).json()) as AssessmentLinkDto;
    expect(same.resumable).toEqual({ sessionId: r.sessionId, answeredCount: 41 });

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

describe("M7-exam-20 受験者登録（求職者）POST /respondent/sessions", () => {
  it("201 と HttpOnly の tk_session。respondents・assessmentSessions・auditLogs が 1 文書ずつ相互参照し、usageLogs は作らない。平文トークンは Firestore のどこにも無い", async () => {
    const usageLogsBefore = await countDocs(COLLECTIONS.usageLogs);
    const res = await respondentApi.register(
      registrationBody({
        organizationId: org.organizationId,
        name: "　見本 花子　",
        phoneNumber: "00000000000",
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
      lastSavedStepNo: null,
      startedAt: null,
      submittedAt: null,
      resultId: null,
      deletedAt: null,
    });
    expect(Object.hasOwn(session, "lastSavedPageNo")).toBe(false); // 書かない（11-1 §3.2.2）
    expect((session.tokenExpiresAt as Timestamp).toDate().toISOString()).toBe(dto.tokenExpiresAt);
    const respondentId = session.respondentId as string;
    const respondent = (await getDocForTest(COLLECTIONS.respondents, respondentId))!;
    expect(respondent).toMatchObject({
      organizationId: org.organizationId,
      kind: "applicant",
      name: "見本 花子",
      phoneNumber: "00000000000",
      occupationCode: 5,
      diagnosisExperience: "experienced",
      teamCode: null,
      isExcluded: false,
      sessionId: dto.sessionId,
      usageLogId: null,
      previousResultId: null,
      resultId: null,
      deletedAt: null,
    });
    expect(Object.hasOwn(respondent, "deletedAt")).toBe(true);
    // 利用履歴は送信のときに作る（11-1 §2.7.4）
    expect(await countDocs(COLLECTIONS.usageLogs)).toBe(usageLogsBefore);
    expect(await countDocs(COLLECTIONS.usageLogs, [["respondentId", "==", respondentId]])).toBe(0);
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
      details: { kind: "applicant", previousCandidate: false },
    });
    expect(JSON.stringify(register[0]!.data)).not.toContain("見本");

    // 平文トークンは 8 コレクションのどの文書にも無い（00 D-32）
    for (const name of Object.values(COLLECTIONS)) {
      expect(JSON.stringify(await listDocs(name))).not.toContain(token);
    }
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

describe("M7-exam-21 登録の組織", () => {
  /** 登録で増える 4 コレクションの件数 */
  const counts = async () =>
    Promise.all(
      [
        COLLECTIONS.respondents,
        COLLECTIONS.assessmentSessions,
        COLLECTIONS.usageLogs,
        COLLECTIONS.auditLogs,
      ].map((name) => countDocs(name)),
    );

  it("存在しない組織・論理削除した組織は 404 ORGANIZATION_NOT_FOUND、形の違う organizationId は 422（path が organizationId）。どれも文書が増えず Cookie も出さない", async () => {
    const doomed = await createTestOrganization("削除済み歯科");
    await writeDocForTest(COLLECTIONS.organizations, doomed.organizationId, {
      deletedAt: Timestamp.now(),
    });
    const before = await counts();
    const missing = await respondentApi.register(
      registrationBody({ organizationId: "NoSuchOrganization00" }),
    );
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("ORGANIZATION_NOT_FOUND");

    const deleted = await respondentApi.register(
      registrationBody({ organizationId: doomed.organizationId }),
    );
    expect(deleted.status).toBe(404);
    expect(await errorCode(deleted)).toBe("ORGANIZATION_NOT_FOUND");

    for (const organizationId of ["a/b", "", "bad-id"]) {
      const malformed = await respondentApi.register(registrationBody({ organizationId }));
      expect(malformed.status, organizationId).toBe(422);
      expect(await errorCode(malformed)).toBe("VALIDATION_ERROR");
      expect((await issuesOf(malformed)).map((i) => i.path)).toEqual(["organizationId"]);
    }
    for (const res of [missing, deleted]) {
      expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
    }
    expect(await counts()).toEqual(before);
  });

  it("Content-Type が JSON でなければ 415、JSON の構文エラーは 400", async () => {
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
  });
});

describe("M7-exam-22 登録の入力", () => {
  it("電話番号「 ０９０ーabc 」は「０９０ーabc」で保存される（前後の空白だけ除き、書式を見ず正規化しない）", async () => {
    const res = await respondentApi.register(
      registrationBody({ organizationId: org.organizationId, phoneNumber: " ０９０ーabc " }),
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as SessionCreatedDto;
    const session = await sessionDoc(dto.sessionId);
    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      session.respondentId as string,
    ))!;
    expect(respondent.phoneNumber).toBe("０９０ーabc");
  });

  it("電話番号 30 文字・お名前 100 文字は 201", async () => {
    const res = await respondentApi.register(
      registrationBody({
        organizationId: org.organizationId,
        name: "あ".repeat(100),
        phoneNumber: "0".repeat(30),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("職業 10（責任者。K-21）は 201 で、respondents.occupationCode に 10 が入る", async () => {
    const res = await respondentApi.register(
      registrationBody({ organizationId: org.organizationId, occupationCode: 10 }),
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as SessionCreatedDto;
    const session = await sessionDoc(dto.sessionId);
    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      session.respondentId as string,
    ))!;
    expect(respondent.occupationCode).toBe(10);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["お名前が空白のみ", { name: "　 " }, "name"],
    ["お名前が 101 文字", { name: "あ".repeat(101) }, "name"],
    ["電話番号が空白のみ", { phoneNumber: " 　" }, "phoneNumber"],
    ["電話番号が 31 文字", { phoneNumber: "0".repeat(31) }, "phoneNumber"],
    ["職業が 9（旧データの「その他」。欠番）", { occupationCode: 9 }, "occupationCode"],
    ["職業が 11", { occupationCode: 11 }, "occupationCode"],
    ["職業が文字列", { occupationCode: "2" }, "occupationCode"],
    ["診断経験が区分外", { diagnosisExperience: "never" }, "diagnosisExperience"],
    ["区分が区分外", { kind: "manager" }, "kind"],
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
      expect(JSON.stringify(await res.clone().json())).not.toContain("0".repeat(31));
      expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
      expect(await countDocs(COLLECTIONS.respondents)).toBe(before);
    },
  );
});

describe("進行状態の取得と開始（04 §4.3、11-1 §3.4.4）", () => {
  it("GET は保存済み回答を questionNo 昇順の配列と lastSavedStepNo（M7-exam-31）で返し、氏名・電話番号は返さない", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId, name: "非表示 太郎" });
    const initial = await respondentApi.progress(r.sessionId, r.cookieHeader);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual<SessionProgressDto>({
      sessionId: r.sessionId,
      organizationName: "受検テスト歯科",
      kind: "applicant",
      status: "draft",
      startedAt: null,
      lastSavedStepNo: null,
      answeredCount: 0,
      totalCount: 144,
      answers: [],
      tokenExpiresAt: r.dto.tokenExpiresAt,
    });
    expect(setCookieLine(initial, RESPONDENT_COOKIE_NAME)).toBeNull(); // GET は期限を延長しない

    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(2, 4));
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(1, 5));
    const body = (await (
      await respondentApi.progress(r.sessionId, r.cookieHeader)
    ).json()) as SessionProgressDto;
    expect(body.answeredCount).toBe(82);
    expect(body.lastSavedStepNo).toBe(1);
    expect(body).not.toHaveProperty("lastSavedPageNo");
    expect(body.answers.map((a) => a.questionNo)).toEqual(range(1, 82));
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
      await respondentApi.saveAnswers(r.sessionId, undefined, stepBody(1)),
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

describe("M7-exam-23 回答の保存 PUT …/answers", () => {
  it('stepNo: 1 で Q1〜Q41 の 41 問を 1 回で保存できる。4 ステップを保存すると answers は "1"〜"144" のキーだけで、lastSavedStepNo が保存したステップになり期限が毎回延びる', async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    let previousExpiry = new Date(r.dto.tokenExpiresAt).getTime();
    for (const stepNo of [1, 2, 3, 4] as const) {
      const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(stepNo, 4));
      expect(res.status).toBe(200);
      const dto = (await res.json()) as AnswersSavedDto;
      expect(dto).toMatchObject({
        sessionId: r.sessionId,
        stepNo,
        savedCount: getExamStep(stepNo).questions.length,
        totalCount: 144,
        lastSavedStepNo: stepNo,
      });
      const expiry = new Date(dto.tokenExpiresAt).getTime();
      expect(expiry).toBeGreaterThanOrEqual(previousExpiry);
      previousExpiry = expiry;
      expect(cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME)).toBe(r.cookieHeader);
      const session = await sessionDoc(r.sessionId);
      expect(session.lastSavedStepNo).toBe(stepNo);
      expect(Object.hasOwn(session, "lastSavedPageNo")).toBe(false);
      expect((session.tokenExpiresAt as Timestamp).toMillis()).toBe(expiry);
      expect(dto.answeredCount).toBe(Object.keys(session.answers as Doc).length);
    }
    expect(getExamStep(1).questions.map((q) => q.questionNo)).toEqual(range(1, 41));
    const answers = (await sessionDoc(r.sessionId)).answers as Record<string, number>;
    expect(Object.keys(answers).sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 144 }, (_, i) => String(i + 1)),
    );
    expect(Object.values(answers).every((v) => v === 4)).toBe(true);
    // 文書サイズの目安（09 §6.4 の 13。1 MiB の上限に対して十分小さいこと）
    expect(JSON.stringify(await sessionDoc(r.sessionId)).length).toBeLessThan(10_000);

    // Step 2 を上書きしても、保存したステップ以外の回答は消えない
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(2, 1));
    const after = await sessionDoc(r.sessionId);
    const afterAnswers = after.answers as Record<string, number>;
    for (const stepNo of [1, 3, 4] as const) {
      for (const q of getExamStep(stepNo).questions)
        expect(afterAnswers[String(q.questionNo)]).toBe(4);
    }
    for (const q of getExamStep(2).questions) expect(afterAnswers[String(q.questionNo)]).toBe(1);
    expect(after.lastSavedStepNo).toBe(2);
  });

  it("ステップの一部だけの保存も受け付ける（選んだ時点の保存。D04-19）", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, {
      stepNo: 1,
      answers: [{ questionNo: 3, choiceCode: 2 }],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AnswersSavedDto).answeredCount).toBe(1);
  });

  it.each<[string, unknown, string]>([
    [
      "questionNo = 145",
      { stepNo: 4, answers: [{ questionNo: 145, choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    [
      "choiceCode = 6",
      { stepNo: 1, answers: [{ questionNo: 1, choiceCode: 6 }] },
      "answers[0].choiceCode",
    ],
    [
      "choiceCode = 0",
      { stepNo: 1, answers: [{ questionNo: 1, choiceCode: 0 }] },
      "answers[0].choiceCode",
    ],
    [
      "questionNo が数字でない",
      { stepNo: 1, answers: [{ questionNo: "abc", choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    [
      "questionNo が数字文字列",
      { stepNo: 1, answers: [{ questionNo: "1", choiceCode: 1 }] },
      "answers[0].questionNo",
    ],
    ["stepNo = 0", { stepNo: 0, answers: [{ questionNo: 1, choiceCode: 1 }] }, "stepNo"],
    ["stepNo = 5", { stepNo: 5, answers: [{ questionNo: 1, choiceCode: 1 }] }, "stepNo"],
    ["answers が空", { stepNo: 1, answers: [] }, "answers"],
    [
      "42 件",
      {
        stepNo: 1,
        answers: range(1, 42).map((questionNo) => ({ questionNo, choiceCode: 1 })),
      },
      "answers",
    ],
    [
      "設問番号の重複",
      {
        stepNo: 1,
        answers: [
          { questionNo: 1, choiceCode: 1 },
          { questionNo: 1, choiceCode: 2 },
        ],
      },
      "answers[1].questionNo",
    ],
    [
      "stepNo: 1 に Q42 を含める（ステップに属さない設問）",
      {
        stepNo: 1,
        answers: [
          { questionNo: 41, choiceCode: 1 },
          { questionNo: 42, choiceCode: 1 },
        ],
      },
      "answers[1].questionNo",
    ],
    [
      "pageNo だけの本文（M7 より前の画面の形）",
      { pageNo: 1, answers: [{ questionNo: 1, choiceCode: 1 }] },
      "stepNo",
    ],
  ])("%s は 422 VALIDATION_ERROR で何も書かない", async (_, body, path) => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(1, 3));
    const before = await sessionDoc(r.sessionId);
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, body);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("VALIDATION_ERROR");
    expect((await issuesOf(res)).map((i) => i.path)).toContain(path);
    expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
    const after = await sessionDoc(r.sessionId);
    expect(after.answers).toEqual(before.answers);
    expect(after.lastSavedStepNo).toBe(1);
    expect((after.updatedAt as Timestamp).isEqual(before.updatedAt as Timestamp)).toBe(true);
  });

  it("ステップに属さない設問の文言は「このステップの設問ではありません」", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    const res = await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, {
      stepNo: 2,
      answers: [{ questionNo: 1, choiceCode: 1 }],
    });
    expect(await issuesOf(res)).toEqual([
      { path: "answers[0].questionNo", message: "このステップの設問ではありません" },
    ]);
  });
});

describe("M7-exam-24 送信（求職者）POST …/submit", () => {
  it("results 1 文書が scoreAnswers と完全一致し、区分は求職者・入社日などは null・前回は null。利用履歴を 1 文書作り受検者の usageLogId がそれを指す。5 書き込みが同じ submittedAt で反映され、応答に採点結果を含めない", async () => {
    const answers: AnswerMap = cyclicAnswers();
    const usageLogsBefore = await countDocs(COLLECTIONS.usageLogs);
    const r = await registerViaApi({ organizationId: org.organizationId });
    await respondentApi.start(r.sessionId, r.cookieHeader);
    await saveAllStepsViaApi(r.sessionId, r.cookieHeader, answers);
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
      // 区分は受験のときの値（K-28）。入社日・退職日・役職は null、前回の結果につながない（11-1 §2.7.2）
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
    });

    // 利用履歴は送信のときに作る（11-1 §2.7.4）。I-M7-4: 受検者の usageLogId が指し、受検者区分と一致する
    const respondent = (await getDocForTest(
      COLLECTIONS.respondents,
      result.respondentId as string,
    ))!;
    expect(respondent.resultId).toBe(resultId);
    expect(respondent.usageLogId).toEqual(expect.any(String));
    expect(await countDocs(COLLECTIONS.usageLogs)).toBe(usageLogsBefore + 1);
    const usageLogs = (await listDocs(COLLECTIONS.usageLogs)).filter(
      (d) => d.data.respondentId === result.respondentId,
    );
    expect(usageLogs.map((d) => d.id)).toEqual([respondent.usageLogId]);
    const usage = usageLogs[0]!.data;
    expect(usage).toMatchObject({
      organizationId: org.organizationId,
      respondentId: result.respondentId,
      resultId,
      respondentKind: respondent.kind,
      name: respondent.name,
      phoneNumber: respondent.phoneNumber,
      diagnosisExperience: respondent.diagnosisExperience,
    });
    expect(usage.respondentKind).toBe("applicant");
    expect((usage.registeredAt as Timestamp).isEqual(respondent.createdAt as Timestamp)).toBe(true);
    const submittedAt = result.submittedAt as Timestamp;
    expect((session.submittedAt as Timestamp).isEqual(submittedAt)).toBe(true);
    expect((usage.submittedAt as Timestamp).isEqual(submittedAt)).toBe(true);
    expect(submittedAt.toDate().toISOString()).toBe(dto.submittedAt);
    const submits = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (a) => a.data.action === "session.submit" && a.data.targetId === resultId,
    );
    expect(submits).toHaveLength(1);
    expect(submits[0]!.data.details).toEqual({ scoringVersion: "1.0.0", linkedPrevious: false });

    // 送信後も GET は 200（完了画面の確認用）。開始・保存・送信は 409
    const progress = await respondentApi.progress(r.sessionId, r.cookieHeader);
    expect(progress.status).toBe(200);
    expect(((await progress.json()) as SessionProgressDto).status).toBe("submitted");
    for (const again of [
      await respondentApi.start(r.sessionId, r.cookieHeader),
      await respondentApi.saveAnswers(r.sessionId, r.cookieHeader, stepBody(1)),
      await respondentApi.submit(r.sessionId, r.cookieHeader),
    ]) {
      expect(again.status).toBe(409);
      expect(await errorCode(again)).toBe("SESSION_ALREADY_SUBMITTED");
    }
    expect(await countDocs(COLLECTIONS.results, [["sessionId", "==", r.sessionId]])).toBe(1);
    expect(
      await countDocs(COLLECTIONS.usageLogs, [["respondentId", "==", result.respondentId]]),
    ).toBe(1);
  });
});

describe("I-14 未回答で送信", () => {
  it("Q100 欠落は 422 ANSWERS_INCOMPLETE（details.missing = [100]）。results・利用履歴は作られず draft のまま", async () => {
    const answers: Record<number, number> = { ...uniformAnswers(3) };
    delete answers[100];
    const r = await registerViaApi({ organizationId: org.organizationId });
    await saveAllStepsViaApi(r.sessionId, r.cookieHeader, answers);
    const res = await respondentApi.submit(r.sessionId, r.cookieHeader);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: Doc } };
    expect(body.error.code).toBe("ANSWERS_INCOMPLETE");
    expect(body.error.details).toEqual({ missing: [100] });
    expect(await countDocs(COLLECTIONS.results, [["sessionId", "==", r.sessionId]])).toBe(0);
    const session = await sessionDoc(r.sessionId);
    expect(session.status).toBe("draft");
    expect(
      await countDocs(COLLECTIONS.usageLogs, [["respondentId", "==", session.respondentId]]),
    ).toBe(0);
    expect(
      (await getDocForTest(COLLECTIONS.respondents, session.respondentId as string))!.usageLogId,
    ).toBeNull();
  });
});

describe("M7-exam-32 二重送信（I-15 を引き継ぐ）", () => {
  it("同じセッションに submit を同時に 2 回 → 片方 200、他方 409。results と usageLogs は 1 文書ずつで、受検者の usageLogId がその利用履歴を指す", async () => {
    const r = await registerViaApi({ organizationId: org.organizationId });
    await saveAllStepsViaApi(r.sessionId, r.cookieHeader, uniformAnswers(2));
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
    const respondentId = (await sessionDoc(r.sessionId)).respondentId as string;
    const respondent = (await getDocForTest(COLLECTIONS.respondents, respondentId))!;
    const usageLogs = (await listDocs(COLLECTIONS.usageLogs)).filter(
      (d) => d.data.respondentId === respondentId,
    );
    expect(usageLogs).toHaveLength(1);
    expect(usageLogs[0]!.id).toBe(respondent.usageLogId);
    expect(usageLogs[0]!.data.resultId).toBe(results[0]!.id);
    expect(respondent.resultId).toBe(results[0]!.id);
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
      await respondentApi.saveAnswers(dto.sessionId, cookieHeader, stepBody(1)),
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
      const res = await respondentApi.saveAnswers(a.sessionId, cookie, stepBody(1));
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("RESPONDENT_TOKEN_INVALID");
    }
    expect((await sessionDoc(a.sessionId)).answers).toEqual({});
  });
});

describe("M7-exam-25 送信（既存スタッフ）", () => {
  it("kind = executive の受験は区分が在籍（employed）。results.respondentKind・usageLogs.respondentKind が executive（サーバコードで複製）", async () => {
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
    expect(result).toMatchObject({
      respondentKind: "executive",
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
      previousResultId: null,
    });
    expect(usage).toMatchObject({ respondentKind: "executive", resultId: session.resultId });
    expect(
      await countDocs(COLLECTIONS.usageLogs, [["respondentId", "==", session.respondentId]]),
    ).toBe(1);
  });
});

/** 登録済みの受験を開始し、4 ステップを保存して送信する（200 を確かめる）。結果の ID を返す */
async function finishViaApi(
  registered: RegisteredViaApi,
  answers: AnswerMap = uniformAnswers(3),
): Promise<string> {
  expect((await respondentApi.start(registered.sessionId, registered.cookieHeader)).status).toBe(
    200,
  );
  await saveAllStepsViaApi(registered.sessionId, registered.cookieHeader, answers);
  const res = await respondentApi.submit(registered.sessionId, registered.cookieHeader);
  expect(res.status).toBe(200);
  return (await sessionDoc(registered.sessionId)).resultId as string;
}

async function resultDoc(resultId: string): Promise<Doc> {
  const doc = await getDocForTest(COLLECTIONS.results, resultId);
  if (!doc) throw new Error("results が見つかりません");
  return doc;
}

async function respondentOfSession(sessionId: string): Promise<Doc & { id: string }> {
  const respondentId = (await sessionDoc(sessionId)).respondentId as string;
  return { ...(await getDocForTest(COLLECTIONS.respondents, respondentId))!, id: respondentId };
}

/** action と対象の ID で 1 件の監査ログ */
async function auditOf(action: string, targetId: string): Promise<Doc> {
  const logs = (await listDocs(COLLECTIONS.auditLogs)).filter(
    (a) => a.data.action === action && a.data.targetId === targetId,
  );
  expect(logs).toHaveLength(1);
  return logs[0]!.data;
}

/** resultId を前回とする、論理削除されていない結果の数（Q-M7-1 と同じ条件） */
const nextCount = (resultId: string) =>
  countDocs(COLLECTIONS.results, [
    ["organizationId", "==", linkOrg.organizationId],
    ["previousResultId", "==", resultId],
    ["deletedAt", "==", null],
  ]);

/** オーナーが回答一覧の削除（DELETE /admin/respondents/{id}）で受験を論理削除する */
async function deleteByOwner(respondentId: string): Promise<void> {
  const res = await callRoute(deleteRespondentRoute, {
    method: "DELETE",
    url: `/api/v1/admin/respondents/${respondentId}`,
    params: { respondentId },
    cookieHeader: linkOwner.cookieHeader,
  });
  expect(res.status).toBe(204);
}

describe("M7-exam-27 再受験（つながる。I-M7-1）", () => {
  it("同じ組織の送信済みの P を前回にして求職者の区分で登録すると、候補を受け付けて既存スタッフになり、送信で results.previousResultId == P。P の updatedAt だけを同じトランザクションで書く", async () => {
    const p = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const before = await resultDoc(p.resultId);

    // 登録: 候補を受け付けた受験は p にかかわらず既存スタッフ（11-1 §1.4 の 7）。応答の kind は保存した値
    const res = await respondentApi.register(
      registrationBody({
        organizationId: linkOrg.organizationId,
        kind: "applicant",
        previousResultId: p.resultId,
      }),
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as SessionCreatedDto;
    expect(dto.kind).toBe("executive");
    expect(JSON.stringify(dto)).not.toContain(p.resultId);
    const registered: RegisteredViaApi = {
      sessionId: dto.sessionId,
      cookieHeader: cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME)!,
      dto,
    };
    const respondent = await respondentOfSession(dto.sessionId);
    expect(respondent).toMatchObject({
      kind: "executive",
      previousResultId: p.resultId,
      teamCode: null,
      isExcluded: false,
    });
    expect((await auditOf("respondent.register", respondent.id)).details).toEqual({
      kind: "executive",
      previousCandidate: true,
    });

    // 送信: つなぐ。区分は在籍、受検者区分の複製は既存スタッフ。応答にはつながりも結果の ID も入らない
    expect((await respondentApi.start(registered.sessionId, registered.cookieHeader)).status).toBe(
      200,
    );
    await saveAllStepsViaApi(registered.sessionId, registered.cookieHeader, uniformAnswers(4));
    const submitted = await respondentApi.submit(registered.sessionId, registered.cookieHeader);
    expect(submitted.status).toBe(200);
    expect(JSON.stringify(await submitted.json())).not.toContain(p.resultId);
    const resultId = (await sessionDoc(registered.sessionId)).resultId as string;
    const result = await resultDoc(resultId);
    expect(result).toMatchObject({
      organizationId: linkOrg.organizationId,
      previousResultId: p.resultId,
      respondentKind: "executive",
      employmentStatus: "employed",
      teamCode: null,
      isExcluded: false,
    });
    const usage = (await getDocForTest(
      COLLECTIONS.usageLogs,
      (await respondentOfSession(registered.sessionId)).usageLogId as string,
    ))!;
    expect(usage.respondentKind).toBe("executive");
    expect((await auditOf("session.submit", resultId)).details).toEqual({
      scoringVersion: "1.0.0",
      linkedPrevious: true,
    });

    // 指される側の P: updatedAt だけが、新しい結果と同じコミットの時刻になる（同じトランザクションで書いた）
    const after = await resultDoc(p.resultId);
    const updatedAt = after.updatedAt as Timestamp;
    expect(updatedAt.toMillis()).toBeGreaterThan((before.updatedAt as Timestamp).toMillis());
    expect(updatedAt.isEqual(result.createdAt as Timestamp)).toBe(true);
    expect(updatedAt.isEqual(result.updatedAt as Timestamp)).toBe(true);
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    // I-M7-1: 同じ組織の、論理削除されていない、自分より前に送信された結果を指す
    expect(after.organizationId).toBe(result.organizationId);
    expect(after.deletedAt).toBeNull();
    expect((after.submittedAt as Timestamp).toMillis()).toBeLessThan(
      (result.submittedAt as Timestamp).toMillis(),
    );
    // 前回の候補は送信で書き換えない（I-M7-3）
    expect((await respondentOfSession(registered.sessionId)).previousResultId).toBe(p.resultId);
  });
});

describe("M7-exam-28 再受験（つながらない）", () => {
  it("P がほかの組織の結果・論理削除済み・存在しない ID・形の違う値・すでにほかの結果の前回のどれでも、通常の受験として登録し（応答の kind は入力どおり）、送信でもつながず P を書かない", async () => {
    const other = await createTestOrganization("別のサロン");
    const otherOrgResult = await submitAnswerSet(other, uniformAnswers(2));
    const deleted = await submitAnswerSet(linkOrg, uniformAnswers(2));
    await deleteByOwner(deleted.respondentId);
    const linked = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const relinked = await submitAnswerSet(linkOrg, uniformAnswers(3), {
      previousResultId: linked.resultId,
    });
    expect((await resultDoc(relinked.resultId)).previousResultId).toBe(linked.resultId);

    const cases: Array<[string, string, string | null]> = [
      ["ほかの組織の結果", otherOrgResult.resultId, otherOrgResult.resultId],
      ["論理削除済みの結果", deleted.resultId, deleted.resultId],
      ["すでにほかの論理削除されていない結果の前回", linked.resultId, linked.resultId],
      ["存在しない文書 ID の形の値", "NoSuchResult00000000", null],
      ["形の違う値（a/b）", "a/b", null],
      ["形の違う値（記号）", "bad-id", null],
      ["形の違う値（129 文字以上）", "a".repeat(200), null],
      ["空の文字", "", null],
    ];
    for (const [label, previousResultId, existing] of cases) {
      const before = existing === null ? null : await getDocForTest(COLLECTIONS.results, existing);
      const res = await respondentApi.register(
        registrationBody({ organizationId: linkOrg.organizationId, previousResultId }),
      );
      expect(res.status, label).toBe(201);
      const dto = (await res.json()) as SessionCreatedDto;
      expect(dto.kind, label).toBe("applicant");
      const respondent = await respondentOfSession(dto.sessionId);
      expect(respondent, label).toMatchObject({ kind: "applicant", previousResultId: null });
      expect((await auditOf("respondent.register", respondent.id)).details, label).toEqual({
        kind: "applicant",
        previousCandidate: false,
      });

      const resultId = await finishViaApi({
        sessionId: dto.sessionId,
        cookieHeader: cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME)!,
        dto,
      });
      expect((await resultDoc(resultId)).previousResultId, label).toBeNull();
      expect((await auditOf("session.submit", resultId)).details, label).toEqual({
        scoringVersion: "1.0.0",
        linkedPrevious: false,
      });
      if (existing !== null) {
        const after = await getDocForTest(COLLECTIONS.results, existing);
        expect((after!.updatedAt as Timestamp).isEqual(before!.updatedAt as Timestamp), label).toBe(
          true,
        );
      }
    }
    // すでに前回になっていた結果を前回とする結果は、先につないだ 1 件のまま（I-M7-2）
    expect(await nextCount(linked.resultId)).toBe(1);
  });

  it("ほかの組織の結果と存在しない ID で、応答（状態・本文の形・Cookie）と読み取り（文書 1 回。Q-M7-1 を読まない）が同じ。prev からほかの組織の結果の有無が分からない", async () => {
    const other = await createTestOrganization("別のサロン");
    const otherOrgResult = await submitAnswerSet(other, uniformAnswers(2));
    const unlinked = await submitAnswerSet(linkOrg, uniformAnswers(2));

    /** 登録 1 回の応答の形と、Firestore の読み取りの回数（文書の get と、クエリの get） */
    const observe = async (previousResultId: string | undefined) => {
      const documentGet = vi.spyOn(DocumentReference.prototype, "get");
      const queryGet = vi.spyOn(Query.prototype, "get");
      try {
        const res = await respondentApi.register(
          registrationBody({
            organizationId: linkOrg.organizationId,
            ...(previousResultId === undefined ? {} : { previousResultId }),
          }),
        );
        const dto = (await res.json()) as SessionCreatedDto;
        return {
          status: res.status,
          body: { ...dto, sessionId: "-", tokenExpiresAt: "-", nextUrl: "-" },
          cookie: cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME) !== null,
          documentReads: documentGet.mock.calls.length,
          queries: queryGet.mock.calls.length,
        };
      } finally {
        documentGet.mockRestore();
        queryGet.mockRestore();
      }
    };
    const plain = await observe(undefined);
    const otherOrg = await observe(otherOrgResult.resultId);
    const missing = await observe("NoSuchResult00000000");
    expect(otherOrg).toEqual(missing);
    expect(otherOrg.body).toEqual(plain.body);
    // results を 1 回読むだけで止まり、Q-M7-1 のクエリまで進まない（11-1 §2.2.8 の手順 2）
    expect(otherOrg).toMatchObject({
      status: 201,
      cookie: true,
      documentReads: plain.documentReads + 1,
      queries: plain.queries,
    });
    // 同じ組織の、まだつながっていない結果なら Q-M7-1 を 1 回読んで候補にする（応答の kind は保存した値）
    const candidate = await observe(unlinked.resultId);
    expect(candidate).toMatchObject({
      status: 201,
      documentReads: plain.documentReads + 1,
      queries: plain.queries + 1,
    });
    expect(candidate.body.kind).toBe("executive");
  });

  it("previousResultId が 201 文字・数値・null は 422 VALIDATION_ERROR（path が previousResultId）で何も書かない", async () => {
    const before = await countDocs(COLLECTIONS.respondents);
    for (const previousResultId of ["a".repeat(201), 12345, null]) {
      const res = await respondentApi.register({
        ...registrationBody({ organizationId: linkOrg.organizationId }),
        previousResultId,
      });
      expect(res.status, String(previousResultId)).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION_ERROR");
      expect((await issuesOf(res)).map((i) => i.path)).toEqual(["previousResultId"]);
      expect(setCookieLine(res, RESPONDENT_COOKIE_NAME)).toBeNull();
    }
    expect(await countDocs(COLLECTIONS.respondents)).toBe(before);
  });
});

describe("M7-exam-29 同じ前回へ 2 人（I-M7-2・I-M7-3）", () => {
  it("同じ P で 2 人を登録し（どちらも候補あり）、順に送信すると先の送信だけがつながる。後の受検者の前回の候補は P のまま", async () => {
    const p = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const a = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p.resultId,
    });
    const b = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p.resultId,
    });
    expect([a.dto.kind, b.dto.kind]).toEqual(["executive", "executive"]);

    const aResultId = await finishViaApi(a);
    const bResultId = await finishViaApi(b);
    expect((await resultDoc(aResultId)).previousResultId).toBe(p.resultId);
    expect((await resultDoc(bResultId)).previousResultId).toBeNull();
    expect((await auditOf("session.submit", aResultId)).details).toMatchObject({
      linkedPrevious: true,
    });
    expect((await auditOf("session.submit", bResultId)).details).toMatchObject({
      linkedPrevious: false,
    });
    // つながらなかった受験も既存スタッフ・在籍のまま（11-1 §2.7.3 の手順 5）。候補は書き換えない（I-M7-3）
    expect(await resultDoc(bResultId)).toMatchObject({
      respondentKind: "executive",
      employmentStatus: "employed",
    });
    expect((await respondentOfSession(b.sessionId)).previousResultId).toBe(p.resultId);
    expect(await nextCount(p.resultId)).toBe(1);
  });

  it("同じ P2 への 2 件の送信を同時に（Promise.all）行うと、どちらも 200 で、P2 を前回とする論理削除されていない結果は 1 件だけ（枝分かれしない）", async () => {
    const p2 = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const c = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p2.resultId,
    });
    const d = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p2.resultId,
    });
    for (const r of [c, d]) {
      expect((await respondentApi.start(r.sessionId, r.cookieHeader)).status).toBe(200);
      await saveAllStepsViaApi(r.sessionId, r.cookieHeader, uniformAnswers(5));
    }
    const responses = await Promise.all(
      [c, d].map((r) => respondentApi.submit(r.sessionId, r.cookieHeader)),
    );
    expect(responses.map((x) => x.status)).toEqual([200, 200]);

    const resultIds = await Promise.all(
      [c, d].map(async (r) => (await sessionDoc(r.sessionId)).resultId as string),
    );
    const previous = await Promise.all(
      resultIds.map(async (id) => (await resultDoc(id)).previousResultId),
    );
    expect(previous.filter((v) => v === p2.resultId)).toHaveLength(1);
    expect(previous.filter((v) => v === null)).toHaveLength(1);
    expect(await nextCount(p2.resultId)).toBe(1);
    const linked = await Promise.all(
      resultIds.map(async (id) => (await auditOf("session.submit", id)).details as Doc),
    );
    expect(linked.filter((d) => d.linkedPrevious === true)).toHaveLength(1);
  });
});

describe("M7-exam-30 登録と送信の間の変化（K-39 Q-35・K-04）", () => {
  it("登録のあとに P3 を論理削除してから送信すると、つながらない。受検者の前回の候補は P3 のまま（I-M7-3）", async () => {
    const p3 = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const e = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p3.resultId,
    });
    expect(e.dto.kind).toBe("executive");
    await deleteByOwner(p3.respondentId);

    const resultId = await finishViaApi(e);
    expect((await resultDoc(resultId)).previousResultId).toBeNull();
    expect((await auditOf("session.submit", resultId)).details).toMatchObject({
      linkedPrevious: false,
    });
    expect((await respondentOfSession(e.sessionId)).previousResultId).toBe(p3.resultId);
  });

  it("登録のあとに P4 を前回とする G を論理削除すると、G は無いものとして F が P4 につながる。論理削除でどの previousResultId も書き換わらない", async () => {
    const p4 = await submitAnswerSet(linkOrg, uniformAnswers(2));
    const f = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p4.resultId,
    });
    const g = await registerViaApi({
      organizationId: linkOrg.organizationId,
      previousResultId: p4.resultId,
    });
    const gResultId = await finishViaApi(g);
    expect((await resultDoc(gResultId)).previousResultId).toBe(p4.resultId);
    await deleteByOwner((await respondentOfSession(g.sessionId)).id);

    const fResultId = await finishViaApi(f);
    expect((await resultDoc(fResultId)).previousResultId).toBe(p4.resultId);
    expect((await auditOf("session.submit", fResultId)).details).toMatchObject({
      linkedPrevious: true,
    });
    // 論理削除はほかの受験の previousResultId を書き換えない（K-04。11-7 §2.2.3）
    const gResult = await resultDoc(gResultId);
    expect(gResult.deletedAt).toBeInstanceOf(Timestamp);
    expect(gResult.previousResultId).toBe(p4.resultId);
    expect((await resultDoc(p4.resultId)).previousResultId).toBeNull();
    expect(await nextCount(p4.resultId)).toBe(1);
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
      await saveAllStepsViaApi(r.sessionId, r.cookieHeader, cyclicAnswers());
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
    // 08 §2.4 の完了条件（登録から送信応答まで）。4 回の保存を含むため中央値で判定する
    expect(median(totalMs)).toBeLessThan(2000);
  });
});
