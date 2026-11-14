// AI 解説の種類と出力の上限（11-6 §3.7.1）。aiAnalyses.analysisKind の値。画面とサーバの両方から読む純粋なモジュール
export const AI_ANALYSIS_KINDS = ["recruitment", "training", "longitudinal"] as const; // 採用向け・育成・定着・経年比較
export type AiAnalysisKind = (typeof AI_ANALYSIS_KINDS)[number];

/** 3 つの種類の文字だけを真にする（API のパスの kind と、画面の状態の ai の読み取り。11-6 §3.4・§3.7.6） */
export function isAiAnalysisKind(value: unknown): value is AiAnalysisKind {
  return typeof value === "string" && (AI_ANALYSIS_KINDS as readonly string[]).includes(value);
}

/** 出力の上限（max_tokens。K-25、11-6 §2.9） */
export const AI_MAX_TOKENS: Readonly<Record<AiAnalysisKind, number>> = {
  recruitment: 16000,
  training: 16000,
  longitudinal: 32000,
};
