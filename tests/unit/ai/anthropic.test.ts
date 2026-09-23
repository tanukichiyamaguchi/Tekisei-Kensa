// U-16（08 §3.2.2）: lib/ai/providers/anthropic.ts。SDK の fetch をモックする（07 §4.2、§4.6、§5.3）
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { type AiFailureReason, AiProviderError } from "@/lib/ai/errors";
import { buildMessages } from "@/lib/ai/prompt-builder";
import {
  ANTHROPIC_MAX_TOKENS,
  createAnthropicProvider,
  toAiProviderError,
} from "@/lib/ai/providers/anthropic";
import type { GenerateOptions } from "@/lib/ai/types";

import { t06Input, validOutput } from "./helpers";

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Headers;
}

type Handler = (captured: Captured, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const captured: Captured = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    };
    calls.push(captured);
    return handler(captured, init ?? {});
  };
  return { fetch: fn as typeof fetch, calls };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "request-id": "req_test_123",
      // SDK の自動再試行を止める（再試行の待ち時間をテストに持ち込まない）
      "x-should-retry": "false",
      ...headers,
    },
  });
}

function messageBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-20260601",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: JSON.stringify(validOutput()) },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 812,
      output_tokens: 2345,
      cache_read_input_tokens: 6000,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

function errorBody(type: string) {
  return { type: "error", error: { type, message: "テスト用のエラー" } };
}

const options = (signal: AbortSignal = new AbortController().signal): GenerateOptions => ({
  model: "claude-opus-5",
  promptVersion: "recruitment-v1",
  signal,
});

async function failure(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    return error as AiProviderError;
  }
  throw new Error("例外が投げられませんでした");
}

