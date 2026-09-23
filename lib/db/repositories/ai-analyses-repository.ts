// AI 解説（02 §3.6、§8.6）。latestAiAnalysisId を書くのは saveAiAnalysis() だけ（I-7）
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import { canViewExecutives } from "@/lib/auth/claims";
import type { RequestMeta, Viewer } from "@/lib/auth/claims";
import type { AiGenerateResult } from "@/lib/ai/types";
import { aiAnalysesRef, COLLECTIONS, db, rawCollection, resultsRef } from "@/lib/db/collections";
import type { AiAnalysis, Result } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toAiAnalysis } from "@/lib/db/mappers/documents";
import { toResult } from "@/lib/db/mappers/result";
import { aiAnalysisCreateSchema } from "@/lib/db/schemas/ai-analysis";
import { validateForWrite } from "@/lib/db/schemas/validate";
import { docIdSchema } from "@/lib/db/schemas/values";

function isVisible(result: Result | null, viewer: Viewer): result is Result {
  return (
    result !== null &&
    result.organizationId === viewer.organizationId &&
    result.deletedAt === null &&
    (result.respondentKind === "applicant" || canViewExecutives(viewer.role))
  );
}

/**
 * 生成開始（トランザクション）。completed なら何もしない。generating で開始から staleAfterMs 未満なら
 * AI_ALREADY_GENERATING、それ以上なら滞留とみなして再開始する。not_generated / failed は開始する
 */
export async function markAiGenerationStarted(input: {
  readonly resultId: string;
  readonly viewer: Viewer;
  readonly staleAfterMs: number;
}): Promise<{ readonly alreadyCompleted: boolean; readonly latestAiAnalysisId: string | null }> {
  if (!docIdSchema.safeParse(input.resultId).success) {
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  }
  return db().runTransaction(async (tx) => {
    const r = fromSnapshot(await tx.get(resultsRef().doc(input.resultId)), toResult);
    if (!isVisible(r, input.viewer))
      throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
    if (r.aiGenerationStatus === "completed") {
      return { alreadyCompleted: true, latestAiAnalysisId: r.latestAiAnalysisId };
    }
    const now = Timestamp.now();
    if (
      r.aiGenerationStatus === "generating" &&
      r.aiGenerationStartedAt !== null &&
      now.toMillis() - r.aiGenerationStartedAt.getTime() < input.staleAfterMs
    ) {
      throw new RepositoryError("AI_ALREADY_GENERATING", "AI 解説を生成中です");
    }
    tx.update(rawCollection(COLLECTIONS.results).doc(r.id), {
      aiGenerationStatus: "generating",
      aiGenerationStartedAt: now,
      aiGenerationError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { alreadyCompleted: false, latestAiAnalysisId: r.latestAiAnalysisId };
  });
}

/** AI 生成回数の上限用（Q14、count() 集計） */
export async function countAiAnalysesSince(input: {
  readonly organizationId: string;
  readonly since: Date;
}): Promise<number> {
  const snapshot = await rawCollection(COLLECTIONS.aiAnalyses)
    .where("organizationId", "==", input.organizationId)
    .where("createdAt", ">=", Timestamp.fromDate(input.since))
    .count()
    .get();
  return snapshot.data().count;
}

export interface SaveAiAnalysisInput {
  readonly resultId: string;
  readonly viewer: Viewer;
  readonly generated: AiGenerateResult;
  /** AiProvider.name（aiAnalyses.provider。AiGenerateResult には含まれないため呼び出し元が渡す。07 §5.1） */
  readonly provider: string;
  readonly reliability: number;
  readonly meta: RequestMeta;
}

/**
 * 成功時の保存。aiAnalyses を作成し、同一バッチで results を completed / latestAiAnalysisId に更新し、
 * auditLogs（result.ai_generate）を追記する。organizationId / respondentId は results 文書の値を写す（I-7）
 */
export async function saveAiAnalysis(
  input: SaveAiAnalysisInput,
): Promise<{ readonly aiAnalysisId: string }> {
  const r = fromSnapshot(await resultsRef().doc(input.resultId).get(), toResult);
  if (!isVisible(r, input.viewer))
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  const ref = rawCollection(COLLECTIONS.aiAnalyses).doc();
  const data = validateForWrite(
    aiAnalysisCreateSchema,
    {
      organizationId: r.organizationId,
      resultId: r.id,
      respondentId: r.respondentId,
      analysisKind: input.generated.analysisKind,
      provider: input.provider,
      model: input.generated.model,
      promptVersion: input.generated.promptVersion,
      output: { ...input.generated.output },
      rawText: input.generated.rawText,
      usage: input.generated.usage,
      stopReason: input.generated.stopReason,
      requestId: input.generated.requestId,
      status: "completed",
      reliability: input.reliability,
      generatedBy: input.viewer.uid,
    },
    "aiAnalyses",
  );
  const stamp = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.create(ref, { ...data, createdAt: stamp, updatedAt: stamp });
  batch.update(rawCollection(COLLECTIONS.results).doc(r.id), {
    aiGenerationStatus: "completed",
    aiGenerationError: null,
    latestAiAnalysisId: ref.id,
    updatedAt: stamp,
  });
  addAuditLogToBatch(batch, {
    organizationId: r.organizationId,
    actorKind: "admin",
    actorUid: input.viewer.uid,
    actorRole: input.viewer.role,
    action: "result.ai_generate",
    targetCollection: COLLECTIONS.results,
    targetId: r.id,
    details: {
      status: "completed",
      aiAnalysisId: ref.id,
      inputTokens: input.generated.usage?.inputTokens ?? null,
      outputTokens: input.generated.usage?.outputTokens ?? null,
    },
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
  return { aiAnalysisId: ref.id };
}

/** 失敗時。results を failed / aiGenerationError = reason に更新し、auditLogs（result.ai_generate）を追記する */
export async function markAiGenerationFailed(input: {
  readonly resultId: string;
  readonly viewer: Viewer;
  readonly reason: string;
  readonly meta: RequestMeta;
}): Promise<void> {
  if (!/^[a-z_]{1,50}$/.test(input.reason)) {
    throw new RepositoryError("VALIDATION_ERROR", "失敗理由の形式が不正です");
  }
  const r = fromSnapshot(await resultsRef().doc(input.resultId).get(), toResult);
  if (!isVisible(r, input.viewer))
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  const batch = db().batch();
  batch.update(rawCollection(COLLECTIONS.results).doc(r.id), {
    aiGenerationStatus: "failed",
    aiGenerationError: input.reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
  addAuditLogToBatch(batch, {
    organizationId: r.organizationId,
    actorKind: "admin",
    actorUid: input.viewer.uid,
    actorRole: input.viewer.role,
    action: "result.ai_generate",
    targetCollection: COLLECTIONS.results,
    targetId: r.id,
    details: { status: "failed", reason: input.reason },
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
}

/** results の可視性を継承する（呼び出し元が getResult() 済み）。resultId と organizationId の一致を検証する */
export async function getAiAnalysis(input: {
  readonly aiAnalysisId: string;
  readonly resultId: string;
  readonly organizationId: string;
}): Promise<AiAnalysis | null> {
  if (!docIdSchema.safeParse(input.aiAnalysisId).success) return null;
  const a = fromSnapshot(await aiAnalysesRef().doc(input.aiAnalysisId).get(), toAiAnalysis);
  if (!a) return null;
  if (a.resultId !== input.resultId || a.organizationId !== input.organizationId) {
    throw new RepositoryError("AI_ANALYSIS_MISMATCH", "AI 解説の参照が不整合です");
  }
  return a;
}
