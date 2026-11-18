// AI 解説の種類ごとの API（POST・GET …/ai-analysis/{kind}。11-6 §3.4・§3.5）。M7-ai-24・25・27・28・32・33・34・36（11-6 §5.2 の
// PR-7.9 の分）と、今の I-40〜I-44・I-48 の観点（04 §5.9、§7.1、07 §6、§7.1、§4.8）。I-40・I-41 → M7-ai-24、I-42 → M7-ai-33、
// I-43・I-48 → M7-ai-36、I-44 → M7-ai-32。日次上限の 429 のテストは無かったので、上限が無いことを M7-ai-25 で足した。AI_PROVIDER = stub
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PATCH as patchRespondentRoute } from "@/app/api/v1/admin/respondents/[respondentId]/route";
import {
  GET as getAiRoute,
  POST as postAiRoute,
} from "@/app/api/v1/admin/results/[resultId]/ai-analysis/[kind]/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { buildAiAnalysisInput } from "@/lib/ai/input";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { setAiProviderForTest } from "@/lib/ai/provider";
import { RECRUITMENT_V1_SYSTEM } from "@/lib/ai/prompts/recruitment-v1";
import { buildStubOutput, createStubProvider } from "@/lib/ai/providers/stub";
import type { AiAnalysisInput, AiProvider } from "@/lib/ai/types";
import { COLLECTIONS } from "@/lib/db/collections";
import {
  countAiAnalysesSince,
  markAiGenerationStarted,
} from "@/lib/db/repositories/ai-analyses-repository";
import { adminFirestore } from "@/lib/firebase/admin";
import { scoreAnswers } from "@/lib/scoring/score";
import type { AnswerMap } from "@/lib/scoring/types";
import { AI_STALE_AFTER_MS } from "@/lib/services/ai-analysis";
import type { AiKindResponse } from "@/lib/services/dto/ai";
import type { ResultDetailDto } from "@/lib/services/dto/result";

import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

type Doc = Record<string, unknown>;

const call = (
  handler: typeof postAiRoute,
  method: "POST" | "GET",
  admin: TestAdmin,
  id: string,
  kind: string,
) =>
  callRoute(handler, {
    method,
    url: `/api/v1/admin/results/${id}/ai-analysis/${kind}`,
    params: { resultId: id, kind },
    cookieHeader: admin.cookieHeader,
  });
const post = (admin: TestAdmin, id: string, kind: string = "recruitment") =>
  call(postAiRoute, "POST", admin, id, kind);
const get = (admin: TestAdmin, id: string, kind: string = "recruitment") =>
  call(getAiRoute, "GET", admin, id, kind);

async function detailOf(admin: TestAdmin, resultId: string): Promise<ResultDetailDto> {
  const res = await callRoute(getResultRoute, {
    method: "GET",
    url: `/api/v1/admin/results/${resultId}`,
    params: { resultId },
    cookieHeader: admin.cookieHeader,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ResultDetailDto;
}

async function aiAuditLogs(resultId: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((d) => d.data)
    .filter((d) => d.action === "result.ai_generate" && d.targetId === resultId);
}

async function resultDoc(resultId: string): Promise<Doc> {
  return (await getDocForTest<Doc>(COLLECTIONS.results, resultId))!;
}

/** results の種類ごとの項目（11-6 §3.1） */
const RECRUITMENT_FIELDS = [
  "aiGenerationStatus",
  "aiGenerationStartedAt",
  "aiGenerationError",
  "latestAiAnalysisId",
] as const;
const TRAINING_FIELDS = [
  "trainingAiStatus",
  "trainingAiStartedAt",
  "trainingAiError",
  "latestTrainingAiAnalysisId",
  "trainingContext",
] as const;
const LONGITUDINAL_FIELDS = [
  "longitudinalAiStatus",
  "longitudinalAiStartedAt",
  "longitudinalAiError",
  "latestLongitudinalAiAnalysisId",
] as const;
const INITIAL_OTHER_KINDS = {
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

function pick(doc: Doc, fields: readonly string[]): Doc {
  return Object.fromEntries(fields.map((f) => [f, doc[f]]));
}

/** provider を呼んだ回数を数える（中身は stub） */
function countingProvider(delayMs = 0): { readonly provider: AiProvider; calls: () => number } {
  const base = createStubProvider({ delayMs });
  let count = 0;
  return {
    provider: {
      name: "stub",
      generate: (kind, input, options) => {
        count += 1;
        return base.generate(kind, input, options);
      },
    },
    calls: () => count,
  };
}

/** console の出力をすべて捕まえる（ログに個人情報・プロンプト・出力の中身が出ないことを確かめる） */
function captureConsole(): string[] {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(capture);
  }
  return lines;
}

function jsonLines(lines: readonly string[], message: string): Doc[] {
  return lines.filter((l) => l.includes(`"message":"${message}"`)).map((l) => JSON.parse(l) as Doc);
}

let org: TestOrganization;
let owner: TestAdmin;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("AI解説テストサロン"));
});

