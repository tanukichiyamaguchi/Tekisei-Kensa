// プロンプト定義の型（07 §2.2、11-6 §3.7.2）
import type { AiAnalysisKind } from "@/lib/ai/kinds";

export interface PromptDefinition {
  readonly version: string; // "recruitment-v2"・"training-v1" など（種類の版の環境変数の値、aiAnalyses.promptVersion）
  readonly analysisKind: AiAnalysisKind; // 版の種類（aiAnalyses.analysisKind）
  readonly system: string; // 付録D §3・§5・§6 の system 指示全文（recruitment-v1・v2 は 07 D07-03 の修正込み）
  readonly userTemplate: string; // 付録D §3・§5・§6 のユーザー入力テンプレート（{{…}} 形式。07 §2.3）
  /**
   * 本番で使えるか（11-6 §2.7.4、K-39 Q-08）。偽の版は、本番・Preview（VERCEL_ENV が production・preview）の起動時の検証
   * （lib/utils/env.ts）で止める。依頼主の確認の後の PR で真にする
   */
  readonly approvedForProduction: boolean;
}
