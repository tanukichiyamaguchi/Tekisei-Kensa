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

/** 育成・定着の入力（採用向けの入力に 8 項目を足す。11-6 §3.7.3。組み立ては PR-7.10） */
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

/**
 * 種類ごとの出力（11-6 §3.7.3）。育成・定着と経年比較の出力の型は、それぞれのスキーマと一緒に PR-7.10・PR-7.11b が
 * 入れ替える（それまでは never。PR-7.9 の provider の中身は採用向けだけ。11-6 §4.4）
 */
export interface AiOutputByKind {
  readonly recruitment: AiAnalysisOutput;
  readonly training: never;
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
