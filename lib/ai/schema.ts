// AI 出力の検証スキーマ（07 §3.2、11-6 §2.8・§3.7.3）。採用向けは付録D §2 と 00 §3.6 の AiAnalysisOutput に、育成・定着は
// 11-6 §2.8.2 と TrainingAiOutput に 1 対 1。定義はこの 1 箇所だけにし、種類ごとの表 AI_OUTPUT_SCHEMAS を、Anthropic provider の
// zodOutputFormat() と parseAiOutputText()・parseStoredAiOutput() が使う（08 D08-10）
import { z } from "zod";

import { AiProviderError } from "@/lib/ai/errors";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput, AiOutputByKind, TrainingAiOutput } from "@/lib/ai/types";

export const LEVER_LABELS = ["関わり方", "任せ方", "認め方", "伸ばし方"] as const;

/** 付録D の個数指定（2〜4 個、3〜5 個）より緩い上限。1 個の過不足は失敗にせず受け入れる（07 D07-07） */
const MAX_STRENGTHS = 6;
const MAX_CAUTIONS = 6;
const MAX_QUESTIONS = 8;

// 余分なキーは拒否する（.strict()）。構造化出力が要求する additionalProperties: false と同じ制約を、
// テキスト解析（parseAiOutputText）でも同じスキーマで課すため（08 U-10「余分なキー」）
export const AiAnalysisOutputSchema = z
  .object({
    summary: z.string().describe("3〜4文。冒頭で氏名を使う"),
    verdict: z
      .object({
        sokusenryoku: z.enum(["非常に高い", "高い", "中", "低い", "非常に低い"]),
        teichaku_risk: z.enum(["非常に低い", "低い", "中", "高い", "非常に高い"]),
        sougou: z.enum(["推奨", "条件付きで推奨", "要検討", "非推奨"]),
      })
      .strict(),
    strengths: z.array(z.string()).describe("このサロンで活きる強み。2〜4個"),
    cautions: z.array(z.string()).describe("採用前に見極めたい注意点。2〜4個（根拠スコア付き）"),
    questions: z
      .array(
        z
          .object({
            q: z.string().describe("面接質問文"),
            intent: z.string().describe("見極めたいこと"),
          })
          .strict(),
      )
      .describe("3〜5個"),
    retention: z
      .object({
        levers: z
          .array(z.object({ label: z.enum(LEVER_LABELS), text: z.string() }).strict())
          .describe("必ず「関わり方」「任せ方」「認め方」「伸ばし方」の4つ・この順"),
        sign: z.string().describe("離職に向かう最初のサイン"),
        action: z.string().describe("引き止めの一手"),
      })
      .strict(),
  })
  .strict()
  // 以下は API 側では強制されない制約（配列長・文字列長）。クライアント側で検証する
  .refine((v) => v.summary.trim().length > 0, { message: "summary is empty" })
  .refine((v) => v.strengths.length >= 1 && v.strengths.length <= MAX_STRENGTHS, {
    message: "strengths length",
  })
  .refine((v) => v.cautions.length >= 1 && v.cautions.length <= MAX_CAUTIONS, {
    message: "cautions length",
  })
  .refine((v) => v.questions.length >= 1 && v.questions.length <= MAX_QUESTIONS, {
    message: "questions length",
  })
  .refine(
    (v) =>
      v.retention.levers.length === LEVER_LABELS.length &&
      v.retention.levers.every((l, i) => l.label === LEVER_LABELS[i]),
    { message: "levers must be the 4 labels in order" },
  );

export type AiAnalysisOutputParsed = z.infer<typeof AiAnalysisOutputSchema>;

/** 型の対応の確認（readonly の有無だけが異なる。07 §3.2） */
const _outputCompatible: (v: AiAnalysisOutputParsed) => AiAnalysisOutput = (v) => v;
void _outputCompatible;

/** 育成・定着の判定の 5 段階（11-6 §2.8.2） */
const LEVEL5 = ["非常に高い", "高い", "中", "低い", "非常に低い"] as const;
/** 育成・定着の原因の確からしさ（11-6 §2.8.2） */
export const HYPOTHESIS_LEVELS = ["高", "中", "診断外"] as const;

/** min ≤ n ≤ max（11-6 §2.8.2） */
function between(n: number, min: number, max: number): boolean {
  return min <= n && n <= max;
}

