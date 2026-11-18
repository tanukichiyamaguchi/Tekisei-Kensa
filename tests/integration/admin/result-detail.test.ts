// I-35 結果詳細（04 §5.4）: results 1 + respondents 1 + 最新 aiAnalyses（採用向け・育成・定着の生成済みの分。11-6 §3.5）から作られ、
// 指標キーが識別子のまま。AI 解説の領域は ai（AiAreaDto。11-6 §3.6）
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import type { AiAnalysisOutput } from "@/lib/ai/types";
import { COLLECTIONS } from "@/lib/db/collections";
import * as aiAnalysesRepository from "@/lib/db/repositories/ai-analyses-repository";
import * as respondentsRepository from "@/lib/db/repositories/respondents-repository";
import * as resultsRepository from "@/lib/db/repositories/results-repository";
import type { ResultDetailDto } from "@/lib/services/dto/result";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

import {
  createOrganizationWithOwner,
  meta,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
} from "../helpers/fixtures";
import { getDocForTest, listDocs, writeDocForTest } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

// 読み取りの回数をリポジトリ関数のスパイで数える（08 I-35: getDocForTest の呼び出しではなく）
vi.mock("@/lib/db/repositories/results-repository", async (importOriginal) => {
  const mod = await importOriginal<typeof resultsRepository>();
  return {
    ...mod,
    getResult: vi.fn(mod.getResult),
    listResults: vi.fn(mod.listResults),
    fetchPopulation: vi.fn(mod.fetchPopulation),
  };
});
vi.mock("@/lib/db/repositories/respondents-repository", async (importOriginal) => {
  const mod = await importOriginal<typeof respondentsRepository>();
  return {
    ...mod,
    getRespondent: vi.fn(mod.getRespondent),
    getRespondentsByIds: vi.fn(mod.getRespondentsByIds),
  };
});
vi.mock("@/lib/db/repositories/ai-analyses-repository", async (importOriginal) => {
  const mod = await importOriginal<typeof aiAnalysesRepository>();
  return { ...mod, getAiAnalysis: vi.fn(mod.getAiAnalysis) };
});

/** 付録D §2 のスキーマに合う出力（保存した出力は読むときにスキーマで確かめる。11-6 §2.3.4） */
const output: AiAnalysisOutput = {
  summary: "テスト用の要約",
  verdict: { sokusenryoku: "高い", teichaku_risk: "低い", sougou: "推奨" },
  strengths: ["強み 1"],
  cautions: ["注意点 1"],
  questions: [{ q: "質問 1", intent: "意図 1" }],
  retention: {
    levers: [
      { label: "関わり方", text: "関わり方の文" },
      { label: "任せ方", text: "任せ方の文" },
      { label: "認め方", text: "認め方の文" },
      { label: "伸ばし方", text: "伸ばし方の文" },
    ],
    sign: "兆候",
    action: "対応",
  },
};

const getDetail = (admin: TestAdmin, resultId: string) =>
  callRoute(getResultRoute, {
    method: "GET",
    url: `/api/v1/admin/results/${resultId}`,
    params: { resultId },
    cookieHeader: admin.cookieHeader,
  });

let owner: TestAdmin;
let withAi: Awaited<ReturnType<typeof submitAnswerSet>>;
let withoutAi: Awaited<ReturnType<typeof submitAnswerSet>>;
let aiAnalysisId: string;

