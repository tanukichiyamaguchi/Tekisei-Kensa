// I-45〜I-47、I-49 PDF 出力（04 §5.10、§7.2、07 §9）。AI 解説は PR-7.12 まで、全画面の PDF に生成済みの採用向けだけを載せる
// （印刷用ページのデータの recruitmentAi。育成・定着が生成済みでも載せない。11-6 §2.12・§3.7.8 の作り直しは PR-7.12）。
// 結合テストには Next のサーバが無く、Chromium が印刷用ページを開けないため、I-45 は renderResultPdf を差し替えて
// API の契約（ヘッダー・ファイル名・トークン・監査ログ）を確かめる。実際の PDF のバイト列と日本語は E2E（E-21）で確かめる。
// PDF_CHROMIUM_EXECUTABLE_PATH は結合テストの環境変数に無い（I-49 の前提）
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getPdfRoute } from "@/app/api/v1/admin/results/[resultId]/pdf/route";
import { POST as postAiRoute } from "@/app/api/v1/admin/results/[resultId]/ai-analysis/[kind]/route";
import { GET as getComparisonRoute } from "@/app/api/v1/admin/results/[resultId]/comparison/route";
import { GET as getResultRoute } from "@/app/api/v1/admin/results/[resultId]/route";
import { buildAiAnalysisInput } from "@/lib/ai/input";
import { buildStubOutput } from "@/lib/ai/providers/stub";
import { issuePdfToken, verifyPdfToken } from "@/lib/auth/pdf-token";
import { COLLECTIONS } from "@/lib/db/collections";
import * as aiAnalysesRepository from "@/lib/db/repositories/ai-analyses-repository";
import * as browserModule from "@/lib/pdf/browser";
import * as renderModule from "@/lib/pdf/render-result-pdf";
import type { RenderResultPdfArgs } from "@/lib/pdf/types";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ComparisonScope } from "@/lib/scoring/types";
import { loadPrintData, type PrintQuery } from "@/lib/services/print-data";

import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { listDocs } from "../helpers/firestore";
import { callRoute, errorCode } from "../helpers/routes";

vi.mock("@/lib/pdf/render-result-pdf", async (importOriginal) => {
  const mod = await importOriginal<typeof renderModule>();
  return { ...mod, renderResultPdf: vi.fn(mod.renderResultPdf) };
});
vi.mock("@/lib/pdf/browser", async (importOriginal) => {
  const mod = await importOriginal<typeof browserModule>();
  return { ...mod, launchBrowser: vi.fn(mod.launchBrowser) };
});
// AI 解説の文書を読むかを数える（restricted と責任者の受験では読まない）
vi.mock("@/lib/db/repositories/ai-analyses-repository", async (importOriginal) => {
  const mod = await importOriginal<typeof aiAnalysesRepository>();
  return { ...mod, getAiAnalysis: vi.fn(mod.getAiAnalysis) };
});

/** 1 KB を超える最小構成の PDF（I-45 の差し替え用） */
const FAKE_PDF = new Uint8Array(
  Buffer.from(`%PDF-1.7\n${"% padding\n".repeat(150)}%%EOF\n`, "latin1"),
);

let org: TestOrganization;
let owner: TestAdmin;
let admin: TestAdmin;
let applicant: Awaited<ReturnType<typeof submitAnswerSet>>;
let executive: Awaited<ReturnType<typeof submitAnswerSet>>;
let manager: Awaited<ReturnType<typeof submitAnswerSet>>;
let otherOrgResult: Awaited<ReturnType<typeof submitAnswerSet>>;