// 育成・定着（11-6 §2.8.2）。余分なキーは各段で拒否する（.strict()）。配列の数と文字の空は API 側では強制されないため refine で
// 確かめる。数の上限はプロンプトの指示より緩い（1 個の過不足では失敗にしない。07 D07-07 の考え方）
export const TrainingAiOutputSchema = z
  .object({
    verdict: z
      .object({ match: z.enum(LEVEL5), risk: z.enum(LEVEL5), support: z.enum(LEVEL5) })
      .strict(),
    urgent: z
      .object({
        why: z.string(),
        hypotheses: z.array(
          z.object({ level: z.enum(HYPOTHESIS_LEVELS), text: z.string() }).strict(),
        ),
        actions: z.array(z.object({ label: z.string(), text: z.string() }).strict()),
      })
      .strict(),
    role: z
      .object({
        why: z.string(),
        have: z.array(z.string()),
        lack: z.array(z.string()),
        steps: z.array(
          z
            .object({
              badge: z.string(),
              target: z.string(),
              title: z.string(),
              body: z.string(),
              say: z.string(),
              note: z.string(),
            })
            .strict(),
        ),
        cond: z.string(),
      })
      .strict(),
    daily: z.array(
      z.object({ scene: z.string(), ok: z.string(), ng: z.string(), say: z.string() }).strict(),
    ),
    oneonone: z.array(z.object({ q: z.string(), intent: z.string() }).strict()),
  })
  .strict()
  .refine((v) => v.urgent.why.trim().length > 0, { message: "urgent.why is empty" })
  .refine((v) => v.role.why.trim().length > 0, { message: "role.why is empty" })
  .refine((v) => between(v.urgent.hypotheses.length, 1, 5), { message: "hypotheses length" })
  .refine((v) => between(v.urgent.actions.length, 1, 6), { message: "actions length" })
  .refine((v) => between(v.role.have.length, 1, 5), { message: "have length" })
  .refine((v) => between(v.role.lack.length, 1, 6), { message: "lack length" })
  .refine((v) => between(v.role.steps.length, 1, 6), { message: "steps length" })
  .refine((v) => between(v.daily.length, 1, 8), { message: "daily length" })
  .refine((v) => between(v.oneonone.length, 1, 5), { message: "oneonone length" });

export type TrainingAiOutputParsed = z.infer<typeof TrainingAiOutputSchema>;

/** 型の対応の確認（readonly の有無だけが異なる。07 §3.2） */
const _trainingOutputCompatible: (v: TrainingAiOutputParsed) => TrainingAiOutput = (v) => v;
void _trainingOutputCompatible;

/**
 * 種類ごとの出力のスキーマ（11-6 §3.7.3）。採用向けと育成・定着（経年比較の LongitudinalAiOutputSchema は PR-7.11b が足す）
 */
export const AI_OUTPUT_SCHEMAS: { readonly [K in AiAnalysisKind]?: z.ZodType<AiOutputByKind[K]> } =
  {
    recruitment: AiAnalysisOutputSchema,
    training: TrainingAiOutputSchema,
  };

/**
 * 応答テキストを種類のスキーマで検証する（構造化出力を持たない provider、stub の不正 JSON モード、Anthropic provider の応答本文。
 * 07 §3.2）。付録D §3「出力形式（厳守）」のとおり、先頭が { で始まり末尾が } で終わる純粋な JSON だけを受理する。
 * スキーマの無い種類は AiProviderError("config_error")。検証の失敗はすべて AiProviderError("invalid_json")。
 * 例外メッセージに入力テキストを含めない（氏名が含まれ得る。07 §4.8）
 */
export function parseAiOutputText<K extends AiAnalysisKind>(
  kind: K,
  text: string,
): AiOutputByKind[K] {
  const schema = AI_OUTPUT_SCHEMAS[kind];
  if (schema === undefined) {
    throw new AiProviderError("config_error", `no output schema for ${kind}`);
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new AiProviderError("invalid_json", "response text is not a bare JSON object");
  }
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new AiProviderError("invalid_json", "response text is not valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    // issue.message は値やキー名を含み得るため使わない。パスとコードだけを出す
    const where = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
      .join(", ");
    throw new AiProviderError("invalid_json", `schema validation failed: ${where}`);
  }
  return result.data;
}

/**
 * 保存した出力（aiAnalyses.output）を今の種類のスキーマで確かめる（11-6 §2.3.4・§3.7.3）。合わないとき・その種類のスキーマが
 * 無いときは null（例外を投げない。読めない出力は呼び出し側が failed・internal_error として扱い、作り直せるようにする）
 */
export function parseStoredAiOutput<K extends AiAnalysisKind>(
  kind: K,
  output: unknown,
): AiOutputByKind[K] | null {
  const schema = AI_OUTPUT_SCHEMAS[kind];
  if (schema === undefined) return null;
  const result = schema.safeParse(output);
  return result.success ? result.data : null;
}
