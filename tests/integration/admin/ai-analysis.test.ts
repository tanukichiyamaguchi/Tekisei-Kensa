// I-40〜I-44、I-48 AI 解説（04 §5.9、§7.1、07 §6、§7.1、§4.8）。AI_PROVIDER = stub
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  GET as getAiRoute,
  POST as postAiRoute,
} from "@/app/api/v1/admin/results/[resultId]/ai-analysis/route";
import { buildAiAnalysisInput } from "@/lib/ai/input";
import { setAiProviderForTest } from "@/lib/ai/provider";
import { buildStubOutput, createStubProvider } from "@/lib/ai/providers/stub";
import type { AiProvider } from "@/lib/ai/types";
import { COLLECTIONS } from "@/lib/db/collections";
import { markAiGenerationStarted } from "@/lib/db/repositories/ai-analyses-repository";
import { scoreAnswers } from "@/lib/scoring/score";
import type { AnswerMap } from "@/lib/scoring/types";
import { AI_STALE_AFTER_MS } from "@/lib/services/ai-analysis";
import type { AiAnalysisDto } from "@/lib/services/dto/result";

import {
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { countDocs, getDocForTest, listDocs } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

const call = (handler: typeof postAiRoute, method: "POST" | "GET", admin: TestAdmin, id: string) =>
  callRoute(handler, {
    method,
    url: `/api/v1/admin/results/${id}/ai-analysis`,
    params: { resultId: id },
    cookieHeader: admin.cookieHeader,
  });
const post = (admin: TestAdmin, id: string) => call(postAiRoute, "POST", admin, id);
const get = (admin: TestAdmin, id: string) => call(getAiRoute, "GET", admin, id);

async function aiAuditLogs(resultId: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((d) => d.data)
    .filter((d) => d.action === "result.ai_generate" && d.targetId === resultId);
}

let org: TestOrganization;
let owner: TestAdmin;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("AI解説テスト歯科"));
});

afterEach(() => {
  setAiProviderForTest(null);
  vi.restoreAllMocks();
});

async function submit(name: string, answers: AnswerMap = cyclicAnswers()) {
  return submitAnswerSet(org, answers, { name });
}

describe("I-40 / I-41 生成と保存済みの再表示", () => {
  it("POST で aiAnalyses 1 文書・results の completed・監査ログが揃い、2 回目は再生成しない", async () => {
    const answers = cyclicAnswers();
    const target = await submit("生成 太郎", answers);

    const res = await post(owner, target.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiAnalysisDto;
    expect(body.resultId).toBe(target.resultId);
    expect(body.status).toBe("completed");
    expect(body.error).toBeNull();
    expect(body.latest).not.toBeNull();

    // provider の output と深い等価（付録D §2 のキーのまま）
    const expected = buildStubOutput(
      buildAiAnalysisInput({
        respondentName: "生成 太郎",
        occupationCode: 2,
        score: scoreAnswers(answers),
      }),
    );
    expect(body.latest?.output).toEqual(expected);
    expect(body.latest?.provider).toBe("stub");
    expect(body.latest?.model).toBe("claude-opus-5");
    expect(body.latest?.promptVersion).toBe("recruitment-v1");

    const aiDocs = (await listDocs(COLLECTIONS.aiAnalyses)).filter(
      (d) => d.data.resultId === target.resultId,
    );
    expect(aiDocs).toHaveLength(1);
    const doc = aiDocs[0]!;
    expect(doc.id).toBe(body.latest?.aiAnalysisId);
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
    });
    expect(
      Object.keys((doc.data.output as Record<string, unknown>).verdict as object).sort(),
    ).toEqual(["sokusenryoku", "sougou", "teichaku_risk"]);

    const result = await getDocForTest<Record<string, unknown>>(
      COLLECTIONS.results,
      target.resultId,
    );
    expect(result).toMatchObject({
      aiGenerationStatus: "completed",
      latestAiAnalysisId: doc.id,
      aiGenerationError: null,
    });

    const logs = await aiAuditLogs(target.resultId);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toEqual({
      status: "completed",
      aiAnalysisId: doc.id,
      inputTokens: null,
      outputTokens: null,
    });

    // I-41: 再度 POST しても保存済みを返し、aiAnalyses が増えない
    const again = await post(owner, target.resultId);
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as AiAnalysisDto;
    expect(againBody.latest?.aiAnalysisId).toBe(doc.id);
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(1);
    expect(await aiAuditLogs(target.resultId)).toHaveLength(1);

    // GET も同じ形
    const got = await get(owner, target.resultId);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(againBody);
  });

  it("GET: 未生成は not_generated・latest null。存在しない結果は 404", async () => {
    const target = await submit("未生成 花子", uniformAnswers(3));
    const res = await get(owner, target.resultId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resultId: target.resultId,
      status: "not_generated",
      startedAt: null,
      error: null,
      latest: null,
    });
    const missing = await post(owner, "AAAAAAAAAAAAAAAAAAAA");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("RESULT_NOT_FOUND");
  });
});

