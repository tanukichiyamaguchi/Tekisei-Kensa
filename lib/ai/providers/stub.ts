// スタブ provider（07 §5.4、01 D01-07、11-6 §3.7.3）。API キーを持たないローカル・CI の結合／E2E テスト用。本番は起動時検証で拒否
// （01 §4.3）。採用向けと育成・定着の決まった出力を返す（経年比較のスタブの出力は PR-7.11b。それまでは config_error）
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
  AiOutputByKind,
  AiProvider,
  GenerateOptions,
  TrainingAiInput,
  TrainingAiOutput,
} from "@/lib/ai/types";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import type { RiskKey } from "@/lib/scoring/types";

/**
 * この氏名（trim 後）のとき、付録D の「出力形式」に違反するテキストを返して invalid_json を起こす（07 D07-24、08 D08-22）。
 * 採用向けと育成・定着に当てる（11-6 §3.7.3）
 */
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

/** 離職リスクの判定に使う 4 項目（付録D §3「判定基準」の (a)。育成・定着の 11-6 別表A の離職リスクの (a) も同じ 4 項目） */
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

/** 離職リスクの 4 項目の平均（負の値は 0 にしてから） */
function retentionRiskAverage(input: AiAnalysisInput): number {
  return (
    RETENTION_RISK_KEYS.reduce((sum, key) => sum + Math.max(0, input.result.risks[key]), 0) /
    RETENTION_RISK_KEYS.length
  );
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

  const average = retentionRiskAverage(input);

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

type TrainingLevel = TrainingAiOutput["verdict"]["risk"];

/** 育成・定着の判定の 5 段階を、低い方から並べたもの（1 段上げる・高い方を選ぶのに使う） */
const TRAINING_LEVELS_ASC: readonly TrainingLevel[] = [
  "非常に低い",
  "低い",
  "中",
  "高い",
  "非常に高い",
];

function higherLevel(a: TrainingLevel, b: TrainingLevel): TrainingLevel {
  return TRAINING_LEVELS_ASC.indexOf(a) >= TRAINING_LEVELS_ASC.indexOf(b) ? a : b;
}

/** 1 段上げる（非常に高いで止まる） */
function raiseLevel(level: TrainingLevel): TrainingLevel {
  const index = TRAINING_LEVELS_ASC.indexOf(level);
  return TRAINING_LEVELS_ASC[Math.min(index + 1, TRAINING_LEVELS_ASC.length - 1)] ?? level;
}

/** 現場のサインの数（11-6 別表A の離職リスクの (b) の 4 つ） */
function fieldSignCount(context: TrainingAiInput["context"]): number {
  return [
    context.recentState === "low_energy" || context.recentState === "complaining",
    context.changeSinceJoining === "less_proactive",
    context.concern === "few_reports" || context.concern === "late_absent",
    context.relationship === "specific_mismatch" || context.relationship === "isolated",
  ].filter(Boolean).length;
}

/**
 * 育成・定着の判定（11-6 §3.7.3。8 項目と離職リスクの 4 項目の平均だけから決める）。
 * risk: 別表A の離職リスクの (a)（4 項目の平均。境目は採用向けの離職リスクと同じ）と (b)（サインが 3 つ以上で非常に高い、2 つで
 * 高い、1 つで (a) を 1 段上げる、0 で (a) のまま）の高い方。match: 現在の評価から（期待以上は高い、期待どおりは中、もう少し
 * 伸びてほしいは低い、課題が多いは非常に低い）。support: 別表A のサポートの必要度の (b) の役割ギャップだけを数える（マッチ度が
 * 低い以下は +2、中は +1、高い以上は 0。合計 2 は中、1 は低い、0 は非常に低い。(a) の本人要因はスコアから決まるので数えない）
 */
function trainingVerdict(input: TrainingAiInput): TrainingAiOutput["verdict"] {
  const byAverage: TrainingLevel = teichakuRisk(retentionRiskAverage(input));
  const signs = fieldSignCount(input.context);
  const bySigns: TrainingLevel =
    signs >= 3
      ? "非常に高い"
      : signs === 2
        ? "高い"
        : signs === 1
          ? raiseLevel(byAverage)
          : byAverage;
  const risk = higherLevel(byAverage, bySigns);

  const match: TrainingLevel =
    input.context.evaluation === "above"
      ? "高い"
      : input.context.evaluation === "meets"
        ? "中"
        : input.context.evaluation === "growing"
          ? "低い"
          : "非常に低い";

  const gap = match === "低い" || match === "非常に低い" ? 2 : match === "中" ? 1 : 0;
  const support: TrainingLevel = gap === 2 ? "中" : gap === 1 ? "低い" : "非常に低い";
  return { match, risk, support };
}

/**
 * 育成・定着の決まった出力（同じ入力で同じ出力。氏名と実在の人の文を入れない。11-6 §3.7.3）。verdict のほかは固定の文で、表示の
 * 条件（11-6 §2.5.5）を確かめられるように、条件のある値（ステップの target・say・note、日常の接し方の say）には空の値と空でない値の
 * 両方を入れる。一手の札 label は表示の条件が無い（空でも文字の無い札を描く。§2.5.5 の 1.2 版）ので、別表A の例の短い語にして空に
 * しない（空の札の描き方は単体テストの見本で確かめる）
 */
export function buildTrainingStubOutput(input: TrainingAiInput): TrainingAiOutput {
  return {
    verdict: trainingVerdict(input),
    urgent: {
      why: "（スタブ）すぐに手を打つべき理由です。これはスタブが生成した確認用の文章で、実際の AI 解説ではありません。",
      hypotheses: [
        { level: "高", text: "（スタブ）確からしさが高い原因です。" },
        { level: "中", text: "（スタブ）確からしさが中くらいの原因です。" },
        { level: "診断外", text: "（スタブ）診断では判別できない原因です。" },
      ],
      actions: [
        { label: "今週", text: "（スタブ）今週まず行う一手です。" },
        { label: "聞き方", text: "（スタブ）聞き方の一手です。" },
      ],
    },
    role: {
      why: "（スタブ）期待する役割に向けて、足りている力と欠けている力の説明です。",
      have: ["（スタブ）足りている力の 1 件目です。", "（スタブ）足りている力の 2 件目です。"],
      lack: ["（スタブ）欠けている力の 1 件目です。", "（スタブ）欠けている力の 2 件目です。"],
      steps: [
        {
          badge: "STEP 1",
          target: "（スタブ）埋める欠け",
          title: "（スタブ）ステップ 1 の題です。",
          body: "（スタブ）ステップ 1 の本文です。",
          say: "（スタブ）ステップ 1 でそのまま言える一言です。",
          note: "（スタブ）ステップ 1 の次に進む合図です。",
        },
        {
          badge: "STEP 2",
          target: "",
          title: "（スタブ）ステップ 2 の題です。",
          body: "（スタブ）ステップ 2 の本文です。",
          say: "",
          note: "",
        },
      ],
      cond: "（スタブ）前提の確認です。",
    },
    daily: [
      {
        scene: "教える",
        ok: "（スタブ）教えるときにすべき行動です。",
        ng: "（スタブ）教えるときに避けるべき行動です。",
        say: "（スタブ）教えるときにそのまま言える一言です。",
      },
      {
        scene: "認める",
        ok: "（スタブ）認めるときにすべき行動です。",
        ng: "（スタブ）認めるときに避けるべき行動です。",
        say: "",
      },
    ],
    oneonone: [
      {
        q: "（スタブ）1on1 の質問の 1 件目です。",
        intent: "（スタブ）答えを受けてすることの 1 件目です。",
      },
      {
        q: "（スタブ）1on1 の質問の 2 件目です。",
        intent: "（スタブ）答えを受けてすることの 2 件目です。",
      },
      {
        q: "（スタブ）1on1 の質問の 3 件目です。",
        intent: "（スタブ）答えを受けてすることの 3 件目です。",
      },
    ],
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
      if (kind === "longitudinal") {
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

      // kind が recruitment なら採用向けの入力、training なら育成・定着の入力（型の引数 K は比較では絞られない）
      const scoredInput = input as AiAnalysisInput;
      const built: AiOutputByKind["recruitment" | "training"] =
        kind === "training"
          ? buildTrainingStubOutput(input as TrainingAiInput)
          : buildStubOutput(scoredInput);
      if (scoredInput.respondentName.trim() === STUB_INVALID_JSON_NAME) {
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
