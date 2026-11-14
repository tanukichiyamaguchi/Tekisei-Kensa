// AI 解説の種類と results の項目の対応（11-6 §3.1 の AI_KIND_FIELDS）と、種類の状態の読み出し（§3.7.9 の aiKindState）。
// firebase-admin の実行時コードを読まない純粋なモジュール（型だけを使う）
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiGenerationStatus } from "@/lib/ai/types";
import type { Result } from "@/lib/db/domain";
import type { ResultDoc } from "@/lib/db/types";

/** 種類ごとの 4 項目（値は ResultDoc のキー） */
export interface AiKindFieldNames {
  readonly status: Extract<
    keyof ResultDoc,
    "aiGenerationStatus" | "trainingAiStatus" | "longitudinalAiStatus"
  >;
  readonly startedAt: Extract<
    keyof ResultDoc,
    "aiGenerationStartedAt" | "trainingAiStartedAt" | "longitudinalAiStartedAt"
  >;
  readonly error: Extract<
    keyof ResultDoc,
    "aiGenerationError" | "trainingAiError" | "longitudinalAiError"
  >;
  readonly latestId: Extract<
    keyof ResultDoc,
    "latestAiAnalysisId" | "latestTrainingAiAnalysisId" | "latestLongitudinalAiAnalysisId"
  >;
}

/** 11-6 §3.1 の「種類と項目の対応」の表。採用向けの 4 項目は名前も値も M7 より前のまま */
export const AI_KIND_FIELDS: Readonly<Record<AiAnalysisKind, AiKindFieldNames>> = {
  recruitment: {
    status: "aiGenerationStatus",
    startedAt: "aiGenerationStartedAt",
    error: "aiGenerationError",
    latestId: "latestAiAnalysisId",
  },
  training: {
    status: "trainingAiStatus",
    startedAt: "trainingAiStartedAt",
    error: "trainingAiError",
    latestId: "latestTrainingAiAnalysisId",
  },
  longitudinal: {
    status: "longitudinalAiStatus",
    startedAt: "longitudinalAiStartedAt",
    error: "longitudinalAiError",
    latestId: "latestLongitudinalAiAnalysisId",
  },
};

/** 種類の状態（results のその種類の 4 項目） */
export interface AiKindState {
  readonly status: AiGenerationStatus;
  readonly startedAt: Date | null;
  /** 失敗の理由（AiFailureReason か internal_error） */
  readonly error: string | null;
  /** その種類の最新の分析（aiAnalyses の文書 ID） */
  readonly latestId: string | null;
}

/** 結果から種類の 4 項目だけを読む（ほかの種類の項目は読まない） */
export function aiKindState(result: Result, kind: AiAnalysisKind): AiKindState {
  const fields = AI_KIND_FIELDS[kind];
  return {
    status: result[fields.status],
    startedAt: result[fields.startedAt],
    error: result[fields.error],
    latestId: result[fields.latestId],
  };
}
