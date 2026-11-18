// AI 解説（02 §3.6、§8.6、11-6 §3.7.9）。種類ごとの results の 4 項目（AI_KIND_FIELDS）を読み書きする。
// 種類の最新の分析の ID を書くのは、その種類の saveAiAnalysis() だけ（I-7 を種類ごとに広げた I-ai-1）
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import { canViewExecutives } from "@/lib/auth/claims";
import type { RequestMeta, Viewer } from "@/lib/auth/claims";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { parseStoredAiOutput } from "@/lib/ai/schema";
import type { AiGenerateResult } from "@/lib/ai/types";
import { AI_KIND_FIELDS, aiKindState } from "@/lib/db/ai-kind-fields";
import { aiAnalysesRef, COLLECTIONS, db, rawCollection, resultsRef } from "@/lib/db/collections";
import type { AiAnalysis, Result } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toAiAnalysis } from "@/lib/db/mappers/documents";
import { toResult } from "@/lib/db/mappers/result";
import { MappingError } from "@/lib/db/mappers/timestamp";
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
 * 種類の最新の分析が読めるか（11-6 §3.5 の 5・8、§2.3.4）。同じ結果・組織・種類の文書で、出力が今のスキーマに合うこと。
 * 文書が無い（必須の項目が無い文書を含む）・参照が合わない・スキーマに合わないときは偽（作り直せる）
 */
function isReadableAnalysis(
  analysis: AiAnalysis | null,
  result: Result,
  kind: AiAnalysisKind,
): boolean {
  return (
    analysis !== null &&
    analysis.resultId === result.id &&
    analysis.organizationId === result.organizationId &&
    analysis.analysisKind === kind &&
    parseStoredAiOutput(kind, analysis.output) !== null
  );
}

/**
 * トランザクションの中で最新の分析を読む。文書 ID の形でない・必須の項目が無い（MappingError）ときは null（読めないものとして
 * 作り直す。サービスの結果詳細の読み取り（lib/services/ai-area.ts）と同じ判定）
 */
async function readAnalysisInTransaction(
  tx: Transaction,
  aiAnalysisId: string,
): Promise<AiAnalysis | null> {
  if (!docIdSchema.safeParse(aiAnalysisId).success) return null;
  const snapshot = await tx.get(aiAnalysesRef().doc(aiAnalysisId));
  try {
    return fromSnapshot(snapshot, toAiAnalysis);
  } catch (error) {
    if (error instanceof MappingError) return null;
    throw error;
  }
}

/**
 * 生成開始（トランザクション。11-6 §3.5 の 8）。種類の状態が completed で、最新の分析が読めるなら何もしない（alreadyCompleted）。
 * 読めない completed（最新の分析の ID が無い・文書 ID の形でない・文書が無い・必須の項目が無い・参照が合わない・スキーマに合わない）は
 * 作り直しとして開始する（最新の分析の ID は前の値のまま）。generating で開始から staleAfterMs 未満なら AI_ALREADY_GENERATING、
 * それ以上なら滞留とみなして再開始する。not_generated / failed は開始する。書くのはその種類の状態・開始日時・理由だけ
 * （ほかの種類の項目は変えない）
 */