const NAME = "印刷 花子";

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("PDFテスト歯科"));
  admin = await createAdmin(org, "admin");
  applicant = await submitAnswerSet(org, cyclicAnswers(), { name: NAME });
  executive = await submitAnswerSet(org, uniformAnswers(4), {
    kind: "executive",
    name: "幹部 次郎",
  });
  const other = await createOrganizationWithOwner("別組織歯科");
  otherOrgResult = await submitAnswerSet(other.org, uniformAnswers(2), { name: "別組織 三郎" });
  // AI 解説を completed にしておく（full の印刷データに載る）
  const ai = await callRoute(postAiRoute, {
    method: "POST",
    url: `/api/v1/admin/results/${applicant.resultId}/ai-analysis/recruitment`,
    params: { resultId: applicant.resultId, kind: "recruitment" },
    cookieHeader: owner.cookieHeader,
  });
  expect(ai.status).toBe(200);
  // 責任者の受験（職業コード 10・役職は未設定）。採用向けの API は 409 で作れないので、生成済みの分析を保存用のリポジトリ関数
  // （02 §8.6）で作る（PDF に載せないことを確かめる）
  manager = await submitAnswerSet(org, cyclicAnswers(), {
    name: "テストテスト 責任者",
    occupationCode: 10,
  });
  const output = buildStubOutput(
    buildAiAnalysisInput({
      respondentName: "テストテスト 責任者",
      occupationCode: 10,
      score: scoreAnswers(cyclicAnswers()),
    }),
  );
  await aiAnalysesRepository.saveAiAnalysis({
    resultId: manager.resultId,
    viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
    kind: "recruitment",
    generated: {
      output,
      rawText: JSON.stringify(output),
      model: "claude-opus-5",
      promptVersion: "recruitment-v1",
      analysisKind: "recruitment",
      usage: null,
      stopReason: "end_turn",
      requestId: null,
    },
    provider: "stub",
    reliability: 80,
    meta: { ipAddress: null, userAgent: "vitest" },
  });
});

beforeEach(() => {
  vi.mocked(renderModule.renderResultPdf).mockClear();
  vi.mocked(browserModule.launchBrowser).mockClear();
  vi.mocked(aiAnalysesRepository.getAiAnalysis).mockClear();
});

const getPdf = (who: TestAdmin, resultId: string, query: string) =>
  callRoute(getPdfRoute, {
    method: "GET",
    url: `/api/v1/admin/results/${resultId}/pdf?${query}`,
    params: { resultId },
    cookieHeader: who.cookieHeader,
  });

async function pdfExportLogs(resultId: string) {
  return (await listDocs(COLLECTIONS.auditLogs))
    .map((d) => d.data)
    .filter((d) => d.action === "result.pdf_export" && d.targetId === resultId);
}

describe("I-49 PDF_CHROMIUM_EXECUTABLE_PATH 未設定", () => {
  it("PDF は 500 PDF_GENERATION_FAILED（browser_launch_failed）。結果詳細・比較・AI 生成は動く", async () => {
    const res = await getPdf(owner, applicant.resultId, "mode=full");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; details: { reason: string } } };
    expect(body.error.code).toBe("PDF_GENERATION_FAILED");
    expect(body.error.details.reason).toBe("browser_launch_failed");
    expect(await pdfExportLogs(applicant.resultId)).toHaveLength(0);

    const detail = await callRoute(getResultRoute, {
      method: "GET",
      url: `/api/v1/admin/results/${applicant.resultId}`,
      params: { resultId: applicant.resultId },
      cookieHeader: owner.cookieHeader,
    });
    expect(detail.status).toBe(200);
    const comparison = await callRoute(getComparisonRoute, {
      method: "GET",
      url: `/api/v1/admin/results/${applicant.resultId}/comparison?scope=organization`,
      params: { resultId: applicant.resultId },
      cookieHeader: owner.cookieHeader,
    });
    expect(comparison.status).toBe(200);
  });
});

