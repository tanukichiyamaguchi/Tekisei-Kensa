// U-10（08 §3.2.2）: lib/ai/schema.ts の AiAnalysisOutputSchema と parseAiOutputText()（07 §3.2、§3.4、D07-07）。
// 種類ごとのスキーマの表 AI_OUTPUT_SCHEMAS と、保存した出力の確かめ parseStoredAiOutput()（11-6 §3.7.3。採用向けと育成・定着）。
// M7-ai-17（11-6 §5.1）の育成・定着の分: TrainingAiOutputSchema（11-6 §2.8.2）
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import { buildStubOutput, buildTrainingStubOutput } from "@/lib/ai/providers/stub";
import {
  AI_OUTPUT_SCHEMAS,
  AiAnalysisOutputSchema,
  HYPOTHESIS_LEVELS,
  LEVER_LABELS,
  parseAiOutputText,
  parseStoredAiOutput,
  TrainingAiOutputSchema,
} from "@/lib/ai/schema";

import { t06Input, t06TrainingInput, validOutput, validTrainingOutput } from "./helpers";

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

  it("育成・定着は育成・定着のスキーマで読み、採用向けの形の JSON は invalid_json", () => {
    const training = JSON.stringify(validTrainingOutput());
    expect(parseAiOutputText("training", ` ${training}\n`)).toEqual(validTrainingOutput());
    let caught: unknown;
    try {
      parseAiOutputText("training", json);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiProviderError);
    expect((caught as AiProviderError).reason).toBe("invalid_json");
  });

  it("スキーマの無い種類（経年比較。PR-7.11b で足す）は config_error", () => {
    let caught: unknown;
    try {
      parseAiOutputText("longitudinal", json);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiProviderError);
    expect((caught as AiProviderError).reason).toBe("config_error");
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
    expect(Object.keys(AI_OUTPUT_SCHEMAS).sort()).toEqual(["recruitment", "training"]);
    expect(AI_OUTPUT_SCHEMAS.recruitment).toBe(AiAnalysisOutputSchema);
    expect(AI_OUTPUT_SCHEMAS.training).toBe(TrainingAiOutputSchema);
    const anthropic = read("lib/ai/providers/anthropic.ts");
    expect(anthropic).toContain("const schema = AI_OUTPUT_SCHEMAS[kind];");
    expect(anthropic).toContain("zodOutputFormat(schema)");
    const schema = read("lib/ai/schema.ts");
    expect(schema).toContain("recruitment: AiAnalysisOutputSchema,");
    expect(schema).toContain("training: TrainingAiOutputSchema,");
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

  it("育成・定着は育成・定着のスキーマで確かめる（正しい出力は値、採用向けの形・壊れた値は null）", () => {
    expect(parseStoredAiOutput("training", validTrainingOutput())).toEqual(validTrainingOutput());
    for (const value of [validOutput(), {}, null, "text"]) {
      expect(parseStoredAiOutput("training", value)).toBeNull();
    }
    // 採用向けのスキーマに育成・定着の出力を渡しても読めない
    expect(parseStoredAiOutput("recruitment", validTrainingOutput())).toBeNull();
  });

  it("スキーマの無い種類（経年比較）は、何を渡しても null", () => {
    for (const value of [validOutput(), validTrainingOutput(), {}, null]) {
      expect(parseStoredAiOutput("longitudinal", value)).toBeNull();
    }
  });
});

type TrainingMutable = {
  verdict: Record<string, unknown>;
  urgent: Record<string, unknown> & {
    hypotheses: Record<string, unknown>[];
    actions: Record<string, unknown>[];
  };
  role: Record<string, unknown> & {
    have: unknown[];
    lack: unknown[];
    steps: Record<string, unknown>[];
  };
  daily: Record<string, unknown>[];
  oneonone: Record<string, unknown>[];
} & Record<string, unknown>;

function trainingSample(): TrainingMutable {
  return structuredClone(validTrainingOutput()) as unknown as TrainingMutable;
}

const acceptsTraining = (value: unknown) =>
  expect(TrainingAiOutputSchema.safeParse(value).success).toBe(true);
const rejectsTraining = (value: unknown, label: string) =>
  expect(TrainingAiOutputSchema.safeParse(value).success, label).toBe(false);

