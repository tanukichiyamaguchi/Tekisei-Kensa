// AI 解説の生成と状態取得（04 §5.9、§7.1。07 §6）。provider は生成のみを担い、状態遷移・上限・保存・監査ログはここで行う
import type { AiAnalysisDto } from "./dto/result";
import { ApiError } from "./errors";
import { assertAiDailyLimit } from "./rate-limit";
import { loadVisibleResult, resultNotFound, toAiAnalysisDto } from "./result-detail";
import { AiProviderError } from "@/lib/ai/errors";
import { buildAiAnalysisInput } from "@/lib/ai/input";
import { getAiProvider } from "@/lib/ai/provider";
import type { AiGenerateResult, AiProvider } from "@/lib/ai/types";
import type { AdminContext } from "@/lib/auth/admin-context";
import type { Result } from "@/lib/db/domain";
import {
  getAiAnalysis,
  markAiGenerationFailed,
  markAiGenerationStarted,
  saveAiAnalysis,
} from "@/lib/db/repositories/ai-analyses-repository";
import { getRespondent } from "@/lib/db/repositories/respondents-repository";
import { toScoreResult } from "@/lib/db/mappers/result";
import { serverEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";

/** 生成中の滞留とみなすまでの時間（04 D04-34） */
export const AI_STALE_AFTER_MS = 10 * 60 * 1000;
/** provider に渡す AbortSignal の期限（04 D04-38。maxDuration 300 秒の内側） */
export const AI_GENERATE_TIMEOUT_MS = 240_000;

/** service が付ける失敗理由（provider 以外の失敗。04 §5.9） */
export const AI_INTERNAL_ERROR = "internal_error";

function isStale(result: Result, nowMs: number): boolean {
  return (
    result.aiGenerationStartedAt === null ||
    nowMs - result.aiGenerationStartedAt.getTime() >= AI_STALE_AFTER_MS
  );
}

function alreadyGenerating(): ApiError {
  return new ApiError(
    409,
    "AI_ALREADY_GENERATING",
    "AI 解説を生成中です。しばらくしてから再度お試しください",
  );
}

function generationFailed(reason: string): ApiError {
  return new ApiError(
    502,
    "AI_GENERATION_FAILED",
    "AI 解説の生成に失敗しました。再度お試しください",
    {
      reason,
    },
  );
}

async function toDto(ctx: AdminContext, result: Result): Promise<AiAnalysisDto> {
  const latest =
    result.latestAiAnalysisId === null
      ? null
      : await getAiAnalysis({
          aiAnalysisId: result.latestAiAnalysisId,
          resultId: result.id,
          organizationId: ctx.organizationId,
        });
  return toAiAnalysisDto(result, latest);
}

/** 失敗の記録。記録自体の失敗は握りつぶしてログだけ残す（generating のまま残っても滞留検知で failed に戻る。04 D04-34） */
async function recordFailure(ctx: AdminContext, resultId: string, reason: string): Promise<void> {
  try {
    await markAiGenerationFailed({ resultId, viewer: ctx, reason, meta: ctx.request });
  } catch (error) {
    logger.error("ai.mark_failed_failed", {
      resultId,
      reason,
      errorName: error instanceof Error ? error.constructor.name : typeof error,
    });
  }
}

/** GET …/ai-analysis。生成中の滞留（10 分超）を検知したら failed（timeout）に戻して返す */
export async function getAiAnalysisState(
  ctx: AdminContext,
  resultId: string,
): Promise<AiAnalysisDto> {
  let result = await loadVisibleResult(ctx, resultId);
  if (result.aiGenerationStatus === "generating" && isStale(result, Date.now())) {
    await markAiGenerationFailed({ resultId, viewer: ctx, reason: "timeout", meta: ctx.request });
    result = await loadVisibleResult(ctx, resultId);
  }
  return toDto(ctx, result);
}

interface GenerationLog {
  readonly result: Result;
  readonly provider: AiProvider | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly startedAt: number;
}

/** 1 回の生成につき 1 行（07 §4.8）。氏名・生テキスト・API キーは出さない */
function logGeneration(
  log: GenerationLog,
  outcome:
    | { readonly status: "completed"; readonly generated: AiGenerateResult }
    | {
        readonly status: "failed";
        readonly reason: string;
        readonly retryable: boolean;
        readonly requestId: string | null;
        /** 失敗の詳細（AiProviderError.message。例外クラス・HTTP ステータス・API のエラー本文。氏名は含まない） */
        readonly detail?: string | null;
      },
): void {
  const base = {
    resultId: log.result.id,
    organizationId: log.result.organizationId,
    provider: log.provider?.name ?? null,
    model: log.model,
    promptVersion: log.promptVersion,
    elapsedMs: Date.now() - log.startedAt,
  };
  if (outcome.status === "completed") {
    const { generated } = outcome;
    logger.info("ai.generate", {
      ...base,
      status: "completed",
      responseModel: generated.model,
      stopReason: generated.stopReason,
      aiRequestId: generated.requestId,
      inputTokens: generated.usage?.inputTokens ?? null,
      outputTokens: generated.usage?.outputTokens ?? null,
      cacheReadInputTokens: generated.usage?.cacheReadInputTokens ?? null,
      cacheCreationInputTokens: generated.usage?.cacheCreationInputTokens ?? null,
    });
  } else {
    logger.warn("ai.generate", {
      ...base,
      status: "failed",
      reason: outcome.reason,
      retryable: outcome.retryable,
      aiRequestId: outcome.requestId,
      detail: outcome.detail ?? null,
    });
  }
}

/** POST …/ai-analysis（同期方式。04 §5.9 の手順 1〜7） */
export async function generateAiAnalysis(
  ctx: AdminContext,
  resultId: string,
): Promise<AiAnalysisDto> {
  // 1. 対象結果と受検者（氏名・職業）
  const result = await loadVisibleResult(ctx, resultId);
  const respondent = await getRespondent({ respondentId: result.respondentId, viewer: ctx });
  if (!respondent) throw resultNotFound();

  // 2. 早期判定
  if (result.aiGenerationStatus === "completed") return toDto(ctx, result);
  if (result.aiGenerationStatus === "generating" && !isStale(result, Date.now())) {
    throw alreadyGenerating();
  }

  // 3. 日次上限
  await assertAiDailyLimit({ organizationId: ctx.organizationId, now: new Date() });

  // 4. generating へ（トランザクション。二重起動は RepositoryError("AI_ALREADY_GENERATING") → 409）
  const started = await markAiGenerationStarted({
    resultId,
    viewer: ctx,
    staleAfterMs: AI_STALE_AFTER_MS,
  });
  if (started.alreadyCompleted) return toDto(ctx, await loadVisibleResult(ctx, resultId));

  // 5. 生成
  const env = serverEnv();
  const log: { -readonly [K in keyof GenerationLog]: GenerationLog[K] } = {
    result,
    provider: null,
    model: env.AI_MODEL,
    promptVersion: env.AI_PROMPT_VERSION,
    startedAt: Date.now(),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_GENERATE_TIMEOUT_MS);
  let generated: AiGenerateResult;
  let provider: AiProvider;
  try {
    provider = getAiProvider();
    log.provider = provider;
    const input = buildAiAnalysisInput({
      respondentName: respondent.name,
      occupationCode: respondent.occupationCode,
      score: toScoreResult(result),
    });
    generated = await provider.generate(input, {
      model: env.AI_MODEL,
      promptVersion: env.AI_PROMPT_VERSION,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const failure =
      error instanceof AiProviderError
        ? { reason: error.reason, retryable: error.retryable, requestId: error.requestId }
        : { reason: AI_INTERNAL_ERROR, retryable: false, requestId: null };
    const detail =
      error instanceof AiProviderError
        ? error.message
        : error instanceof Error
          ? error.constructor.name
          : typeof error;
    logGeneration(log, { status: "failed", ...failure, detail });
    // 7. 失敗
    await recordFailure(ctx, resultId, failure.reason);
    throw generationFailed(failure.reason);
  }
  clearTimeout(timer);

  // 6. 成功（aiAnalyses の作成・results の更新・監査ログを 1 バッチ）
  try {
    await saveAiAnalysis({
      resultId,
      viewer: ctx,
      generated,
      provider: provider.name,
      reliability: result.reliability,
      meta: ctx.request,
    });
  } catch (error) {
    logGeneration(log, {
      status: "failed",
      reason: AI_INTERNAL_ERROR,
      retryable: false,
      requestId: generated.requestId,
    });
    logger.error("ai.save_failed", {
      resultId,
      errorName: error instanceof Error ? error.constructor.name : typeof error,
    });
    await recordFailure(ctx, resultId, AI_INTERNAL_ERROR);
    throw generationFailed(AI_INTERNAL_ERROR);
  }
  logGeneration(log, { status: "completed", generated });
  return toDto(ctx, await loadVisibleResult(ctx, resultId));
}
