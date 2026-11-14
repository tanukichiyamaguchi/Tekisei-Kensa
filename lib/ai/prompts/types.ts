// プロンプト定義の型（07 §2.2、11-6 §3.7.2）
import type { AiAnalysisKind } from "@/lib/ai/kinds";

export interface PromptDefinition {
  readonly version: string; // "recruitment-v1"（AI_PROMPT_VERSION、aiAnalyses.promptVersion）
  readonly analysisKind: AiAnalysisKind; // "recruitment"（aiAnalyses.analysisKind）
  readonly system: string; // 付録D §3 の system 指示全文（07 D07-03 の修正込み）
  readonly userTemplate: string; // 付録D §3 のユーザー入力テンプレート（{{…}} 形式。07 §2.3）
}
