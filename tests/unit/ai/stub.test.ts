// U-12（08 §3.2.2）: lib/ai/providers/stub.ts（07 §5.4、D07-24、11-6 §3.7.3。スタブの出力は採用向けと育成・定着。経年比較は
// PR-7.11b）。育成・定着の判定の決め方は 11-6 §3.7.3（8 項目と離職リスクの 4 項目の平均から。別表A の判定基準の離職リスクの
// (a)(b) と、サポートの必要度の (b)）
import { describe, expect, it } from "vitest";

import { AI_FAILURE_REASONS, AiProviderError } from "@/lib/ai/errors";
import {
  buildStubOutput,
  buildTrainingStubOutput,
  createStubProvider,
  STUB_DEFAULT_DELAY_MS,
  STUB_INVALID_JSON_NAME,
} from "@/lib/ai/providers/stub";
import { AiAnalysisOutputSchema, TrainingAiOutputSchema } from "@/lib/ai/schema";
import type { GenerateOptions, TrainingAiInput } from "@/lib/ai/types";
import type { TrainingContext } from "@/lib/masters/training-context";

import { longitudinalInput, t06Input, t06TrainingInput } from "./helpers";

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
    const a = await provider.generate("recruitment", t06Input(), options());
    const b = await provider.generate("recruitment", t06Input(), options());
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
    const result = await provider.generate("recruitment", t06Input(), {
      ...options(),
      model: "claude-sonnet-5",
    });
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
    await createStubProvider({ delayMs: 120 }).generate("recruitment", t06Input(), options());
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it.each(AI_FAILURE_REASONS)("failWith: %s の AiProviderError を投げる", async (reason) => {
    const error = await caught(
      createStubProvider({ delayMs: 0, failWith: reason }).generate(
        "recruitment",
        t06Input(),
        options(),
      ),
    );
    expect(error.reason).toBe(reason);
  });

  it("氏名が __INVALID_JSON__（trim 後）なら invalid_json", async () => {
    expect(STUB_INVALID_JSON_NAME).toBe("__INVALID_JSON__");
    const error = await caught(
      createStubProvider({ delayMs: 0 }).generate(
        "recruitment",
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
          createStubProvider({ delayMs: 0 }).generate(
            "recruitment",
            t06Input(),
            options(aborted.signal),
          ),
        )
      ).reason,
    ).toBe("timeout");

    const controller = new AbortController();
    const pending = createStubProvider({ delayMs: 10_000 }).generate(
      "recruitment",
      t06Input(),
      options(controller.signal),
    );
    controller.abort();
    const error = await caught(pending);
    expect(error.reason).toBe("timeout");
    expect(error.retryable).toBe(true);
  });

  it("経年比較（スタブの出力は PR-7.11b）と種類の違う版は config_error", async () => {
    const stub = createStubProvider({ delayMs: 0 });
    expect((await caught(stub.generate("training", t06TrainingInput(), options()))).reason).toBe(
      "config_error",
    );
    expect(
      (
        await caught(
          stub.generate("recruitment", t06Input(), { ...options(), promptVersion: "training-v1" }),
        )
      ).reason,
    ).toBe("config_error");
    expect(
      (await caught(stub.generate("longitudinal", longitudinalInput(), options()))).reason,
    ).toBe("config_error");
    // failWith があっても、受け付けない種類・版は config_error のまま（failWith は生成の失敗だけを作る）
    const failing = createStubProvider({ delayMs: 0, failWith: "timeout" });
    expect(
      (await caught(failing.generate("longitudinal", longitudinalInput(), options()))).reason,
    ).toBe("config_error");
  });

  it("未知のプロンプト版は config_error", async () => {
    const error = await caught(
      createStubProvider({ delayMs: 0 }).generate("recruitment", t06Input(), {
        ...options(),
        promptVersion: "unknown",
      }),
    );
    expect(error.reason).toBe("config_error");
  });
});

/** 現場のサインが 1 つも無い 8 項目（離職リスクは (a) の平均のまま） */
const NO_SIGNS: TrainingContext = {
  tenure: "year_2",
  evaluation: "meets",
  expectedRole: "trainer",
  recentState: "stable",
  relationship: "good",
  wish: "skill_up",
  changeSinceJoining: "growing",
  concern: "none",
};

