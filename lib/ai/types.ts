// AI 連携の型（00 §3.6 をそのまま実装）。provider・プロンプトの実装は M5（07 分冊）
import type { ScoreResult } from "@/lib/scoring/types";

export interface AiAnalysisInput {
  readonly respondentName: string;
  readonly occupationLabel: string;
  readonly result: ScoreResult;
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

/** generate() の戻り値（07 §5.1） */
export interface AiGenerateResult {
  readonly output: AiAnalysisOutput;
  readonly rawText: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly analysisKind: string;
  readonly usage: AiUsage | null;
  readonly stopReason: string | null;
  readonly requestId: string | null;
}

export interface AiProvider {
  readonly name: "anthropic" | "stub";
  generate(input: AiAnalysisInput, options: GenerateOptions): Promise<AiGenerateResult>;
}

export const AI_GENERATION_STATUSES = [
  "not_generated",
  "generating",
  "completed",
  "failed",
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];
