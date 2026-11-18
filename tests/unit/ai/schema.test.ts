// U-10（08 §3.2.2）: lib/ai/schema.ts の AiAnalysisOutputSchema と parseAiOutputText()（07 §3.2、§3.4、D07-07）。
// 種類ごとのスキーマの表 AI_OUTPUT_SCHEMAS と、保存した出力の確かめ parseStoredAiOutput()（11-6 §3.7.3。PR-7.9 は採用向けだけ）
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import { buildStubOutput } from "@/lib/ai/providers/stub";
import {
  AI_OUTPUT_SCHEMAS,
  AiAnalysisOutputSchema,
  LEVER_LABELS,
  parseAiOutputText,
  parseStoredAiOutput,
} from "@/lib/ai/schema";

import { t06Input, validOutput } from "./helpers";

type Mutable = Record<string, unknown> & {
  verdict: Record<string, unknown>;
  strengths: unknown[];
  cautions: unknown[];
  questions: Record<string, unknown>[];
  retention: Record<string, unknown> & { levers: Record<string, unknown>[] };
};

function sample(): Mutable {
  return structuredClone(validOutput()) as unknown as Mutable;
}

const accepts = (value: unknown) =>
  expect(AiAnalysisOutputSchema.safeParse(value).success).toBe(true);
const rejects = (value: unknown) =>
  expect(AiAnalysisOutputSchema.safeParse(value).success).toBe(false);

function expectInvalidJson(text: string) {
  let caught: unknown;
  try {
    parseAiOutputText("recruitment", text);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AiProviderError);
  const error = caught as AiProviderError;
  expect(error.reason).toBe("invalid_json");
  expect(error.retryable).toBe(false);
  // 入力テキスト（氏名を含み得る）を例外メッセージに含めない（07 §4.8）
  expect(error.message).not.toContain("山田");
  expect(error.message).not.toContain("潤滑油");
}

describe("U-10 AiAnalysisOutputSchema", () => {
  it("(1) 付録D §2 の形の出力と stub の出力が通る", () => {
    accepts(validOutput());
    accepts(buildStubOutput(t06Input()));
  });

  it("(2) verdict 3 種の enum 外の値を拒否する", () => {
    for (const key of ["sokusenryoku", "teichaku_risk", "sougou"]) {
      const v = sample();
      v.verdict[key] = "普通";
      rejects(v);
    }
  });

  it("(2) summary が空文字・空白のみなら拒否する", () => {
    for (const summary of ["", "   \n "]) {
      const v = sample();
      v.summary = summary;
      rejects(v);
    }
  });

  it("(2) strengths / cautions / questions が 0 件なら拒否する", () => {
    for (const key of ["strengths", "cautions", "questions"] as const) {
      const v = sample();
      v[key] = [];
      rejects(v);
    }
  });

  it("(2) levers は 4 件・この順・正しい label でなければ拒否する", () => {
    const three = sample();
    three.retention.levers = three.retention.levers.slice(0, 3);
    rejects(three);

    const five = sample();
    five.retention.levers = [...five.retention.levers, { label: "関わり方", text: "x" }];
    rejects(five);

    const swapped = sample();
    const [a, b, ...rest] = swapped.retention.levers;
    swapped.retention.levers = [b!, a!, ...rest];
    rejects(swapped);

    const badLabel = sample();
    badLabel.retention.levers[0]!.label = "接し方";
    rejects(badLabel);

    expect(LEVER_LABELS).toEqual(["関わり方", "任せ方", "認め方", "伸ばし方"]);
  });

  it("(2) 余分なキーをトップレベル・verdict・questions[]・levers[] のいずれでも拒否する（.strict()）", () => {
    const top = sample();
    top.extra = 1;
    rejects(top);

    const verdict = sample();
    verdict.verdict.extra = "x";
    rejects(verdict);

    const question = sample();
    question.questions[0]!.extra = "x";
    rejects(question);

    const lever = sample();
    lever.retention.levers[0]!.extra = "x";
    rejects(lever);

    const retention = sample();
    retention.retention.extra = "x";
    rejects(retention);
  });

  it("(3) 付録D の個数指定より緩い上限まで受け入れ、それを超えると拒否する（07 D07-07）", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => `項目${i + 1}`);
    const questions = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ q: `質問${i + 1}`, intent: `意図${i + 1}` }));

    for (const n of [5, 6]) {
      const v = sample();
      v.strengths = items(n);
      accepts(v);
    }
    const cautions6 = sample();
    cautions6.cautions = items(6);
    accepts(cautions6);
    const q8 = sample();
    q8.questions = questions(8);
    accepts(q8);

    const strengths7 = sample();
    strengths7.strengths = items(7);
    rejects(strengths7);
    const cautions7 = sample();
    cautions7.cautions = items(7);
    rejects(cautions7);
    const q9 = sample();
    q9.questions = questions(9);
    rejects(q9);
  });
});