describe("M7-ai-17 TrainingAiOutputSchema（11-6 §2.8.2）", () => {
  it("正しい例とスタブの出力を受け入れる。原因の確からしさは 高・中・診断外", () => {
    acceptsTraining(validTrainingOutput());
    acceptsTraining(buildTrainingStubOutput(t06TrainingInput()));
    expect(HYPOTHESIS_LEVELS).toEqual(["高", "中", "診断外"]);
    for (const level of HYPOTHESIS_LEVELS) {
      const v = trainingSample();
      v.urgent.hypotheses[0]!.level = level;
      acceptsTraining(v);
    }
    // 判定はどれも 5 段階のどの値も受け入れる
    for (const value of ["非常に高い", "高い", "中", "低い", "非常に低い"]) {
      for (const key of ["match", "risk", "support"]) {
        const v = trainingSample();
        v.verdict[key] = value;
        acceptsTraining(v);
      }
    }
  });

  it("各段の余分なキーを拒む（.strict()）", () => {
    const cases: [string, (v: TrainingMutable) => void][] = [
      ["トップ", (v) => (v.extra = 1)],
      ["verdict", (v) => (v.verdict.extra = "x")],
      ["urgent", (v) => (v.urgent.extra = "x")],
      ["hypotheses[]", (v) => (v.urgent.hypotheses[0]!.extra = "x")],
      ["actions[]", (v) => (v.urgent.actions[0]!.extra = "x")],
      ["role", (v) => (v.role.extra = "x")],
      ["steps[]", (v) => (v.role.steps[0]!.extra = "x")],
      ["daily[]", (v) => (v.daily[0]!.extra = "x")],
      ["oneonone[]", (v) => (v.oneonone[0]!.extra = "x")],
    ];
    for (const [label, mutate] of cases) {
      const v = trainingSample();
      mutate(v);
      rejectsTraining(v, label);
    }
  });

  it("列挙の外を拒む: level「低」、verdict の 5 段階の外（「やや高い」・空・採用向けの値）", () => {
    const low = trainingSample();
    low.urgent.hypotheses[0]!.level = "低";
    rejectsTraining(low, "level 低");
    for (const value of ["やや高い", "", "推奨", "高い "]) {
      for (const key of ["match", "risk", "support"]) {
        const v = trainingSample();
        v.verdict[key] = value;
        rejectsTraining(v, `${key} ${value}`);
      }
    }
  });

  it("必須のキーが無いと拒む（空にしたいところは空の文字）", () => {
    const cases: [string, (v: TrainingMutable) => void][] = [
      ["oneonone", (v) => delete (v as Record<string, unknown>).oneonone],
      ["verdict.support", (v) => delete v.verdict.support],
      ["role.cond", (v) => delete v.role.cond],
      ["steps[].say", (v) => delete v.role.steps[0]!.say],
      ["daily[].say", (v) => delete v.daily[0]!.say],
    ];
    for (const [label, mutate] of cases) {
      const v = trainingSample();
      mutate(v);
      rejectsTraining(v, label);
    }
    // 空の文字は受け入れる（urgent.why と role.why のほか）
    const empty = trainingSample();
    empty.role.cond = "";
    empty.urgent.actions[0]!.label = "";
    empty.role.steps[0]!.target = "";
    empty.role.steps[0]!.say = "";
    empty.role.steps[0]!.note = "";
    empty.daily[0]!.say = "";
    acceptsTraining(empty);
  });

  it("urgent.why と role.why が空・空白だけなら拒む", () => {
    for (const why of ["", "  ", " \n\t　"]) {
      const urgent = trainingSample();
      urgent.urgent.why = why;
      rejectsTraining(urgent, `urgent.why ${JSON.stringify(why)}`);
      const role = trainingSample();
      role.role.why = why;
      rejectsTraining(role, `role.why ${JSON.stringify(why)}`);
    }
  });

  it("配列の数の上下（hypotheses 1〜5、actions 1〜6、have 1〜5、lack 1〜6、steps 1〜6、daily 1〜8、oneonone 1〜5）", () => {
    const list = <T>(n: number, make: (i: number) => T) =>
      Array.from({ length: n }, (_, i) => make(i));
    const hypothesis = (i: number) => ({ level: "中", text: `原因${i}` });
    const action = (i: number) => ({ label: "", text: `一手${i}` });
    const step = (i: number) => ({
      badge: `STEP ${i + 1}`,
      target: "",
      title: `題${i}`,
      body: `本文${i}`,
      say: "",
      note: "",
    });
    const daily = (i: number) => ({ scene: "教える", ok: `ok${i}`, ng: `ng${i}`, say: "" });
    const question = (i: number) => ({ q: `質問${i}`, intent: `意図${i}` });
    const cases: [string, number, (v: TrainingMutable, n: number) => void][] = [
      ["hypotheses", 5, (v, n) => (v.urgent.hypotheses = list(n, hypothesis))],
      ["actions", 6, (v, n) => (v.urgent.actions = list(n, action))],
      ["have", 5, (v, n) => (v.role.have = list(n, (i) => `力${i}`))],
      ["lack", 6, (v, n) => (v.role.lack = list(n, (i) => `欠け${i}`))],
      ["steps", 6, (v, n) => (v.role.steps = list(n, step))],
      ["daily", 8, (v, n) => (v.daily = list(n, daily))],
      ["oneonone", 5, (v, n) => (v.oneonone = list(n, question))],
    ];
    for (const [label, max, set] of cases) {
      for (const n of [1, max]) {
        const ok = trainingSample();
        set(ok, n);
        expect(TrainingAiOutputSchema.safeParse(ok).success, `${label} ${n}`).toBe(true);
      }
      for (const n of [0, max + 1]) {
        const ng = trainingSample();
        set(ng, n);
        rejectsTraining(ng, `${label} ${n}`);
      }
    }
  });
});