export async function markAiGenerationStarted(input: {
  readonly resultId: string;
  readonly viewer: Viewer;
  readonly kind: AiAnalysisKind;
  readonly staleAfterMs: number;
}): Promise<{ readonly alreadyCompleted: boolean; readonly latestAiAnalysisId: string | null }> {
  if (!docIdSchema.safeParse(input.resultId).success) {
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  }
  const fields = AI_KIND_FIELDS[input.kind];
  return db().runTransaction(async (tx) => {
    const r = fromSnapshot(await tx.get(resultsRef().doc(input.resultId)), toResult);
    if (!isVisible(r, input.viewer))
      throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
    const state = aiKindState(r, input.kind);
    if (state.status === "completed" && state.latestId !== null) {
      const latest = await readAnalysisInTransaction(tx, state.latestId);
      if (isReadableAnalysis(latest, r, input.kind)) {
        return { alreadyCompleted: true, latestAiAnalysisId: state.latestId };
      }
    }
    const now = Timestamp.now();
    if (
      state.status === "generating" &&
      state.startedAt !== null &&
      now.toMillis() - state.startedAt.getTime() < input.staleAfterMs
    ) {
      throw new RepositoryError("AI_ALREADY_GENERATING", "AI 解説を生成中です");
    }
    tx.update(rawCollection(COLLECTIONS.results).doc(r.id), {
      [fields.status]: "generating",
      [fields.startedAt]: now,
      [fields.error]: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { alreadyCompleted: false, latestAiAnalysisId: state.latestId };
  });
}

/** AI の生成回数の count() 集計（Q14）。日次上限は無くなった（K-25）。scripts/verify-firebase.ts とインデックスの結合テストが使う */
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
  /** 保存する種類（generated.analysisKind と同じでなければ例外） */
  readonly kind: AiAnalysisKind;
  readonly generated: AiGenerateResult;
  /** AiProvider.name（aiAnalyses.provider。AiGenerateResult には含まれないため呼び出し元が渡す。07 §5.1） */
  readonly provider: string;
  readonly reliability: number;
  readonly meta: RequestMeta;
}

/**
 * 成功時の保存。aiAnalyses（analysisKind はその種類）を作成し、同一バッチで results のその種類の項目を completed・理由 null・
 * 最新の分析の ID に更新し、auditLogs（result.ai_generate。details に kind）を追記する。organizationId / respondentId は
 * results 文書の値を写す（I-7、I-ai-1）。育成・定着の 8 項目と経年比較の前回は PR-7.10・PR-7.11b（それまで 3 項目は null）
 */
export async function saveAiAnalysis(
  input: SaveAiAnalysisInput,
): Promise<{ readonly aiAnalysisId: string }> {
  if (input.generated.analysisKind !== input.kind) {
    throw new RepositoryError("VALIDATION_ERROR", "生成結果の種類が保存する種類と一致しません", {
      paths: ["analysisKind"],
    });
  }
  const r = fromSnapshot(await resultsRef().doc(input.resultId).get(), toResult);
  if (!isVisible(r, input.viewer))
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  const fields = AI_KIND_FIELDS[input.kind];
  const ref = rawCollection(COLLECTIONS.aiAnalyses).doc();
  const data = validateForWrite(
    aiAnalysisCreateSchema,
    {
      organizationId: r.organizationId,
      resultId: r.id,
      respondentId: r.respondentId,
      analysisKind: input.kind,
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
      // 採用向けの組み合わせ（11-6 §3.2）。3 項目とも null
      trainingContext: null,
      previousResultId: null,
      usedTrainingAction: null,
    },
    "aiAnalyses",
  );
  const stamp = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.create(ref, { ...data, createdAt: stamp, updatedAt: stamp });
  batch.update(rawCollection(COLLECTIONS.results).doc(r.id), {
    [fields.status]: "completed",
    [fields.error]: null,
    [fields.latestId]: ref.id,
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
      kind: input.kind,
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

/**
 * 失敗時。results のその種類の項目を failed・理由 = reason に更新し、auditLogs（result.ai_generate。details に kind）を
 * 追記する
 */
export async function markAiGenerationFailed(input: {
  readonly resultId: string;
  readonly viewer: Viewer;
  readonly kind: AiAnalysisKind;
  readonly reason: string;
  readonly meta: RequestMeta;
}): Promise<void> {
  if (!/^[a-z_]{1,50}$/.test(input.reason)) {
    throw new RepositoryError("VALIDATION_ERROR", "失敗理由の形式が不正です");
  }
  const r = fromSnapshot(await resultsRef().doc(input.resultId).get(), toResult);
  if (!isVisible(r, input.viewer))
    throw new RepositoryError("RESULT_NOT_FOUND", "診断結果が見つかりません");
  const fields = AI_KIND_FIELDS[input.kind];
  const batch = db().batch();
  batch.update(rawCollection(COLLECTIONS.results).doc(r.id), {
    [fields.status]: "failed",
    [fields.error]: input.reason,
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
    details: { status: "failed", kind: input.kind, reason: input.reason },
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent,
  });
  await batch.commit();
}

/**
 * results の可視性を継承する（呼び出し元が getResult() 済み）。resultId・organizationId・analysisKind（種類）の一致を検証する
 * （違えば AI_ANALYSIS_MISMATCH。11-6 §3.7.9）
 */
export async function getAiAnalysis(input: {
  readonly aiAnalysisId: string;
  readonly resultId: string;
  readonly organizationId: string;
  readonly kind: AiAnalysisKind;
}): Promise<AiAnalysis | null> {
  if (!docIdSchema.safeParse(input.aiAnalysisId).success) return null;
  const a = fromSnapshot(await aiAnalysesRef().doc(input.aiAnalysisId).get(), toAiAnalysis);
  if (!a) return null;
  if (
    a.resultId !== input.resultId ||
    a.organizationId !== input.organizationId ||
    a.analysisKind !== input.kind
  ) {
    throw new RepositoryError("AI_ANALYSIS_MISMATCH", "AI 解説の参照が不整合です");
  }
  return a;
}