describe("U-10 parseAiOutputText", () => {
  const json = JSON.stringify(validOutput());

  it("前後の空白を除いた純粋な JSON を受理する", () => {
    expect(parseAiOutputText("recruitment", `\n  ${json}  \n`)).toEqual(validOutput());
  });

  it("スキーマの無い種類（育成・定着・経年比較。PR-7.10・PR-7.11b で足す）は config_error", () => {
    for (const kind of ["training", "longitudinal"] as const) {
      let caught: unknown;
      try {
        parseAiOutputText(kind, json);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AiProviderError);
      expect((caught as AiProviderError).reason).toBe("config_error");
    }
  });

  it("(4) コードフェンス・前置き・後置き・構文不正・スキーマ不一致を invalid_json で拒否し、本文を例外に含めない", () => {
    expectInvalidJson(`\`\`\`json\n${json}\n\`\`\``);
    expectInvalidJson(`以下が結果です。${json}`);
    expectInvalidJson(`${json}\n以上です。`);
    expectInvalidJson(json.slice(0, -2) + "}");
    expectInvalidJson(`{"summary": "山田 太郎さんは潤滑油", }`);
    expectInvalidJson(JSON.stringify({ ...validOutput(), summary: "", extra: "山田" }));
  });

  it("(5) スキーマの定義は 1 箇所で、provider と parseAiOutputText が同じ種類ごとの表を参照する", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    expect(AI_OUTPUT_SCHEMAS).toEqual({ recruitment: AiAnalysisOutputSchema });
    const anthropic = read("lib/ai/providers/anthropic.ts");
    expect(anthropic).toContain("const schema = AI_OUTPUT_SCHEMAS[kind];");
    expect(anthropic).toContain("zodOutputFormat(schema)");
    const schema = read("lib/ai/schema.ts");
    expect(schema).toContain("recruitment: AiAnalysisOutputSchema,");
    expect(schema.split("const schema = AI_OUTPUT_SCHEMAS[kind];").length - 1).toBe(2);
    expect(schema).toContain("schema.safeParse(json)");
    expect(schema).toContain("schema.safeParse(output)");
    // lib/ai の他のファイルで z.object による出力スキーマを再定義していない
    for (const file of ["lib/ai/providers/anthropic.ts", "lib/ai/providers/stub.ts"]) {
      expect(read(file)).not.toMatch(/z\.object\(/);
    }
  });
});

describe("parseStoredAiOutput（11-6 §2.3.4・§3.7.3）", () => {
  it("採用向けの正しい出力は値を返し、stub の出力も通る", () => {
    expect(parseStoredAiOutput("recruitment", validOutput())).toEqual(validOutput());
    const stub = buildStubOutput(t06Input());
    expect(parseStoredAiOutput("recruitment", stub)).toEqual(stub);
  });

  it("欠け・余分なキー・上限を超える配列・形の違う値は null（例外を投げない）", () => {
    const missing = sample();
    delete (missing as Record<string, unknown>).summary;
    const extra = sample();
    extra.extra = "x";
    const tooMany = sample();
    tooMany.strengths = Array.from({ length: 7 }, (_, i) => `項目${i + 1}`);
    const badLevers = sample();
    badLevers.retention.levers = badLevers.retention.levers.slice(0, 1);
    for (const value of [missing, extra, tooMany, badLevers, null, undefined, "text", 1, []]) {
      expect(parseStoredAiOutput("recruitment", value)).toBeNull();
    }
  });

  it("スキーマの無い種類（育成・定着・経年比較）は、何を渡しても null", () => {
    for (const kind of ["training", "longitudinal"] as const) {
      for (const value of [validOutput(), {}, null]) {
        expect(parseStoredAiOutput(kind, value)).toBeNull();
      }
    }
  });
});
