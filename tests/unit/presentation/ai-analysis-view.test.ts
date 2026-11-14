// AI 解説の生成の要求の失敗の分け方（M7-ai-22。11-6 §2.3.4・§3.7.10）・読み直しの間隔（11-6 §2.3.5）。失敗の理由の文（X-12。06 §11）は
// 文言と一緒に ai-texts.ts へ移したので ai-texts.test.ts で確かめる
import { describe, expect, it } from "vitest";

import {
  AI_POLL_INTERVAL_MS,
  AI_POLL_MAX_MS,
  classifyAiPostFailure,
  pollingExpired,
} from "@/lib/presentation/ai-analysis-view";

describe("M7-ai-22 classifyAiPostFailure（11-6 §2.3.4 の生成の要求の失敗ごとの扱い）", () => {
  const err = (status: number, code: string, details: Record<string, unknown> = {}) => ({
    status,
    code,
    message: `m-${code}`,
    details,
  });

  it("日次上限は無くなった（K-25）: 429 AI_DAILY_LIMIT_EXCEEDED は分類が無く、ほかの 4xx と同じ通知", () => {
    expect(classifyAiPostFailure(err(429, "AI_DAILY_LIMIT_EXCEEDED"))).toEqual({
      kind: "error",
      message: "m-AI_DAILY_LIMIT_EXCEEDED",
    });
  });

  it("409 AI_NOT_APPLICABLE（責任者の受験）と 503 AI_KIND_DISABLED（有効でない種類）は、応答の文を通知に出す（GET で確かめない）", () => {
    expect(classifyAiPostFailure(err(409, "AI_NOT_APPLICABLE"))).toEqual({
      kind: "error",
      message: "m-AI_NOT_APPLICABLE",
    });
    expect(classifyAiPostFailure(err(503, "AI_KIND_DISABLED"))).toEqual({
      kind: "error",
      message: "m-AI_KIND_DISABLED",
    });
  });

  it("経年比較の 409（LONGITUDINAL_PREVIOUS_REQUIRED・LONGITUDINAL_PAIR_CHANGED・LONGITUDINAL_ORDER_INVALID）も、応答の文を通知に出す", () => {
    for (const code of [
      "LONGITUDINAL_PREVIOUS_REQUIRED",
      "LONGITUDINAL_PAIR_CHANGED",
      "LONGITUDINAL_ORDER_INVALID",
    ]) {
      expect(classifyAiPostFailure(err(409, code)), code).toEqual({
        kind: "error",
        message: `m-${code}`,
      });
    }
  });

  it("409 AI_ALREADY_GENERATING → 読み直し、502 → failed（理由コード）、404 → 通知（今のまま）", () => {
    expect(classifyAiPostFailure(err(409, "AI_ALREADY_GENERATING"))).toEqual({ kind: "poll" });
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

  it("通信断（status 0）・関数の打ち切り（504）・500・AI_KIND_DISABLED でない 503 は GET で状態を確認する", () => {
    expect(classifyAiPostFailure(err(0, "NETWORK_ERROR"))).toEqual({ kind: "check" });
    expect(classifyAiPostFailure(err(504, "INTERNAL_ERROR"))).toEqual({ kind: "check" });
    expect(classifyAiPostFailure(err(500, "INTERNAL_ERROR"))).toEqual({ kind: "check" });
    expect(classifyAiPostFailure(err(503, "SERVICE_UNAVAILABLE"))).toEqual({ kind: "check" });
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
