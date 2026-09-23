// U-12（08 §3.2.2）: lib/ai/providers/stub.ts（07 §5.4、D07-24）
import { describe, expect, it } from "vitest";

import { AI_FAILURE_REASONS, AiProviderError } from "@/lib/ai/errors";
import {
  buildStubOutput,
  createStubProvider,
  STUB_DEFAULT_DELAY_MS,
  STUB_INVALID_JSON_NAME,
} from "@/lib/ai/providers/stub";
import { AiAnalysisOutputSchema } from "@/lib/ai/schema";
import type { GenerateOptions } from "@/lib/ai/types";

import { t06Input } from "./helpers";

const options = (signal: AbortSignal = new AbortController().signal): GenerateOptions => ({
  model: "claude-opus-5",
  promptVersion: "recruitment-v1",
  signal,
});

async function caught(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    return error as AiProviderError;
  }
  throw new Error("例外が投げられませんでした");
}

describe("U-12 stub provider", () => {
  it("決定的な出力を返し、U-10 のスキーマを通る", async () => {
    const provider = createStubProvider({ delayMs: 0 });
    const a = await provider.generate(t06Input(), options());
    const b = await provider.generate(t06Input(), options());
    expect(a).toEqual(b);
    expect(AiAnalysisOutputSchema.safeParse(a.output).success).toBe(true);
    expect(provider.name).toBe("stub");
  });

  it("summary の冒頭に氏名、cautions の 1 件目にリスクの最大項目名と値", () => {
    const output = buildStubOutput(t06Input());
    expect(output.summary.startsWith("山田 太郎")).toBe(true);
    // T-06 のリスク最大は不注意ミス 57.5（07 §2.4）
    expect(output.cautions[0]).toContain("不注意ミス");
    expect(output.cautions[0]).toContain("57.5");
    expect(output.verdict.sougou).toBe("要検討");
    // 離職リスク 4 項目の平均 = (42.5 + 42.5 + 30 + 52.5) / 4 = 41.875 → 「低い」（25〜41 は低い、42〜59 は中）
    expect(output.verdict.teichaku_risk).toBe("低い");
  });

  it("rawText は出力の JSON.stringify、model は options.model、usage は null、stopReason は end_turn", async () => {
    const provider = createStubProvider({ delayMs: 0 });
    const result = await provider.generate(t06Input(), { ...options(), model: "claude-sonnet-5" });
    expect(result.rawText).toBe(JSON.stringify(result.output));
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.usage).toBeNull();
    expect(result.stopReason).toBe("end_turn");
    expect(result.requestId).toBeNull();
    expect(result.promptVersion).toBe("recruitment-v1");
    expect(result.analysisKind).toBe("recruitment");
  });

  it("delayMs で遅延が変わる（既定 500 ms）", async () => {
    expect(STUB_DEFAULT_DELAY_MS).toBe(500);
    const started = Date.now();
    await createStubProvider({ delayMs: 120 }).generate(t06Input(), options());
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it.each(AI_FAILURE_REASONS)("failWith: %s の AiProviderError を投げる", async (reason) => {
    const error = await caught(
      createStubProvider({ delayMs: 0, failWith: reason }).generate(t06Input(), options()),
    );
    expect(error.reason).toBe(reason);
  });

  it("氏名が __INVALID_JSON__（trim 後）なら invalid_json", async () => {
    expect(STUB_INVALID_JSON_NAME).toBe("__INVALID_JSON__");
    const error = await caught(
      createStubProvider({ delayMs: 0 }).generate(
        t06Input({ respondentName: "  __INVALID_JSON__ " }),
        options(),
      ),
    );
    expect(error.reason).toBe("invalid_json");
  });

  it("中断済みの signal、または遅延中の中断は timeout", async () => {
    const aborted = new AbortController();
    aborted.abort();
    expect(
      (
        await caught(
          createStubProvider({ delayMs: 0 }).generate(t06Input(), options(aborted.signal)),
        )
      ).reason,
    ).toBe("timeout");

    const controller = new AbortController();
    const pending = createStubProvider({ delayMs: 10_000 }).generate(
      t06Input(),
      options(controller.signal),
    );
    controller.abort();
    const error = await caught(pending);
    expect(error.reason).toBe("timeout");
    expect(error.retryable).toBe(true);
  });

  it("未知のプロンプト版は config_error", async () => {
    const error = await caught(
      createStubProvider({ delayMs: 0 }).generate(t06Input(), {
        ...options(),
        promptVersion: "unknown",
      }),
    );
    expect(error.reason).toBe("config_error");
  });
});