describe("U-16 Anthropic provider: 成功", () => {
  it("構造化出力の応答から AiGenerateResult を組み立てる", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(200, messageBody()));
    const provider = createAnthropicProvider({ apiKey: "sk-test-dummy", fetch });
    const result = await provider.generate(t06Input(), options());

    expect(provider.name).toBe("anthropic");
    expect(result.output).toEqual(validOutput());
    expect(result.rawText).toBe(JSON.stringify(validOutput()));
    expect(result.model).toBe("claude-opus-5-20260601");
    expect(result.promptVersion).toBe("recruitment-v1");
    expect(result.analysisKind).toBe("recruitment");
    expect(result.usage).toEqual({
      inputTokens: 812,
      outputTokens: 2345,
      cacheReadInputTokens: 6000,
      cacheCreationInputTokens: 0,
    });
    expect(result.stopReason).toBe("end_turn");
    expect(result.requestId).toBe("req_test_123");
    expect(calls).toHaveLength(1);
  });

  it("text ブロックが複数なら結合し、cache_* が null なら 0", async () => {
    const json = JSON.stringify(validOutput());
    const { fetch } = mockFetch(() =>
      jsonResponse(
        200,
        messageBody({
          content: [
            { type: "text", text: json.slice(0, 10) },
            { type: "text", text: json.slice(10) },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            cache_read_input_tokens: null,
            cache_creation_input_tokens: null,
          },
        }),
      ),
    );
    const result = await createAnthropicProvider({ apiKey: "k", fetch }).generate(
      t06Input(),
      options(),
    );
    expect(result.rawText).toBe(json);
    expect(result.usage?.cacheReadInputTokens).toBe(0);
    expect(result.usage?.cacheCreationInputTokens).toBe(0);
  });

  it("リクエスト: 07 §4.2 のパラメータ。temperature 等を送らず、system に cache_control が付く", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(200, messageBody()));
    await createAnthropicProvider({ apiKey: "sk-test-dummy", fetch }).generate(
      t06Input(),
      options(),
    );
    const call = calls[0]!;
    expect(call.url).toMatch(/\/v1\/messages$/);
    expect(call.headers.get("x-api-key")).toBe("sk-test-dummy");
    const body = call.body;
    const expected = buildMessages(t06Input(), "recruitment-v1");

    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(ANTHROPIC_MAX_TOKENS);
    expect(body.max_tokens).toBe(16000);
    expect(body.thinking).toEqual({ type: "adaptive", display: "omitted" });
    const outputConfig = body.output_config as { effort: string; format: Record<string, unknown> };
    expect(outputConfig.effort).toBe("high");
    expect(outputConfig.format.type).toBe("json_schema");
    const schema = outputConfig.format.schema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties as object).sort()).toEqual(
      ["cautions", "questions", "retention", "strengths", "summary", "verdict"].sort(),
    );
    expect(body.system).toEqual([
      { type: "text", text: expected.system, cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toEqual([{ role: "user", content: expected.user }]);
    for (const key of ["temperature", "top_p", "top_k", "tools", "tool_choice", "stream"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(JSON.stringify(body)).not.toContain("budget_tokens");
  });
});

describe("U-16 Anthropic provider: 応答の検証（07 §3.4）", () => {
  const run = async (overrides: Record<string, unknown>) => {
    const { fetch } = mockFetch(() => jsonResponse(200, messageBody(overrides)));
    return failure(createAnthropicProvider({ apiKey: "k", fetch }).generate(t06Input(), options()));
  };

  it("stop_reason = refusal → refusal（本文の検証より先に判定）", async () => {
    const error = await run({ stop_reason: "refusal", content: [{ type: "text", text: "" }] });
    expect(error.reason).toBe("refusal");
    expect(error.retryable).toBe(false);
    expect(error.requestId).toBe("req_test_123");
  });

  it("stop_reason = max_tokens → truncated（途中で切れた JSON でも truncated）", async () => {
    const text = JSON.stringify(validOutput()).slice(0, 50);
    const error = await run({ stop_reason: "max_tokens", content: [{ type: "text", text }] });
    expect(error.reason).toBe("truncated");
  });

  it("スキーマ検証の失敗 → invalid_json（本文・氏名を例外に含めない）", async () => {
    const bad = { ...validOutput(), strengths: [] };
    const error = await run({ content: [{ type: "text", text: JSON.stringify(bad) }] });
    expect(error.reason).toBe("invalid_json");
    expect(error.message).not.toContain("山田");
    const empty = await run({ content: [] });
    expect(empty.reason).toBe("invalid_json");
  });
});

describe("U-16 Anthropic provider: SDK 例外の分類（07 §4.6 の表）", () => {
  const cases: [number, string, AiFailureReason, boolean][] = [
    [429, "rate_limit_error", "rate_limited", true],
    [401, "authentication_error", "auth_error", false],
    [403, "permission_error", "auth_error", false],
    [402, "billing_error", "auth_error", false],
    [400, "invalid_request_error", "invalid_request", false],
    [404, "not_found_error", "invalid_request", false],
    [422, "invalid_request_error", "invalid_request", false],
    [500, "api_error", "provider_error", true],
    [529, "overloaded_error", "provider_error", true],
  ];

  it.each(cases)("HTTP %i（%s）→ %s（retryable: %s）", async (status, type, reason, retryable) => {
    const { fetch, calls } = mockFetch(() => jsonResponse(status, errorBody(type)));
    const error = await failure(
      createAnthropicProvider({ apiKey: "k", fetch }).generate(t06Input(), options()),
    );
    expect(error.reason).toBe(reason);
    expect(error.retryable).toBe(retryable);
    expect(error.requestId).toBe("req_test_123");
    expect(error.message).not.toContain("山田");
    expect(calls).toHaveLength(1);
  });

  it("接続エラー → provider_error（SDK が 1 回だけ再試行する: maxRetries 1）", async () => {
    const { fetch, calls } = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const error = await failure(
      createAnthropicProvider({ apiKey: "k", fetch }).generate(t06Input(), options()),
    );
    expect(error.reason).toBe("provider_error");
    expect(error.retryable).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("生成中の AbortSignal 発火 → timeout", async () => {
    const controller = new AbortController();
    const { fetch } = mockFetch(
      (_captured, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
          setTimeout(() => controller.abort(), 10);
        }),
    );
    const error = await failure(
      createAnthropicProvider({ apiKey: "k", fetch }).generate(
        t06Input(),
        options(controller.signal),
      ),
    );
    expect(error.reason).toBe("timeout");
    expect(error.retryable).toBe(true);
  });

  it("toAiProviderError: タイムアウト・中断・その他", () => {
    expect(toAiProviderError(new Anthropic.APIConnectionTimeoutError()).reason).toBe("timeout");
    expect(
      toAiProviderError(new Anthropic.APIConnectionError({ message: "Request timed out." })).reason,
    ).toBe("timeout");
    expect(
      toAiProviderError(new Anthropic.APIConnectionError({ message: "Connection error." })).reason,
    ).toBe("provider_error");
    expect(toAiProviderError(new Anthropic.APIUserAbortError()).reason).toBe("timeout");
    expect(toAiProviderError(new DOMException("aborted", "AbortError")).reason).toBe("timeout");
    const passthrough = new AiProviderError("config_error", "x");
    expect(toAiProviderError(passthrough)).toBe(passthrough);
    const other = toAiProviderError(new Error("山田 太郎"));
    expect(other.reason).toBe("provider_error");
    expect(other.message).not.toContain("山田");
  });
});
