// スタブ provider（07 §5.4、01 D01-07、11-6 §3.7.3）。API キーを持たないローカル・CI の結合／E2E テスト用。本番は起動時検証で拒否
// （01 §4.3）。PR-7.9 は採用向けだけ（育成・定着と経年比較のスタブの出力は PR-7.10・PR-7.11b。それまでは config_error）
import { type AiFailureReason, AiProviderError } from "@/lib/ai/errors";
import { formatRiskForAi } from "@/lib/ai/input";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { buildMessages } from "@/lib/ai/prompt-builder";
import { getPromptDefinitionForKind } from "@/lib/ai/prompts";
import { LEVER_LABELS, parseAiOutputText } from "@/lib/ai/schema";
import type {
  AiAnalysisInput,
  AiAnalysisOutput,
  AiGenerateResult,
  AiInputByKind,
  AiProvider,
  GenerateOptions,
} from "@/lib/ai/types";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import type { RiskKey } from "@/lib/scoring/types";

/** この氏名（trim 後）のとき、付録D の「出力形式」に違反するテキストを返して invalid_json を起こす（07 D07-24、08 D08-22） */
export const STUB_INVALID_JSON_NAME = "__INVALID_JSON__";

export const STUB_DEFAULT_DELAY_MS = 500;

export interface StubProviderOptions {
  /** 応答までの遅延（ミリ秒）。06 の「生成中」表示の確認用 */
  readonly delayMs?: number;
  /** 単体テスト用: この理由の AiProviderError を投げる（環境変数では切り替えない） */
  readonly failWith?: AiFailureReason;
}

const RETRYABLE_REASONS: ReadonlySet<AiFailureReason> = new Set([
  "provider_error",
  "rate_limited",
  "timeout",
]);

/** 離職リスクの判定に使う 4 項目（付録D §3「判定基準」の (a)） */
const RETENTION_RISK_KEYS: readonly RiskKey[] = [
  "low_motivation",
  "resignation_trouble",
  "mental_distress",
  "communication_issue",
];

function teichakuRisk(average: number): AiAnalysisOutput["verdict"]["teichaku_risk"] {
  if (average >= 75) return "非常に高い";
  if (average >= 60) return "高い";
  if (average >= 42) return "中";
  if (average >= 25) return "低い";
  return "非常に低い";
}

/** 入力から決定的に組み立てた出力（同じ入力で同じ出力。07 §5.4） */
export function buildStubOutput(input: AiAnalysisInput): AiAnalysisOutput {
  const { result } = input;
  const name = input.respondentName.trim();
  const typeLabel =
    APTITUDE_TYPE_DEFINITIONS.find((d) => d.key === result.aptitudeType)?.shortLabel ?? "";

  // リスクが最も高い項目（同点は 00 §1.5 の順で先のもの）
  let top = RISK_DEFINITIONS[0];
  for (const def of RISK_DEFINITIONS) {
    if (top === undefined || result.risks[def.key] > result.risks[top.key]) top = def;
  }
  const topLabel = top?.aiLabel ?? "";
  const topValue = top ? formatRiskForAi(result.risks[top.key]) : "0";

  const average =
    RETENTION_RISK_KEYS.reduce((sum, key) => sum + Math.max(0, result.risks[key]), 0) /
    RETENTION_RISK_KEYS.length;

  return {
    summary: `${name}さんは、${typeLabel}の傾向を持つ人です。これはスタブが生成した確認用の文章で、実際の AI 解説ではありません。${input.occupationLabel}としての評価は実際の AI 解説で確認してください。`,
    verdict: { sokusenryoku: "中", teichaku_risk: teichakuRisk(average), sougou: "要検討" },
    strengths: ["（スタブ）強みの 1 件目です。", "（スタブ）強みの 2 件目です。"],
    cautions: [
      `（スタブ）${topLabel}のリスクが最も高い項目です（${topLabel}リスク${topValue}）。`,
      "（スタブ）注意点の 2 件目です。",
    ],
    questions: [
      { q: "（スタブ）面接質問の 1 件目です。", intent: "（スタブ）見極めたいことの 1 件目です。" },
      { q: "（スタブ）面接質問の 2 件目です。", intent: "（スタブ）見極めたいことの 2 件目です。" },
      { q: "（スタブ）面接質問の 3 件目です。", intent: "（スタブ）見極めたいことの 3 件目です。" },
    ],
    retention: {
      levers: LEVER_LABELS.map((label) => ({ label, text: `（スタブ）${label}の説明です。` })),
      sign: "（スタブ）離職に向かう最初のサインです。",
      action: "（スタブ）引き止めの一手です。",
    },
  };
}

function abortedError(): AiProviderError {
  return new AiProviderError("timeout", "request aborted", null, true);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortedError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createStubProvider(options: StubProviderOptions = {}): AiProvider {
  const delayMs = options.delayMs ?? STUB_DEFAULT_DELAY_MS;
  return {
    name: "stub",
    async generate<K extends AiAnalysisKind>(
      kind: K,
      input: AiInputByKind[K],
      generateOptions: GenerateOptions,
    ): Promise<AiGenerateResult<K>> {
      if (generateOptions.signal.aborted) throw abortedError();
      // 種類の違う版・登録されていない版は config_error（実 provider と同じ。11-6 §3.7.3）
      const prompt = getPromptDefinitionForKind(kind, generateOptions.promptVersion);
      if (kind !== "recruitment") {
        throw new AiProviderError("config_error", `stub: no output for ${kind}`);
      }
      // 実 provider と同じ組み立てを通し、プロンプト版・プレースホルダの不整合を CI でも検出する
      buildMessages(kind, input, generateOptions.promptVersion);
      await sleep(delayMs, generateOptions.signal);

      if (options.failWith) {
        throw new AiProviderError(
          options.failWith,
          `stub failure: ${options.failWith}`,
          null,
          RETRYABLE_REASONS.has(options.failWith),
        );
      }

      // kind が recruitment なので入力は採用向けの形（型の引数 K は比較では絞られない）
      const recruitmentInput = input as AiAnalysisInput;
      const built = buildStubOutput(recruitmentInput);
      if (recruitmentInput.respondentName.trim() === STUB_INVALID_JSON_NAME) {
        // コードフェンス付き（付録D §3「出力形式」違反）。parseAiOutputText が invalid_json を投げる
        parseAiOutputText(kind, `\`\`\`json\n${JSON.stringify(built)}\n\`\`\``);
      }
      const rawText = JSON.stringify(built);
      return {
        output: parseAiOutputText(kind, rawText),
        rawText,
        model: generateOptions.model,
        promptVersion: prompt.version,
        analysisKind: kind,
        usage: null,
        stopReason: "end_turn",
        requestId: null,
      };
    },
  };
}
