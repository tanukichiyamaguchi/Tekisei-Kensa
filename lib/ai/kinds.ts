// AI 解説の種類（11-6 §3.7.1）。aiAnalyses.analysisKind の値
export const AI_ANALYSIS_KINDS = ["recruitment", "training", "longitudinal"] as const; // 採用向け・育成・定着・経年比較
export type AiAnalysisKind = (typeof AI_ANALYSIS_KINDS)[number];