afterEach(() => {
  setAiProviderForTest(null);
  vi.restoreAllMocks();
});

async function submit(name: string, answers: AnswerMap = cyclicAnswers()) {
  return submitAnswerSet(org, answers, { name });
}

/** 種類の生成を minutesAgo 分前に始めた状態にする（時刻のモックで作る。直接書き込みは使わない） */
async function startedMinutesAgo(
  resultId: string,
  kind: AiAnalysisKind,
  minutesAgo: number,
): Promise<void> {
  const spy = vi.spyOn(Date, "now").mockReturnValue(Date.now() - minutesAgo * 60 * 1000);
  try {
    await markAiGenerationStarted({
      resultId,
      viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
      kind,
      staleAfterMs: AI_STALE_AFTER_MS,
    });
  } finally {
    spy.mockRestore();
  }
}

describe("M7-ai-24（I-40・I-41） 採用向けの生成と保存済みの再表示", () => {
  it("POST recruitment で aiAnalyses 1 文書・results の採用向けの項目・監査ログ（kind 付き）がそろい、2 回目の POST は provider を呼ばずに保存済みを返す", async () => {
    const answers = cyclicAnswers();
    const target = await submit("テストテスト 01", answers);
    const counter = countingProvider();
    setAiProviderForTest(counter.provider);

    const res = await post(owner, target.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiKindResponse;
    expect(body).toMatchObject({
      resultId: target.resultId,
      kind: "recruitment",
      status: "completed",
      error: null,
      enabled: true,
    });
    expect(typeof body.startedAt).toBe("string");
    expect(counter.calls()).toBe(1);

    // provider の output と深い等価（付録D §2 のキーのまま）
    const expected = buildStubOutput(
      buildAiAnalysisInput({
        respondentName: "テストテスト 01",
        occupationCode: 2,
        score: scoreAnswers(answers),
      }),
    );
    const latest = body.kind === "recruitment" ? body.latest : null;
    expect(latest).not.toBeNull();
    expect(latest?.output).toEqual(expected);
    expect(latest).toMatchObject({
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      reliability: scoreAnswers(answers).reliability,
    });

    const aiDocs = (await listDocs(COLLECTIONS.aiAnalyses)).filter(
      (d) => d.data.resultId === target.resultId,
    );
    expect(aiDocs).toHaveLength(1);
    const doc = aiDocs[0]!;
    expect(doc.id).toBe(latest?.aiAnalysisId);
    expect(doc.data).toMatchObject({
      organizationId: org.organizationId,
      respondentId: target.respondentId,
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      analysisKind: "recruitment",
      rawText: JSON.stringify(expected),
      output: expected,
      usage: null,
      stopReason: "end_turn",
      status: "completed",
      generatedBy: owner.uid,
      trainingContext: null,
      previousResultId: null,
      usedTrainingAction: null,
    });

    const result = await resultDoc(target.resultId);
    expect(result).toMatchObject({
      aiGenerationStatus: "completed",
      latestAiAnalysisId: doc.id,
      aiGenerationError: null,
      // 育成・定着と経年比較の項目は変わらない
      ...INITIAL_OTHER_KINDS,
    });

    const logs = await aiAuditLogs(target.resultId);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toEqual({
      status: "completed",
      kind: "recruitment",
      aiAnalysisId: doc.id,
      inputTokens: null,
      outputTokens: null,
    });

    // I-41: 再度 POST しても保存済みを返し、provider を呼ばず、aiAnalyses と監査ログが増えない
    const again = await post(owner, target.resultId);
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as AiKindResponse;
    expect(againBody).toEqual(body);
    expect(counter.calls()).toBe(1);
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(1);
    expect(await aiAuditLogs(target.resultId)).toHaveLength(1);

    // GET も同じ形
    const got = await get(owner, target.resultId);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(againBody);
  });

  it("GET recruitment: 未生成は not_generated・latest null・enabled true。存在しない結果は GET・POST とも 404 RESULT_NOT_FOUND", async () => {
    const target = await submit("テストテスト 02", uniformAnswers(3));
    const res = await get(owner, target.resultId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resultId: target.resultId,
      kind: "recruitment",
      status: "not_generated",
      startedAt: null,
      error: null,
      enabled: true,
      latest: null,
    });
    for (const [method, send] of [
      ["GET", get],
      ["POST", post],
    ] as const) {
      const missing = await send(owner, "AAAAAAAAAAAAAAAAAAAA");
      expect(missing.status, method).toBe(404);
      expect(await errorCode(missing), method).toBe("RESULT_NOT_FOUND");
    }
  });
});