/** 離職リスクの 4 項目をすべて value にし、8 項目を context にした入力 */
function trainingInputWith(value: number, context: Partial<TrainingContext> = {}): TrainingAiInput {
  const base = t06TrainingInput();
  return {
    ...base,
    result: {
      ...base.result,
      risks: {
        ...base.result.risks,
        low_motivation: value,
        resignation_trouble: value,
        mental_distress: value,
        communication_issue: value,
      },
    },
    context: { ...NO_SIGNS, ...context },
  };
}

const trainingOptions = (signal: AbortSignal = new AbortController().signal): GenerateOptions => ({
  model: "claude-opus-5",
  promptVersion: "training-v1",
  signal,
});

describe("育成・定着のスタブ（11-6 §3.7.3）", () => {
  it("決まった出力を返し（同じ入力で同じ出力）、育成・定着のスキーマを通る。結果の形は採用向けと同じ", async () => {
    const provider = createStubProvider({ delayMs: 0 });
    const a = await provider.generate("training", t06TrainingInput(), trainingOptions());
    const b = await provider.generate("training", t06TrainingInput(), trainingOptions());
    expect(a).toEqual(b);
    expect(TrainingAiOutputSchema.safeParse(a.output).success).toBe(true);
    expect(a.output).toEqual(buildTrainingStubOutput(t06TrainingInput()));
    expect(a.rawText).toBe(JSON.stringify(a.output));
    expect(a).toMatchObject({
      model: "claude-opus-5",
      promptVersion: "training-v1",
      analysisKind: "training",
      usage: null,
      stopReason: "end_turn",
      requestId: null,
    });
  });

  it("出力に氏名が入らない（氏名を変えても判定と文は同じ）", () => {
    const output = buildTrainingStubOutput(t06TrainingInput());
    expect(JSON.stringify(output)).not.toContain("山田");
    const renamed = buildTrainingStubOutput({
      ...t06TrainingInput(),
      respondentName: "テストテスト 01",
    });
    expect(renamed).toEqual(output);
    expect(JSON.stringify(renamed)).not.toContain("テストテスト");
  });

  it("表示の条件（11-6 §2.5.5）を確かめられる値: 原因は 高・中・診断外、ステップと日常の接し方に空と空でない値、1on1 は 3 つ。一手の札は表示の条件が無い（空でも文字の無い札を描く）ので、どれも空にしない（別表A の「今週」「聞き方」）", () => {
    const output = buildTrainingStubOutput(t06TrainingInput());
    expect(output.urgent.hypotheses.map((h) => h.level)).toEqual(["高", "中", "診断外"]);
    expect(output.urgent.actions.map((a) => a.label)).toEqual(["今週", "聞き方"]);
    expect(
      output.role.steps.map((st) => [st.target === "", st.say === "", st.note === ""]),
    ).toEqual([
      [false, false, false],
      [true, true, true],
    ]);
    expect(output.daily.map((d) => d.say === "")).toEqual([false, true]);
    expect(output.oneonone).toHaveLength(3);
    expect(output.role.cond).not.toBe("");
    expect(output.role.have.length).toBeGreaterThan(0);
    expect(output.role.lack.length).toBeGreaterThan(0);
  });

  it("離職リスク (a): 4 項目の平均の境目（24.9・25・41.9・42・59.9・60・74.9・75）。サインが無ければ (a) のまま", () => {
    const cases: [number, string][] = [
      [24.9, "非常に低い"],
      [25, "低い"],
      [41.9, "低い"],
      [42, "中"],
      [59.9, "中"],
      [60, "高い"],
      [74.9, "高い"],
      [75, "非常に高い"],
    ];
    for (const [value, risk] of cases) {
      expect(buildTrainingStubOutput(trainingInputWith(value)).verdict.risk, String(value)).toBe(
        risk,
      );
    }
    // 負の値は 0 にしてから平均する: (0 + 55 + 25 + 25) / 4 = 26.25 → 低い（負のまま平均すると 21.25 で非常に低い）
    const negative = trainingInputWith(25);
    const withNegative: TrainingAiInput = {
      ...negative,
      result: {
        ...negative.result,
        risks: { ...negative.result.risks, low_motivation: -20, resignation_trouble: 55 },
      },
    };
    expect(buildTrainingStubOutput(withNegative).verdict.risk).toBe("低い");
  });

  it("離職リスク (b): 4 つのサインのそれぞれのコードが 1 つと数える。1 つで (a) を 1 段上げ、2 つで高い、3 つ以上で非常に高い（高い方を採る）", () => {
    const one: [string, Partial<TrainingContext>][] = [
      ["low_energy", { recentState: "low_energy" }],
      ["complaining", { recentState: "complaining" }],
      ["less_proactive", { changeSinceJoining: "less_proactive" }],
      ["few_reports", { concern: "few_reports" }],
      ["late_absent", { concern: "late_absent" }],
      ["specific_mismatch", { relationship: "specific_mismatch" }],
      ["isolated", { relationship: "isolated" }],
    ];
    for (const [label, context] of one) {
      // (a) 中 → 1 つで 1 段上げて高い
      expect(buildTrainingStubOutput(trainingInputWith(50, context)).verdict.risk, label).toBe(
        "高い",
      );
    }
    // サインにならないコード（同じ項目のほかの値）は数えない
    const notSigns: Partial<TrainingContext>[] = [
      { recentState: "motivated" },
      { changeSinceJoining: "unchanged" },
      { concern: "many_mistakes" },
      { concern: "stalled" },
      { relationship: "unknown" },
    ];
    for (const context of notSigns) {
      expect(
        buildTrainingStubOutput(trainingInputWith(50, context)).verdict.risk,
        JSON.stringify(context),
      ).toBe("中");
    }
    // 1 つ: 非常に低い → 低い、非常に高いは非常に高いで止まる
    expect(buildTrainingStubOutput(trainingInputWith(10, one[0]![1])).verdict.risk).toBe("低い");
    expect(buildTrainingStubOutput(trainingInputWith(90, one[0]![1])).verdict.risk).toBe(
      "非常に高い",
    );
    // 2 つ: 高い（(a) が非常に高いなら高い方の非常に高い）
    const two = { recentState: "low_energy", concern: "late_absent" };
    expect(buildTrainingStubOutput(trainingInputWith(10, two)).verdict.risk).toBe("高い");
    expect(buildTrainingStubOutput(trainingInputWith(90, two)).verdict.risk).toBe("非常に高い");
    // 3 つ・4 つ: 非常に高い
    const three = { ...two, relationship: "isolated" };
    const four = { ...three, changeSinceJoining: "less_proactive" };
    expect(buildTrainingStubOutput(trainingInputWith(10, three)).verdict.risk).toBe("非常に高い");
    expect(buildTrainingStubOutput(trainingInputWith(10, four)).verdict.risk).toBe("非常に高い");
    // 0 つ: (a) のまま
    expect(buildTrainingStubOutput(trainingInputWith(10)).verdict.risk).toBe("非常に低い");
  });

  it("期待役割へのマッチ度は現在の評価から、サポートの必要度はマッチ度との差から決める", () => {
    const cases: [string, string, string][] = [
      ["above", "高い", "非常に低い"],
      ["meets", "中", "低い"],
      ["growing", "低い", "中"],
      ["issues", "非常に低い", "中"],
    ];
    for (const [evaluation, match, support] of cases) {
      const { verdict } = buildTrainingStubOutput(trainingInputWith(30, { evaluation }));
      expect([verdict.match, verdict.support], evaluation).toEqual([match, support]);
    }
  });

  it("氏名が __INVALID_JSON__（trim 後）なら invalid_json。failWith は失敗、delayMs は遅れ", async () => {
    const invalid = await caught(
      createStubProvider({ delayMs: 0 }).generate(
        "training",
        { ...t06TrainingInput(), respondentName: " __INVALID_JSON__ " },
        trainingOptions(),
      ),
    );
    expect(invalid.reason).toBe("invalid_json");
    const failed = await caught(
      createStubProvider({ delayMs: 0, failWith: "rate_limited" }).generate(
        "training",
        t06TrainingInput(),
        trainingOptions(),
      ),
    );
    expect(failed.reason).toBe("rate_limited");
    expect(failed.retryable).toBe(true);
    const started = Date.now();
    await createStubProvider({ delayMs: 120 }).generate(
      "training",
      t06TrainingInput(),
      trainingOptions(),
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });
});
