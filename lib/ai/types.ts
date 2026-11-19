// AI 連携の型（00 §3.6、11-6 §3.7.3）。provider・プロンプトの実装は 07 分冊
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { TrainingContext } from "@/lib/masters/training-context";
import type { ScoreResult } from "@/lib/scoring/types";

/** 採用向けの入力 */
export interface AiAnalysisInput {
  readonly respondentName: string;
  readonly occupationLabel: string;
  readonly result: ScoreResult;
}

/**
 * 育成・定着の入力（採用向けの入力に 8 項目のコードを足す。11-6 §3.5 の 9・§3.7.3）。サービスが
 * { ...buildAiAnalysisInput(…), context } と組み、プロンプトには 8 項目の表示名を差し込む（lib/ai/prompt-builder.ts）
 */
export interface TrainingAiInput extends AiAnalysisInput {
  readonly context: TrainingContext;
}

/** 経年比較の入力（buildLongitudinalUserText の結果。氏名を含まない。11-6 §3.7.3。組み立ては PR-7.11b） */
export interface LongitudinalAiInput {
  readonly userText: string;
}

/** 種類ごとの入力 */
export interface AiInputByKind {
  readonly recruitment: AiAnalysisInput;
  readonly training: TrainingAiInput;
  readonly longitudinal: LongitudinalAiInput;
}

/** 付録D §2 の JSON スキーマと 1 対 1 */
export interface AiAnalysisOutput {
  readonly summary: string;
  readonly verdict: {
    readonly sokusenryoku: "非常に高い" | "高い" | "中" | "低い" | "非常に低い";
    readonly teichaku_risk: "非常に低い" | "低い" | "中" | "高い" | "非常に高い";
    readonly sougou: "推奨" | "条件付きで推奨" | "要検討" | "非推奨";
  };
  readonly strengths: readonly string[];
  readonly cautions: readonly string[];
  readonly questions: ReadonlyArray<{ readonly q: string; readonly intent: string }>;
  readonly retention: {
    readonly levers: ReadonlyArray<{
      readonly label: "関わり方" | "任せ方" | "認め方" | "伸ばし方";
      readonly text: string;
    }>;
    readonly sign: string;
    readonly action: string;
  };
}

/** 育成・定着の判定の 5 段階（11-6 §2.8.2 の LEVEL5） */
type TrainingVerdictLevel = "非常に高い" | "高い" | "中" | "低い" | "非常に低い";

/** 育成・定着の原因の確からしさ（11-6 §2.8.2 の HYPOTHESIS_LEVELS） */
export type HypothesisLevel = "高" | "中" | "診断外";

/** 育成・定着の出力（11-6 §2.8.2 の TrainingAiOutputSchema と 1 対 1。readonly の有無だけが異なる） */
export interface TrainingAiOutput {
  readonly verdict: {
    readonly match: TrainingVerdictLevel;
    readonly risk: TrainingVerdictLevel;
    readonly support: TrainingVerdictLevel;
  };
  readonly urgent: {
    readonly why: string;
    readonly hypotheses: ReadonlyArray<{ readonly level: HypothesisLevel; readonly text: string }>;
    readonly actions: ReadonlyArray<{ readonly label: string; readonly text: string }>;
  };
  readonly role: {
    readonly why: string;
    readonly have: readonly string[];
    readonly lack: readonly string[];
    readonly steps: ReadonlyArray<{
      readonly badge: string;
      readonly target: string;
      readonly title: string;
      readonly body: string;
      readonly say: string;
      readonly note: string;
    }>;
    readonly cond: string;
  };
  readonly daily: ReadonlyArray<{
    readonly scene: string;
    readonly ok: string;
    readonly ng: string;
    readonly say: string;
  }>;
  readonly oneonone: ReadonlyArray<{ readonly q: string; readonly intent: string }>;
}

/**
 * 種類ごとの出力（11-6 §3.7.3）。経年比較の出力の型は、スキーマと一緒に PR-7.11b が入れ替える（それまでは never。PR-7.10 の
 * provider の中身は採用向けと育成・定着。11-6 §4.4）
 */
export interface AiOutputByKind {
  readonly recruitment: AiAnalysisOutput;
  readonly training: TrainingAiOutput;
  readonly longitudinal: never;
}

/** 生成オプション（04 §7.1。signal は 04 D04-38 の 240 秒） */
export interface GenerateOptions {
  readonly model: string;
  readonly promptVersion: string;
  readonly signal: AbortSignal;
}

/** トークン使用量（07 §4.8。stub は null） */
export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
}

/** generate() の戻り値（07 §5.1、11-6 §3.7.3） */
export interface AiGenerateResult<K extends AiAnalysisKind = AiAnalysisKind> {
  readonly output: AiOutputByKind[K];
  readonly rawText: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly analysisKind: K;
  readonly usage: AiUsage | null;
  readonly stopReason: string | null;
  readonly requestId: string | null;
}

export interface AiProvider {
  readonly name: "anthropic" | "stub";
  generate<K extends AiAnalysisKind>(
    kind: K,
    input: AiInputByKind[K],
    options: GenerateOptions,
  ): Promise<AiGenerateResult<K>>;
}

export const AI_GENERATION_STATUSES = [
  "not_generated",
  "generating",
  "completed",
  "failed",
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];