describe("M7-ai-25 日次上限が無い（K-25。11-6 §2.10）", () => {
  it("同じ組織の当日の aiAnalyses が 200 件ある（例外的な直接書き込み: 今の API では一度に作れない）後でも、POST recruitment は 200・completed", async () => {
    const target = await submit("テストテスト 03");
    const now = Timestamp.now();
    const batch = adminFirestore().batch();
    for (let i = 0; i < 200; i += 1) {
      batch.set(adminFirestore().collection(COLLECTIONS.aiAnalyses).doc(), {
        organizationId: org.organizationId,
        resultId: "NoSuchResult00000000",
        analysisKind: "recruitment",
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
    // 廃止した日次上限（K-03 の 200 回）の数え方: Asia/Tokyo の当日 0 時（UTC+9 固定）からの件数
    const dayMs = 24 * 60 * 60 * 1000;
    const tokyoOffsetMs = 9 * 60 * 60 * 1000;
    const tokyoDayStart = new Date(
      Math.floor((Date.now() + tokyoOffsetMs) / dayMs) * dayMs - tokyoOffsetMs,
    );
    expect(
      await countAiAnalysesSince({ organizationId: org.organizationId, since: tokyoDayStart }),
    ).toBeGreaterThanOrEqual(200);

    const res = await post(owner, target.resultId);
    expect(res.status).toBe(200);
    expect(((await res.json()) as AiKindResponse).status).toBe("completed");
  });
});

describe("M7-ai-27 責任者の受験（K-21。表示上の役職が責任者）", () => {
  const patchRespondent = (respondentId: string, body: unknown) =>
    callRoute(patchRespondentRoute, {
      method: "PATCH",
      url: `/api/v1/admin/respondents/${respondentId}`,
      params: { respondentId },
      body,
      cookieHeader: owner.cookieHeader,
    });

  it("役職を責任者にした受験と、役職が未設定で職業コード 10 の受験は、採用向け・育成・定着の POST・GET が 409 AI_NOT_APPLICABLE。経年比較の GET は 200、POST は 503（409 にならない）", async () => {
    // 役職を責任者にする前に採用向けを生成しておく（作った分析は消さずに残る）
    const byRole = await submit("テストテスト 04");
    expect((await post(owner, byRole.resultId)).status).toBe(200);
    const analysisId = (await resultDoc(byRole.resultId)).latestAiAnalysisId as string;
    expect((await patchRespondent(byRole.respondentId, { staffRole: "manager" })).status).toBe(200);
    const byOccupation = await submitAnswerSet(org, cyclicAnswers(), {
      name: "テストテスト 05",
      occupationCode: 10,
    });
    expect((await resultDoc(byOccupation.resultId)).staffRole).toBeNull();

    const counter = countingProvider();
    setAiProviderForTest(counter.provider);
    for (const target of [byRole, byOccupation]) {
      for (const kind of ["recruitment", "training"] as const) {
        for (const [method, send] of [
          ["POST", post],
          ["GET", get],
        ] as const) {
          const res = await send(owner, target.resultId, kind);
          expect(res.status, `${method} ${kind}`).toBe(409);
          expect(((await res.json()) as { error: unknown }).error).toEqual({
            code: "AI_NOT_APPLICABLE",
            message: "この受験では、この AI 解説は使えません",
            details: {},
          });
        }
      }
      const longitudinalGet = await get(owner, target.resultId, "longitudinal");
      expect(longitudinalGet.status).toBe(200);
      expect(await longitudinalGet.json()).toEqual({
        resultId: target.resultId,
        kind: "longitudinal",
        status: "not_generated",
        startedAt: null,
        error: null,
        enabled: false,
      });
      const longitudinalPost = await post(owner, target.resultId, "longitudinal");
      expect(longitudinalPost.status).toBe(503);
      expect(await errorCode(longitudinalPost)).toBe("AI_KIND_DISABLED");

      // 結果詳細も採用向け・育成・定着を出さない（経年比較のタブは PR-7.11a まで出さないので、タブは 0）
      expect((await detailOf(owner, target.resultId)).ai).toEqual({
        visibleTabs: [],
        recruitment: null,
        training: null,
        longitudinal: { status: "not_generated", startedAt: null, error: null, enabled: false },
      });
    }
    expect(counter.calls()).toBe(0);

    // 役職を責任者にする前に作った採用向けの分析は、文書も latestAiAnalysisId も残る（出さないだけ）
    expect(await resultDoc(byRole.resultId)).toMatchObject({
      staffRole: "manager",
      aiGenerationStatus: "completed",
      latestAiAnalysisId: analysisId,
    });
    expect(await getDocForTest(COLLECTIONS.aiAnalyses, analysisId)).not.toBeNull();
  });
});

describe("M7-ai-28 無効な種類（PR-7.9 は育成・定着と経年比較が無効）と、パスの確かめ", () => {
  it("POST training・longitudinal は 503 AI_KIND_DISABLED で、状態は変わらず provider を呼ばない。GET は 200・enabled false・not_generated", async () => {
    const target = await submit("テストテスト 06");
    const counter = countingProvider();
    setAiProviderForTest(counter.provider);
    const before = await resultDoc(target.resultId);

    for (const kind of ["training", "longitudinal"] as const) {
      const res = await post(owner, target.resultId, kind);
      expect(res.status, kind).toBe(503);
      expect(((await res.json()) as { error: unknown }).error).toEqual({
        code: "AI_KIND_DISABLED",
        message: "この AI 解説は準備中です",
        details: {},
      });
    }
    expect(counter.calls()).toBe(0);
    expect(await resultDoc(target.resultId)).toEqual(before);
    expect(await aiAuditLogs(target.resultId)).toHaveLength(0);

    const training = await get(owner, target.resultId, "training");
    expect(training.status).toBe(200);
    expect(await training.json()).toEqual({
      resultId: target.resultId,
      kind: "training",
      status: "not_generated",
      startedAt: null,
      error: null,
      enabled: false,
      context: null,
      latest: null,
    });
    const longitudinal = await get(owner, target.resultId, "longitudinal");
    expect(longitudinal.status).toBe(200);
    expect(await longitudinal.json()).toEqual({
      resultId: target.resultId,
      kind: "longitudinal",
      status: "not_generated",
      startedAt: null,
      error: null,
      enabled: false,
    });
  });

  it("知らない kind と形の違う resultId は 404 NOT_FOUND、admin から見えない既存スタッフの結果は 404 RESULT_NOT_FOUND", async () => {
    const target = await submit("テストテスト 07");
    for (const kind of ["foo", "Recruitment", "ai-analysis"]) {
      for (const send of [post, get]) {
        const res = await send(owner, target.resultId, kind);
        expect(res.status, kind).toBe(404);
        expect(await errorCode(res)).toBe("NOT_FOUND");
      }
    }
    for (const send of [post, get]) {
      const res = await send(owner, "not-a-doc-id/x");
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("NOT_FOUND");
    }

    const admin = await createAdmin(org, "admin");
    const executive = await submitAnswerSet(org, uniformAnswers(4), {
      kind: "executive",
      name: "テストテスト 08",
    });
    for (const kind of ["recruitment", "training", "longitudinal"] as const) {
      for (const send of [post, get]) {
        const res = await send(admin, executive.resultId, kind);
        expect(res.status, kind).toBe(404);
        expect(await errorCode(res)).toBe("RESULT_NOT_FOUND");
      }
    }
    // オーナーには見える
    expect((await get(owner, executive.resultId)).status).toBe(200);
  });
});

describe("M7-ai-32（I-44） 種類ごとの生成中の滞留（10 分超）", () => {
  it("採用向けの generating（開始から 11 分）は GET で failed・timeout に戻り、監査ログが残る。育成・定着と経年比較の項目は変わらない", async () => {
    const target = await submit("テストテスト 09");
    await startedMinutesAgo(target.resultId, "recruitment", 11);
    expect((await resultDoc(target.resultId)).aiGenerationStatus).toBe("generating");

    const res = await get(owner, target.resultId);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      kind: "recruitment",
      status: "failed",
      error: "timeout",
      latest: null,
    });
    const logs = await aiAuditLogs(target.resultId);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toEqual({ status: "failed", kind: "recruitment", reason: "timeout" });
    const after = await resultDoc(target.resultId);
    expect(after).toMatchObject({ aiGenerationStatus: "failed", aiGenerationError: "timeout" });
    expect(pick(after, [...TRAINING_FIELDS, ...LONGITUDINAL_FIELDS])).toEqual(INITIAL_OTHER_KINDS);
  });

  it("育成・定着の generating（開始から 11 分）は GET training で failed・timeout に戻り、採用向けの項目は変わらない", async () => {
    const target = await submit("テストテスト 10");
    await startedMinutesAgo(target.resultId, "training", 11);
    const before = await resultDoc(target.resultId);
    expect(before.trainingAiStatus).toBe("generating");
    const startedAt = (before.trainingAiStartedAt as Timestamp).toDate().toISOString();

    const res = await get(owner, target.resultId, "training");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resultId: target.resultId,
      kind: "training",
      status: "failed",
      startedAt,
      error: "timeout",
      enabled: false,
      context: null,
      latest: null,
    });
    const logs = await aiAuditLogs(target.resultId);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toEqual({ status: "failed", kind: "training", reason: "timeout" });
    const after = await resultDoc(target.resultId);
    expect(after).toMatchObject({ trainingAiStatus: "failed", trainingAiError: "timeout" });
    expect(pick(after, RECRUITMENT_FIELDS)).toEqual(pick(before, RECRUITMENT_FIELDS));
    expect(pick(after, LONGITUDINAL_FIELDS)).toEqual(pick(before, LONGITUDINAL_FIELDS));
  });

  it("開始から 10 分たっていない generating は GET で変わらない（生成中のまま）", async () => {
    const target = await submit("テストテスト 11");
    await startedMinutesAgo(target.resultId, "recruitment", 9);
    const res = await get(owner, target.resultId);
    expect(((await res.json()) as AiKindResponse).status).toBe("generating");
    expect(await aiAuditLogs(target.resultId)).toHaveLength(0);
  });

  it("滞留した採用向けの generating に直接 POST しても再開始され、completed になる", async () => {
    const target = await submit("テストテスト 12");
    await startedMinutesAgo(target.resultId, "recruitment", 11);
    const restarted = await post(owner, target.resultId);
    expect(restarted.status).toBe(200);
    expect(((await restarted.json()) as AiKindResponse).status).toBe("completed");
  });
});