describe("I-42 並行 POST", () => {
  it("生成中の文書への 2 本目は 409 AI_ALREADY_GENERATING", async () => {
    const target = await submit("並行 次郎");
    setAiProviderForTest(createStubProvider({ delayMs: 1500 }));

    const [a, b] = await Promise.all([post(owner, target.resultId), post(owner, target.resultId)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(await errorCode(conflict)).toBe("AI_ALREADY_GENERATING");
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(1);
  });

  it("生成中（開始から 10 分未満）に POST すると 409", async () => {
    const target = await submit("生成中 三郎");
    setAiProviderForTest(createStubProvider({ delayMs: 1500 }));
    const first = post(owner, target.resultId);
    // 1 本目が generating に遷移するのを待つ
    await vi.waitFor(async () => {
      const doc = await getDocForTest<Record<string, unknown>>(
        COLLECTIONS.results,
        target.resultId,
      );
      expect(doc?.aiGenerationStatus).toBe("generating");
    });
    const second = await post(owner, target.resultId);
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe("AI_ALREADY_GENERATING");
    expect((await first).status).toBe(200);
  });
});

describe("I-43 / I-48 生成失敗（stub の不正 JSON モード）とログ", () => {
  it("502 invalid_json、failed に遷移し aiAnalyses を作らない。再試行で generating から完了する。ログに個人情報が出ない", async () => {
    const target = await submit("__INVALID_JSON__");
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation(capture);
    }

    const res = await post(owner, target.resultId);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; details: { reason: string } } };
    expect(body.error.code).toBe("AI_GENERATION_FAILED");
    expect(body.error.details.reason).toBe("invalid_json");

    const result = await getDocForTest<Record<string, unknown>>(
      COLLECTIONS.results,
      target.resultId,
    );
    expect(result).toMatchObject({
      aiGenerationStatus: "failed",
      aiGenerationError: "invalid_json",
      latestAiAnalysisId: null,
    });
    expect(await countDocs(COLLECTIONS.aiAnalyses, [["resultId", "==", target.resultId]])).toBe(0);
    const failedLogs = await aiAuditLogs(target.resultId);
    expect(failedLogs).toHaveLength(1);
    expect(failedLogs[0]!.details).toEqual({ status: "failed", reason: "invalid_json" });

    // GET も failed を返す
    const got = (await (await get(owner, target.resultId)).json()) as AiAnalysisDto;
    expect(got.status).toBe("failed");
    expect(got.error).toBe("invalid_json");

    // 再試行: 受検者名は変えられないため、氏名を差し替える provider で成功させる（08 I-43）
    const base = createStubProvider({ delayMs: 0 });
    const renamed: AiProvider = {
      name: "stub",
      generate: (input, options) =>
        base.generate({ ...input, respondentName: "再試行 四郎" }, options),
    };
    setAiProviderForTest(renamed);
    const retry = await post(owner, target.resultId);
    expect(retry.status).toBe(200);
    const retryBody = (await retry.json()) as AiAnalysisDto;
    expect(retryBody.status).toBe("completed");
    expect(retryBody.error).toBeNull();

    // I-48: ログに受検者名・summary・生テキスト・API キーが含まれない。成功・失敗の 1 行ずつに必要な項目がある
    const joined = lines.join("\n");
    expect(joined).not.toContain("__INVALID_JSON__");
    expect(joined).not.toContain("再試行 四郎");
    expect(joined).not.toContain(retryBody.latest?.output.summary ?? "summary");
    expect(joined).not.toContain("```json");
    expect(joined).not.toContain("sk-ant");
    const aiLines = lines
      .filter((l) => l.includes('"message":"ai.generate"'))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(aiLines).toHaveLength(2);
    const [failedLine, okLine] = aiLines;
    expect(failedLine).toMatchObject({
      resultId: target.resultId,
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      status: "failed",
      reason: "invalid_json",
    });
    expect(okLine).toMatchObject({
      resultId: target.resultId,
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      status: "completed",
      stopReason: "end_turn",
    });
    expect(typeof okLine!.elapsedMs).toBe("number");
    const okLogs = (await aiAuditLogs(target.resultId)).filter(
      (l) => (l.details as { status: string }).status === "completed",
    );
    expect(okLogs[0]!.details).toMatchObject({ inputTokens: null, outputTokens: null });
  });
});

describe("I-44 生成中の滞留（10 分超）", () => {
  it("GET で failed（timeout）に戻り監査ログが残る。同じ状態の POST は再開始される", async () => {
    const target = await submit("滞留 五郎");
    // 11 分前に生成を開始した状態を、時刻のモックで作る（直接書き込みは使わない）
    const realNow = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(realNow - 11 * 60 * 1000);
    await markAiGenerationStarted({
      resultId: target.resultId,
      viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
      staleAfterMs: AI_STALE_AFTER_MS,
    });
    spy.mockRestore();
    const before = await getDocForTest<Record<string, unknown>>(
      COLLECTIONS.results,
      target.resultId,
    );
    expect(before?.aiGenerationStatus).toBe("generating");

    const res = await get(owner, target.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiAnalysisDto;
    expect(body.status).toBe("failed");
    expect(body.error).toBe("timeout");
    const logs = await aiAuditLogs(target.resultId);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.details).toEqual({ status: "failed", reason: "timeout" });

    // 滞留した generating に直接 POST しても再開始される（staleAfterMs）
    const target2 = await submit("滞留 六郎");
    const spy2 = vi.spyOn(Date, "now").mockReturnValue(realNow - 11 * 60 * 1000);
    await markAiGenerationStarted({
      resultId: target2.resultId,
      viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
      staleAfterMs: AI_STALE_AFTER_MS,
    });
    spy2.mockRestore();
    const restarted = await post(owner, target2.resultId);
    expect(restarted.status).toBe(200);
    expect(((await restarted.json()) as AiAnalysisDto).status).toBe("completed");
  });
});