describe("I-45 GET …/pdf の契約", () => {
  it.each([
    ["full", "mode=full&scope=organization", { kind: "organization" } as ComparisonScope],
    ["restricted", "mode=restricted", null],
  ] as const)(
    "mode=%s: application/pdf、氏名を含まないファイル名、トークン、監査ログ 1 件",
    async (mode, query, scope) => {
      vi.mocked(renderModule.renderResultPdf).mockResolvedValueOnce({
        bytes: FAKE_PDF,
        pageCount: 1,
        elapsedMs: 1,
      });
      const ofMode = async () =>
        (await pdfExportLogs(applicant.resultId)).filter(
          (l) => (l.details as { mode: string }).mode === mode,
        );
      const before = (await ofMode()).length;
      const res = await getPdf(owner, applicant.resultId, query);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const disposition = res.headers.get("content-disposition") ?? "";
      expect(disposition).toBe(
        `attachment; filename="result-${applicant.resultId.slice(0, 8)}-${mode}.pdf"`,
      );
      expect(disposition).not.toContain("印刷");
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(1024);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

      // 印刷トークン: 自分自身のオリジン（appBaseUrl）、対象・mode・scope・発行者が入る（04 §7.2）
      const args = vi.mocked(renderModule.renderResultPdf).mock
        .calls[0]?.[0] as RenderResultPdfArgs;
      expect(args.origin).toBe("http://localhost:3000");
      expect(args.mode).toBe(mode);
      expect(args.scope).toEqual(scope);
      const payload = verifyPdfToken(args.token, new Date());
      expect(payload).toMatchObject({
        resultId: applicant.resultId,
        organizationId: org.organizationId,
        adminUid: owner.uid,
        role: "owner",
        mode,
        scope,
      });

      // listDocs は文書 ID 順のため、mode で絞って件数と内容を確かめる
      const logs = await ofMode();
      expect(logs).toHaveLength(before + 1);
      expect(logs[0]?.details).toEqual({
        mode,
        scope: scope?.kind ?? null,
        teamCode: null,
      });
    },
  );

  it("mode 不正は 422、他組織・admin から見た幹部は 404（Chromium を起動しない）", async () => {
    const invalid = await getPdf(owner, applicant.resultId, "mode=x");
    expect(invalid.status).toBe(422);
    const missing = await getPdf(owner, applicant.resultId, "");
    expect(missing.status).toBe(422);
    const other = await getPdf(owner, otherOrgResult.resultId, "mode=full");
    expect(other.status).toBe(404);
    const exec = await getPdf(admin, executive.resultId, "mode=full");
    expect(exec.status).toBe(404);
    expect(await errorCode(exec)).toBe("RESULT_NOT_FOUND");
    expect(browserModule.launchBrowser).not.toHaveBeenCalled();
    expect(renderModule.renderResultPdf).not.toHaveBeenCalled();
  });
});

describe("I-46 母集団 0 件", () => {
  it("scope=team&teamCode=C は 409 POPULATION_EMPTY で、Chromium を起動しない", async () => {
    const res = await getPdf(owner, applicant.resultId, "mode=full&scope=team&teamCode=C");
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("POPULATION_EMPTY");
    expect(browserModule.launchBrowser).not.toHaveBeenCalled();
    expect(renderModule.renderResultPdf).not.toHaveBeenCalled();
  });
});