describe("M7-ai-33（I-42） 同じ種類の同時の要求", () => {
  it("同じ結果に POST recruitment を 2 つ同時に送ると片方が 409 AI_ALREADY_GENERATING で、provider は 1 回", async () => {
    const target = await submit("テストテスト 13");
    const counter = countingProvider(1500);
    setAiProviderForTest(counter.provider);

    const [a, b] = await Promise.all([post(owner, target.resultId), post(owner, target.resultId)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(await errorCode(conflict)).toBe("AI_ALREADY_GENERATING");
    expect(counter.calls()).toBe(1);
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(1);
  });

  it("生成中（開始から 10 分未満）に POST すると 409", async () => {
    const target = await submit("テストテスト 14");
    setAiProviderForTest(createStubProvider({ delayMs: 1500 }));
    const first = post(owner, target.resultId);
    // 1 本目が generating に移るのを待つ
    await vi.waitFor(async () => {
      expect((await resultDoc(target.resultId)).aiGenerationStatus).toBe("generating");
    });
    const second = await post(owner, target.resultId);
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe("AI_ALREADY_GENERATING");
    expect((await first).status).toBe(200);
  });
});

describe("M7-ai-34 結果詳細の ai と、保存した出力が読めないときの作り直し", () => {
  it("結果詳細の ai: visibleTabs は採用向けと育成・定着、採用向けだけが有効、経年比較は状態だけ（PR-7.9 の形）", async () => {
    const target = await submit("テストテスト 15");
    expect((await detailOf(owner, target.resultId)).ai).toEqual({
      visibleTabs: ["recruitment", "training"],
      recruitment: {
        status: "not_generated",
        startedAt: null,
        error: null,
        enabled: true,
        latest: null,
      },
      training: {
        status: "not_generated",
        startedAt: null,
        error: null,
        enabled: false,
        context: null,
        latest: null,
      },
      longitudinal: { status: "not_generated", startedAt: null, error: null, enabled: false },
    });
  });

  it("スキーマに合わない出力（例外的な直接書き込み）は、結果詳細と GET で failed・internal_error・latest null になり、ログ ai.output_unreadable を出す。その後の POST で作り直す", async () => {
    const target = await submit("テストテスト 16");
    expect((await post(owner, target.resultId)).status).toBe(200);
    const oldId = (await resultDoc(target.resultId)).latestAiAnalysisId as string;
    await adminFirestore()
      .collection(COLLECTIONS.aiAnalyses)
      .doc(oldId)
      .update({ output: { summary: "テスト用の読めない出力" } });

    const lines = captureConsole();
    const unreadable = {
      status: "failed",
      error: "internal_error",
      enabled: true,
      latest: null,
    };
    expect((await detailOf(owner, target.resultId)).ai.recruitment).toMatchObject(unreadable);
    const got = await get(owner, target.resultId);
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({
      resultId: target.resultId,
      kind: "recruitment",
      ...unreadable,
    });
    // 保存はしない（results は completed と前の分析のまま）
    expect(await resultDoc(target.resultId)).toMatchObject({
      aiGenerationStatus: "completed",
      latestAiAnalysisId: oldId,
    });
    const logs = jsonLines(lines, "ai.output_unreadable");
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      const { level, time, message, ...fields } = log;
      expect(level).toBe("warn");
      expect(message).toBe("ai.output_unreadable");
      expect(typeof time).toBe("string");
      expect(fields).toEqual({
        resultId: target.resultId,
        kind: "recruitment",
        aiAnalysisId: oldId,
        promptVersion: "recruitment-v1",
      });
    }
    vi.restoreAllMocks();

    // 作り直し: provider を呼び、新しい分析で completed
    const counter = countingProvider();
    setAiProviderForTest(counter.provider);
    const regenerated = await post(owner, target.resultId);
    expect(regenerated.status).toBe(200);
    const body = (await regenerated.json()) as AiKindResponse;
    expect(body.status).toBe("completed");
    expect(counter.calls()).toBe(1);
    const newId = (await resultDoc(target.resultId)).latestAiAnalysisId as string;
    expect(newId).not.toBe(oldId);
    expect(body.kind === "recruitment" ? body.latest?.aiAnalysisId : null).toBe(newId);
  });

  it("最新の分析の文書が無い・種類の違う文書を指す（例外的な直接書き込み: 文書を消す・種類を書き換える）ときも failed・internal_error（読めた文書が無いのでログの promptVersion は null）", async () => {
    const missing = await submit("テストテスト 17");
    expect((await post(owner, missing.resultId)).status).toBe(200);
    const missingId = (await resultDoc(missing.resultId)).latestAiAnalysisId as string;
    await adminFirestore().collection(COLLECTIONS.aiAnalyses).doc(missingId).delete();

    const wrongKind = await submit("テストテスト 18");
    expect((await post(owner, wrongKind.resultId)).status).toBe(200);
    const wrongKindId = (await resultDoc(wrongKind.resultId)).latestAiAnalysisId as string;
    await adminFirestore()
      .collection(COLLECTIONS.aiAnalyses)
      .doc(wrongKindId)
      .update({ analysisKind: "training" });

    const lines = captureConsole();
    for (const target of [missing, wrongKind]) {
      expect(await (await get(owner, target.resultId)).json()).toMatchObject({
        status: "failed",
        error: "internal_error",
        latest: null,
      });
    }
    const logs = jsonLines(lines, "ai.output_unreadable");
    expect(logs.map((l) => [l.aiAnalysisId, l.promptVersion])).toEqual([
      [missingId, null],
      [wrongKindId, null],
    ]);
  });

  it("生成済みなのに最新の分析の ID が無い（例外的な直接書き込み: ID を null にする）ときも、結果詳細と GET は failed・internal_error（ログの aiAnalysisId と promptVersion は null）。その後の POST で作り直す", async () => {
    const target = await submit("テストテスト 20");
    expect((await post(owner, target.resultId)).status).toBe(200);
    await adminFirestore()
      .collection(COLLECTIONS.results)
      .doc(target.resultId)
      .update({ latestAiAnalysisId: null });

    const lines = captureConsole();
    const unreadable = { status: "failed", error: "internal_error", enabled: true, latest: null };
    expect((await detailOf(owner, target.resultId)).ai.recruitment).toMatchObject(unreadable);
    expect(await (await get(owner, target.resultId)).json()).toMatchObject({
      resultId: target.resultId,
      kind: "recruitment",
      ...unreadable,
    });
    const logs = jsonLines(lines, "ai.output_unreadable");
    expect(logs.map((l) => [l.resultId, l.kind, l.aiAnalysisId, l.promptVersion])).toEqual([
      [target.resultId, "recruitment", null, null],
      [target.resultId, "recruitment", null, null],
    ]);
    vi.restoreAllMocks();

    const counter = countingProvider();
    setAiProviderForTest(counter.provider);
    const regenerated = await post(owner, target.resultId);
    expect(regenerated.status).toBe(200);
    const body = (await regenerated.json()) as AiKindResponse;
    expect(body.status).toBe("completed");
    expect(counter.calls()).toBe(1);
    const newId = (await resultDoc(target.resultId)).latestAiAnalysisId as string;
    expect(typeof newId).toBe("string");
    expect(body.kind === "recruitment" ? body.latest?.aiAnalysisId : null).toBe(newId);
  });

  it("最新の分析の文書に必須の項目が無い（例外的な直接書き込み: output を消す）ときも 500 にせず、結果詳細と GET は failed・internal_error（ログの promptVersion は null）。その後の POST で作り直す", async () => {
    const target = await submit("テストテスト 21");
    expect((await post(owner, target.resultId)).status).toBe(200);
    const oldId = (await resultDoc(target.resultId)).latestAiAnalysisId as string;
    await adminFirestore()
      .collection(COLLECTIONS.aiAnalyses)
      .doc(oldId)
      .update({ output: FieldValue.delete() });

    const lines = captureConsole();
    const unreadable = { status: "failed", error: "internal_error", enabled: true, latest: null };
    expect((await detailOf(owner, target.resultId)).ai.recruitment).toMatchObject(unreadable);
    const got = await get(owner, target.resultId);
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject(unreadable);
    const logs = jsonLines(lines, "ai.output_unreadable");
    expect(logs.map((l) => [l.aiAnalysisId, l.promptVersion])).toEqual([
      [oldId, null],
      [oldId, null],
    ]);
    vi.restoreAllMocks();

    const counter = countingProvider();
    setAiProviderForTest(counter.provider);
    const regenerated = await post(owner, target.resultId);
    expect(regenerated.status).toBe(200);
    expect(((await regenerated.json()) as AiKindResponse).status).toBe("completed");
    expect(counter.calls()).toBe(1);
    expect((await resultDoc(target.resultId)).latestAiAnalysisId).not.toBe(oldId);
  });

  it("生成の開始のトランザクション（11-6 §3.5 の 8。リポジトリの関数を直接呼ぶ）: 生成済みで読めるなら何も書かずに alreadyCompleted。読めない生成済み（例外的な直接書き込み: 出力を壊す・種類を書き換える・必須の項目を消す・ID を文書 ID の形でない値や null にする）は generating にして、最新の分析の ID は前の値のまま", async () => {
    const viewer = { uid: owner.uid, organizationId: org.organizationId, role: "owner" } as const;
    const start = (resultId: string) =>
      markAiGenerationStarted({
        resultId,
        viewer,
        kind: "recruitment",
        staleAfterMs: AI_STALE_AFTER_MS,
      });

    // 読める生成済み: 何も書かない（状態・開始日時・updatedAt も変わらない）
    const readable = await submit("テストテスト 22");
    expect((await post(owner, readable.resultId)).status).toBe(200);
    const before = await resultDoc(readable.resultId);
    expect(await start(readable.resultId)).toEqual({
      alreadyCompleted: true,
      latestAiAnalysisId: before.latestAiAnalysisId,
    });
    expect(await resultDoc(readable.resultId)).toEqual(before);

    // 読めない生成済み: 開始する（最新の分析の ID は前の値のまま。I-ai-1・11-6 §3.5 の 1.1 版の注記）
    const breakers: ReadonlyArray<
      readonly [string, (resultId: string, analysisId: string) => Promise<unknown>]
    > = [
      [
        "出力がスキーマに合わない",
        (_, id) =>
          adminFirestore()
            .collection(COLLECTIONS.aiAnalyses)
            .doc(id)
            .update({ output: { summary: "テスト用の読めない出力" } }),
      ],
      [
        "種類が違う",
        (_, id) =>
          adminFirestore()
            .collection(COLLECTIONS.aiAnalyses)
            .doc(id)
            .update({ analysisKind: "training" }),
      ],
      [
        "必須の項目が無い",
        (_, id) =>
          adminFirestore()
            .collection(COLLECTIONS.aiAnalyses)
            .doc(id)
            .update({ output: FieldValue.delete() }),
      ],
      [
        "文書が無い",
        (_, id) => adminFirestore().collection(COLLECTIONS.aiAnalyses).doc(id).delete(),
      ],
      [
        "ID が文書 ID の形でない",
        (resultId) =>
          adminFirestore()
            .collection(COLLECTIONS.results)
            .doc(resultId)
            .update({ latestAiAnalysisId: "not-a-doc-id/x" }),
      ],
      [
        "ID が null",
        (resultId) =>
          adminFirestore()
            .collection(COLLECTIONS.results)
            .doc(resultId)
            .update({ latestAiAnalysisId: null }),
      ],
    ];
    let n = 23;
    for (const [label, breakIt] of breakers) {
      const target = await submit(`テストテスト ${n}`);
      n += 1;
      expect((await post(owner, target.resultId)).status, label).toBe(200);
      await breakIt(
        target.resultId,
        (await resultDoc(target.resultId)).latestAiAnalysisId as string,
      );
      const latestId = (await resultDoc(target.resultId)).latestAiAnalysisId;
      expect(await start(target.resultId), label).toEqual({
        alreadyCompleted: false,
        latestAiAnalysisId: latestId,
      });
      expect(await resultDoc(target.resultId), label).toMatchObject({
        aiGenerationStatus: "generating",
        aiGenerationError: null,
        latestAiAnalysisId: latestId,
      });
    }
  });

  it("M7 より前の形（新しい 3 項目の無い）aiAnalyses も読める（例外的な直接書き込み: 3 項目を消す）", async () => {
    const target = await submit("テストテスト 19");
    expect((await post(owner, target.resultId)).status).toBe(200);
    const id = (await resultDoc(target.resultId)).latestAiAnalysisId as string;
    await adminFirestore().collection(COLLECTIONS.aiAnalyses).doc(id).update({
      trainingContext: FieldValue.delete(),
      previousResultId: FieldValue.delete(),
      usedTrainingAction: FieldValue.delete(),
    });
    const body = (await (await get(owner, target.resultId)).json()) as AiKindResponse;
    expect(body.status).toBe("completed");
    expect(body.kind === "recruitment" ? body.latest?.aiAnalysisId : null).toBe(id);
    expect((await detailOf(owner, target.resultId)).ai.recruitment?.status).toBe("completed");
  });
});

describe("M7-ai-36（I-43・I-48） 生成の失敗（stub の不正 JSON）と作り直し、ログと監査", () => {
  it("502 invalid_json で failed になり aiAnalyses を作らない。作り直すと completed。ログに kind・maxTokens があり、氏名・出力・プロンプト・API キーが出ない", async () => {
    const target = await submit("__INVALID_JSON__");
    const lines = captureConsole();

    const res = await post(owner, target.resultId);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; details: { reason: string } } };
    expect(body.error.code).toBe("AI_GENERATION_FAILED");
    expect(body.error.details.reason).toBe("invalid_json");

    expect(await resultDoc(target.resultId)).toMatchObject({
      aiGenerationStatus: "failed",
      aiGenerationError: "invalid_json",
      latestAiAnalysisId: null,
      ...INITIAL_OTHER_KINDS,
    });
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(0);
    const failedLogs = await aiAuditLogs(target.resultId);
    expect(failedLogs).toHaveLength(1);
    expect(failedLogs[0]!.details).toEqual({
      status: "failed",
      kind: "recruitment",
      reason: "invalid_json",
    });

    // GET も failed を返す
    const got = (await (await get(owner, target.resultId)).json()) as AiKindResponse;
    expect(got).toMatchObject({ status: "failed", error: "invalid_json" });

    // 作り直し: 受検者名は変えられないため、氏名を差し替える provider で成功させる（08 I-43）
    const base = createStubProvider({ delayMs: 0 });
    const renamed: AiProvider = {
      name: "stub",
      generate: (kind, input, options) =>
        base.generate(
          kind,
          { ...(input as AiAnalysisInput), respondentName: "テストテスト 再試行" } as typeof input,
          options,
        ),
    };
    setAiProviderForTest(renamed);
    const retry = await post(owner, target.resultId);
    expect(retry.status).toBe(200);
    const retryBody = (await retry.json()) as AiKindResponse;
    expect(retryBody).toMatchObject({ status: "completed", error: null });
    const summary = retryBody.kind === "recruitment" ? retryBody.latest?.output.summary : null;
    expect(summary).toContain("テストテスト 再試行");

    // ログに受検者名・出力の文・プロンプトの文・応答の文字・API キーが含まれない
    const joined = lines.join("\n");
    expect(joined).not.toContain("__INVALID_JSON__");
    expect(joined).not.toContain("テストテスト 再試行");
    expect(joined).not.toContain(summary ?? "summary");
    expect(joined).not.toContain("（スタブ）");
    expect(joined).not.toContain("```json");
    expect(joined).not.toContain(RECRUITMENT_V1_SYSTEM.split("\n")[0]!);
    expect(joined).not.toContain("【氏名】");
    expect(joined).not.toContain("sk-ant");

    // ai.generate は失敗・成功の 1 行ずつ。kind と maxTokens（採用向けは 16000）を持つ
    const aiLines = jsonLines(lines, "ai.generate");
    expect(aiLines).toHaveLength(2);
    const [failedLine, okLine] = aiLines;
    expect(failedLine).toMatchObject({
      level: "warn",
      resultId: target.resultId,
      organizationId: org.organizationId,
      kind: "recruitment",
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      maxTokens: 16000,
      status: "failed",
      reason: "invalid_json",
    });
    expect(okLine).toMatchObject({
      level: "info",
      resultId: target.resultId,
      kind: "recruitment",
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      maxTokens: 16000,
      status: "completed",
      stopReason: "end_turn",
    });
    expect(typeof okLine!.elapsedMs).toBe("number");

    const okLogs = (await aiAuditLogs(target.resultId)).filter(
      (l) => (l.details as { status: string }).status === "completed",
    );
    expect(okLogs).toHaveLength(1);
    expect(okLogs[0]!.details).toEqual({
      status: "completed",
      kind: "recruitment",
      aiAnalysisId: (await resultDoc(target.resultId)).latestAiAnalysisId,
      inputTokens: null,
      outputTokens: null,
    });
  });
});
