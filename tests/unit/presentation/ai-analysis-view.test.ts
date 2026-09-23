// X-12（06 §11）と AI 解説セクションの画面状態の判定（06 §3.5.9）
import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_FAILURE_REASONS } from "@/lib/ai/errors";
import { AI_FAILURE_TEXTS, aiFailureText } from "@/lib/presentation/admin-texts";
import {
  AI_POLL_INTERVAL_MS,
  AI_POLL_MAX_MS,
  classifyAiPostFailure,
  pollingExpired,
} from "@/lib/presentation/ai-analysis-view";
import { fetchAiAnalysis, requestAiAnalysis } from "@/lib/utils/admin-api";

describe("X-12 AI_FAILURE_TEXTS", () => {
  it("07 §4.6 の AiFailureReason 全値と internal_error を持つ", () => {
    expect(Object.keys(AI_FAILURE_TEXTS).sort()).toEqual(
      [...AI_FAILURE_REASONS, "internal_error"].sort(),
    );
  });

  it("06 §3.5.9 の表の文言", () => {
    expect(aiFailureText("provider_error")).toBe(
      "AI サービスとの通信に失敗しました。時間をおいて再試行してください",
    );
    expect(aiFailureText("rate_limited")).toBe(
      "AI サービスが混み合っています。時間をおいて再試行してください",
    );
    for (const code of ["invalid_request", "auth_error", "config_error"]) {
      expect(aiFailureText(code)).toBe(
        "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
      );
    }
    expect(aiFailureText("timeout")).toBe(
      "生成に時間がかかりすぎたため中断しました。再試行してください",
    );
    for (const code of ["invalid_json", "truncated"]) {
      expect(aiFailureText(code)).toBe("AI の応答を解釈できませんでした。再試行してください");
    }
    expect(aiFailureText("refusal")).toBe("AI が解説の生成を行いませんでした。再試行してください");
  });

  it("internal_error・未知の値・null は既定文言（理由コードをそのまま見せない）", () => {
    const fallback = "生成処理でエラーが発生しました。再試行してください";
    expect(aiFailureText("internal_error")).toBe(fallback);
    expect(aiFailureText("unknown_code")).toBe(fallback);
    expect(aiFailureText("toString")).toBe(fallback);
    expect(aiFailureText(null)).toBe(fallback);
  });
});

describe("classifyAiPostFailure（06 §3.5.9 の POST の応答ごとの扱い）", () => {
  const err = (status: number, code: string, details: Record<string, unknown> = {}) => ({
    status,
    code,
    message: `m-${code}`,
    details,
  });

  it("409 → ポーリング、429 → 上限（文言とロック）、502 → failed（理由コード）、404 → 通知", () => {
    expect(classifyAiPostFailure(err(409, "AI_ALREADY_GENERATING"))).toEqual({ kind: "poll" });
    expect(classifyAiPostFailure(err(429, "AI_DAILY_LIMIT_EXCEEDED"))).toEqual({
      kind: "limit",
      message: "m-AI_DAILY_LIMIT_EXCEEDED",
    });
    expect(
      classifyAiPostFailure(err(502, "AI_GENERATION_FAILED", { reason: "invalid_json" })),
    ).toEqual({ kind: "failed", reason: "invalid_json" });
    expect(classifyAiPostFailure(err(502, "AI_GENERATION_FAILED"))).toEqual({
      kind: "failed",
      reason: null,
    });
    expect(classifyAiPostFailure(err(404, "RESULT_NOT_FOUND"))).toEqual({
      kind: "notFound",
      message: "m-RESULT_NOT_FOUND",
    });
  });

  it("通信断（status 0）・関数の打ち切り（504）・500 は GET で状態を確認する", () => {
    expect(classifyAiPostFailure(err(0, "NETWORK_ERROR"))).toEqual({ kind: "check" });
    expect(classifyAiPostFailure(err(504, "INTERNAL_ERROR"))).toEqual({ kind: "check" });
    expect(classifyAiPostFailure(err(500, "INTERNAL_ERROR"))).toEqual({ kind: "check" });
  });

  it("その他の 4xx は通知", () => {
    expect(classifyAiPostFailure(err(422, "VALIDATION_ERROR"))).toEqual({
      kind: "error",
      message: "m-VALIDATION_ERROR",
    });
  });

  it("ポーリングは 3 秒間隔・最大 10 分", () => {
    expect(AI_POLL_INTERVAL_MS).toBe(3000);
    expect(AI_POLL_MAX_MS).toBe(600_000);
    expect(pollingExpired(599_999)).toBe(false);
    expect(pollingExpired(600_000)).toBe(true);
  });
});

describe("requestAiAnalysis / fetchAiAnalysis", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POST・GET を …/ai-analysis に送る", async () => {
    const dto = { resultId: "r1", status: "completed", startedAt: null, error: null, latest: null };
    const calls: [string, string | undefined][] = [];
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      calls.push([input, init.method]);
      return new Response(JSON.stringify(dto), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestAiAnalysis("r1")).resolves.toEqual(dto);
    await expect(fetchAiAnalysis("r1")).resolves.toEqual(dto);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      ["/api/v1/admin/results/r1/ai-analysis", "POST"],
      ["/api/v1/admin/results/r1/ai-analysis", "GET"],
    ]);
  });
});