beforeAll(async () => {
  const created = await createOrganizationWithOwner("詳細テスト歯科");
  owner = created.owner;
  const org = created.org;
  withAi = await submitAnswerSet(org, uniformAnswers(2), { name: "詳細 太郎" });
  withoutAi = await submitAnswerSet(org, uniformAnswers(4), { name: "詳細 花子" });
  // AI 解説の生成は M5。ここでは保存用のリポジトリ関数（02 §8.6）で 1 件作る
  ({ aiAnalysisId } = await aiAnalysesRepository.saveAiAnalysis({
    resultId: withAi.resultId,
    viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
    kind: "recruitment",
    generated: {
      output,
      rawText: JSON.stringify(output),
      model: "stub-model",
      promptVersion: "recruitment-v1",
      analysisKind: "recruitment",
      usage: null,
      stopReason: null,
      requestId: null,
    },
    provider: "stub",
    reliability: 80,
    meta,
  }));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("I-35 GET /admin/results/{resultId}", () => {
  it("results・respondents・採用向けの最新 aiAnalyses を 1 回ずつ読み、ResultDetailDto の形で返す", async () => {
    const res = await getDetail(owner, withAi.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultDetailDto;

    expect(vi.mocked(resultsRepository.getResult)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(respondentsRepository.getRespondent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledWith(
      expect.objectContaining({ aiAnalysisId, resultId: withAi.resultId, kind: "recruitment" }),
    );
    expect(vi.mocked(resultsRepository.listResults)).not.toHaveBeenCalled();
    expect(vi.mocked(resultsRepository.fetchPopulation)).not.toHaveBeenCalled();
    expect(vi.mocked(respondentsRepository.getRespondentsByIds)).not.toHaveBeenCalled();

    expect(Object.keys(body).sort()).toEqual(
      ["ai", "respondent", "resultId", "scores", "scoringVersion", "submittedAt"].sort(),
    );
    expect(body.resultId).toBe(withAi.resultId);
    expect(body.scoringVersion).toBe(SCORING_VERSION);
    expect(body.respondent).toEqual({
      respondentId: withAi.respondentId,
      name: "詳細 太郎",
      occupationCode: 2,
      kind: "applicant",
      diagnosisExperience: "first_time",
      teamCode: null,
      isExcluded: false,
    });
    // 電話番号は詳細に含めない（04 §5.4）
    expect(JSON.stringify(body)).not.toContain("090-0000-0000");

    // 指標キーは識別子のまま（04 D04-28）
    expect(Object.keys(body.scores.traits).sort()).toEqual([...TRAIT_KEYS].sort());
    expect(Object.keys(body.scores.compatibility).sort()).toEqual([...COMPATIBILITY_KEYS].sort());
    expect(Object.keys(body.scores.aptitudes).sort()).toEqual([...APTITUDE_KEYS].sort());
    expect(Object.keys(body.scores.risks).sort()).toEqual([...RISK_KEYS].sort());
    expect(Object.keys(body.scores.aptitudeTypeScores).sort()).toEqual(
      [...APTITUDE_TYPE_KEYS].sort(),
    );
    expect(Object.keys(body.scores.socialStyles).sort()).toEqual([...SOCIAL_STYLE_KEYS].sort());
    const stored = await getDocForTest<{ traits: Record<string, number> }>(
      COLLECTIONS.results,
      withAi.resultId,
    );
    expect(body.scores.traits).toEqual(stored!.traits);

    expect(Object.keys(body.ai).sort()).toEqual(
      ["longitudinal", "recruitment", "training", "visibleTabs"].sort(),
    );
    expect(body.ai.visibleTabs).toEqual(["recruitment", "training"]);
    expect(body.ai.recruitment).toMatchObject({ status: "completed", error: null, enabled: true });
    expect(body.ai.recruitment?.latest).toMatchObject({
      aiAnalysisId,
      provider: "stub",
      model: "stub-model",
      promptVersion: "recruitment-v1",
      reliability: 80,
      output,
    });
    expect(Object.keys(body.ai.recruitment ?? {})).not.toContain("resultId");
    expect(body.ai.training).toEqual({
      status: "not_generated",
      startedAt: null,
      error: null,
      enabled: false,
      context: null,
      latest: null,
    });
    expect(body.ai.longitudinal).toEqual({
      status: "not_generated",
      startedAt: null,
      error: null,
      enabled: false,
    });
  });

  it("AI 解説が未生成なら aiAnalyses を読まず latest = null", async () => {
    const res = await getDetail(owner, withoutAi.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultDetailDto;
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).not.toHaveBeenCalled();
    expect(body.ai).toEqual({
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

  it("閲覧ごとに result.view を 1 件記録する（details は空、氏名を含まない）", async () => {
    const before = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (d) => d.data.action === "result.view" && d.data.targetId === withoutAi.resultId,
    ).length;
    await getDetail(owner, withoutAi.resultId);
    const logs = (await listDocs(COLLECTIONS.auditLogs)).filter(
      (d) => d.data.action === "result.view" && d.data.targetId === withoutAi.resultId,
    );
    expect(logs).toHaveLength(before + 1);
    expect(logs.at(-1)!.data.details).toEqual({});
  });

  it("K-19 より前に保存された旧職業コード 9（その他）の受検者も表示できる（例外的な直接書き込みで旧データを再現）", async () => {
    await writeDocForTest(COLLECTIONS.respondents, withoutAi.respondentId, { occupationCode: 9 });
    const res = await getDetail(owner, withoutAi.resultId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultDetailDto;
    expect(body.respondent.occupationCode).toBe(9);
  });

  it("文書 ID の形式でなければ 404 NOT_FOUND、存在しなければ 404 RESULT_NOT_FOUND", async () => {
    const bad = await getDetail(owner, "not/a/doc");
    expect(bad.status).toBe(404);
    expect(await errorCode(bad)).toBe("NOT_FOUND");
    const missing = await getDetail(owner, "NoSuchResult00000000");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("RESULT_NOT_FOUND");
  });
});