describe("I-47 印刷用ページの認可（loadPrintData）", () => {
  const now = new Date();
  const tokenFor = (
    overrides: Partial<Parameters<typeof issuePdfToken>[0]> = {},
    issuedAt: Date = now,
  ) =>
    issuePdfToken(
      {
        resultId: applicant.resultId,
        organizationId: org.organizationId,
        adminUid: owner.uid,
        role: "owner",
        mode: "full",
        scope: { kind: "organization" },
        ...overrides,
      },
      issuedAt,
    );
  const load = (resultId: string, query: PrintQuery) => loadPrintData({ resultId, query, now });
  const validQuery = (token: string): PrintQuery => ({
    mode: "full",
    scope: "organization",
    token,
  });

  it("有効なトークン: 結果・比較・AI 解説（full。採用向けの最新の分析だけを読む）を返す", async () => {
    const data = await load(applicant.resultId, validQuery(tokenFor()));
    expect(data).not.toBeNull();
    expect(data?.detail.respondent.name).toBe(NAME);
    expect(data?.comparison?.scope).toEqual({ kind: "organization" });
    expect(data?.visibility).toEqual({
      showGrade: true,
      showMatchScore: true,
      showRisks: true,
      showPosition: true,
      showAiAnalysis: true,
    });
    expect(data?.recruitmentAi).toMatchObject({ status: "completed", error: null });
    expect(data?.recruitmentAi?.latest).not.toBeNull();
    expect(data?.detail).not.toHaveProperty("ai");
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledWith(
      expect.objectContaining({ resultId: applicant.resultId, kind: "recruitment" }),
    );
  });

  it("育成・定着も生成済みの受験でも、full の印刷は採用向けの最新の分析だけを読み（getAiAnalysis は採用向けで 1 回）、育成・定着を載せない（PR-7.12 まで）", async () => {
    const both = await submitAnswerSet(org, cyclicAnswers(), { name: "テストテスト 印刷育成" });
    for (const [kind, body] of [
      ["recruitment", undefined],
      [
        "training",
        {
          context: {
            tenure: "year_2",
            evaluation: "meets",
            expectedRole: "trainer",
            recentState: "stable",
            relationship: "good",
            wish: "skill_up",
            changeSinceJoining: "growing",
            concern: "none",
          },
        },
      ],
    ] as const) {
      const res = await callRoute(postAiRoute, {
        method: "POST",
        url: `/api/v1/admin/results/${both.resultId}/ai-analysis/${kind}`,
        params: { resultId: both.resultId, kind },
        cookieHeader: owner.cookieHeader,
        ...(body === undefined ? {} : { body }),
      });
      expect(res.status, kind).toBe(200);
    }
    vi.mocked(aiAnalysesRepository.getAiAnalysis).mockClear();

    const data = await load(both.resultId, validQuery(tokenFor({ resultId: both.resultId })));
    expect(data?.visibility.showAiAnalysis).toBe(true);
    expect(data?.recruitmentAi).toMatchObject({ status: "completed" });
    expect(data?.recruitmentAi?.latest).not.toBeNull();
    expect(Object.keys(data ?? {}).sort()).toEqual(
      ["comparison", "detail", "mode", "recruitmentAi", "visibility"].sort(),
    );
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).toHaveBeenCalledWith(
      expect.objectContaining({ resultId: both.resultId, kind: "recruitment" }),
    );
  });

  it("restricted: 評価・合致度・リスク・AI 解説を非表示にし、AI 解説を読まない", async () => {
    const token = tokenFor({ mode: "restricted", scope: null });
    const data = await load(applicant.resultId, { mode: "restricted", token });
    expect(data?.visibility).toEqual({
      showGrade: false,
      showMatchScore: false,
      showRisks: false,
      showPosition: true,
      showAiAnalysis: false,
    });
    expect(data?.recruitmentAi).toBeNull();
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).not.toHaveBeenCalled();
    expect(data?.comparison).toBeNull();
  });

  it("責任者の受験（職業コード 10）: 生成済みの分析があっても、full で AI 解説を載せず、AI 解説を読まない（K-21）", async () => {
    const data = await load(manager.resultId, validQuery(tokenFor({ resultId: manager.resultId })));
    expect(data).not.toBeNull();
    expect(data?.visibility.showAiAnalysis).toBe(false);
    expect(data?.visibility.showGrade).toBe(true);
    expect(data?.recruitmentAi).toBeNull();
    expect(vi.mocked(aiAnalysesRepository.getAiAnalysis)).not.toHaveBeenCalled();
  });

  it("(a)〜(h) はすべて null（ページは 404）", async () => {
    const valid = tokenFor();
    const [body, signature] = valid.split(".");
    const tampered = `${body}.${signature?.slice(0, -2)}xx`;
    const expired = tokenFor({}, new Date(now.getTime() - 121_000));

    // (a) トークンなし、(h) 管理者 Cookie だけ（トークンなし）も同じ
    expect(await load(applicant.resultId, { mode: "full", scope: "organization" })).toBeNull();
    // (b) 署名改ざん
    expect(await load(applicant.resultId, validQuery(tampered))).toBeNull();
    // (c) 期限切れ
    expect(await load(applicant.resultId, validQuery(expired))).toBeNull();
    // (d) 他組織の resultId を含むトークン（組織 ID は自組織）
    const otherToken = tokenFor({ resultId: otherOrgResult.resultId });
    expect(await load(otherOrgResult.resultId, validQuery(otherToken))).toBeNull();
    // (e) パスの resultId とトークンの resultId の不一致
    expect(await load(executive.resultId, validQuery(valid))).toBeNull();
    // (f) mode・scope・teamCode とクエリの不一致
    expect(await load(applicant.resultId, { ...validQuery(valid), mode: "restricted" })).toBeNull();
    expect(await load(applicant.resultId, { mode: "full", token: valid })).toBeNull();
    expect(
      await load(applicant.resultId, { mode: "full", scope: "team", teamCode: "A", token: valid }),
    ).toBeNull();
    // (g) admin の role を持つトークンで幹部の resultId（adminUsers は再読しない）
    const adminToken = tokenFor({
      resultId: executive.resultId,
      adminUid: admin.uid,
      role: "admin",
    });
    expect(await load(executive.resultId, validQuery(adminToken))).toBeNull();
    // owner の role なら幹部も開ける
    const ownerExecToken = tokenFor({ resultId: executive.resultId });
    expect(await load(executive.resultId, validQuery(ownerExecToken))).not.toBeNull();
  });
});
