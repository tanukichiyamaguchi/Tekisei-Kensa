// U-13（08 §3.2.2）: lib/ai/provider.ts（07 §5.2、§4.6、04 §7.1、D04-38）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import { getAiProvider, setAiProviderForTest } from "@/lib/ai/provider";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createStubProvider } from "@/lib/ai/providers/stub";
import { resetEnvCacheForTest } from "@/lib/utils/env";

import { t06Input } from "./helpers";

const BASE_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-tekisei",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  AI_MODEL: "claude-opus-5",
  AI_PROMPT_VERSION: "recruitment-v1",
  PDF_TOKEN_SECRET: "x".repeat(32),
  ANTHROPIC_API_KEY: "",
  VERCEL: "",
  VERCEL_ENV: "",
} as const;

function useEnv(extra: Record<string, string>) {
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...extra })) vi.stubEnv(key, value);
  resetEnvCacheForTest();
}

beforeEach(() => setAiProviderForTest(null));
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTest();
  setAiProviderForTest(null);
});

describe("U-13 getAiProvider", () => {
  it("AI_PROVIDER=stub で stub を返し、キャッシュする", () => {
    useEnv({ AI_PROVIDER: "stub" });
    const provider = getAiProvider();
    expect(provider.name).toBe("stub");
    expect(getAiProvider()).toBe(provider);
  });

  it("AI_PROVIDER=anthropic で anthropic を返す", () => {
    useEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test-dummy" });
    expect(getAiProvider().name).toBe("anthropic");
  });

  it("AI_PROVIDER=anthropic で ANTHROPIC_API_KEY が無ければ失敗する（起動時検証または config_error）", () => {
    useEnv({ AI_PROVIDER: "anthropic" });
    // 起動時検証（01 §4.3）が先に EnvError で止める。検証をすり抜けても provider.ts が config_error を投げる
    expect(() => getAiProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("setAiProviderForTest で差し替え、null で解除できる", () => {
    useEnv({ AI_PROVIDER: "stub" });
    const custom = createStubProvider({ delayMs: 0, failWith: "timeout" });
    setAiProviderForTest(custom);
    expect(getAiProvider()).toBe(custom);
    setAiProviderForTest(null);
    const fresh = getAiProvider();
    expect(fresh).not.toBe(custom);
    expect(fresh.name).toBe("stub");
  });
});

describe("U-13 中断済みの signal", () => {
  const aborted = () => {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  };

  it.each([
    ["stub", () => createStubProvider({ delayMs: 0 })],
    [
      "anthropic",
      () =>
        createAnthropicProvider({
          apiKey: "sk-test-dummy",
          fetch: () => Promise.reject(new Error("fetch は呼ばれないはず")),
        }),
    ],
  ])("%s は即座に AiProviderError(timeout) で失敗する", async (_name, create) => {
    const started = Date.now();
    let caught: unknown;
    try {
      await create().generate(t06Input(), {
        model: "claude-opus-5",
        promptVersion: "recruitment-v1",
        signal: aborted(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiProviderError);
    expect((caught as AiProviderError).reason).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(100);
  });
});
