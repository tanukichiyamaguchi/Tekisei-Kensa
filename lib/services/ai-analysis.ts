// AI 解説の種類ごとの生成と状態（11-6 §3.4・§3.5・§3.7.7。04 §5.9、§7.1。07 §6）。provider は生成のみを担い、状態の移り変わり・保存・
// 監査ログはここで行う。日次上限は無い（K-25。11-6 §2.10）。採用向けはいつも有効、育成・定着は AI_TRAINING_PROMPT_VERSION が
// 設定されているときだけ有効（本番・Preview では依頼主の確認の後に設定する。11-6 §2.7.4）。経年比較は PR-7.11b まで無効
// （promptVersionOf が null。生成の要求は 503 AI_KIND_DISABLED。前回の確かめと入力文は PR-7.11b）
import { buildAiArea } from "./ai-area";
import type { AiKindResponse } from "./dto/ai";
import { API_ERRORS, ApiError } from "./errors";
import { loadVisibleResult, resultNotFound } from "./result-detail";
import { trainingAiRequestSchema } from "./schemas/admin-results";
import { AiProviderError } from "@/lib/ai/errors";
import { buildAiAnalysisInput } from "@/lib/ai/input";
import { AI_MAX_TOKENS, type AiAnalysisKind } from "@/lib/ai/kinds";
import { getAiProvider } from "@/lib/ai/provider";
import type { AiGenerateResult, AiProvider, GenerateOptions } from "@/lib/ai/types";
import type { AdminContext } from "@/lib/auth/admin-context";
import { aiKindState } from "@/lib/db/ai-kind-fields";
import type { Respondent, Result } from "@/lib/db/domain";
import {
  markAiGenerationFailed,
  markAiGenerationStarted,
  saveAiAnalysis,
} from "@/lib/db/repositories/ai-analyses-repository";
import { getRespondent } from "@/lib/db/repositories/respondents-repository";
import { toScoreResult } from "@/lib/db/mappers/result";
import type { TrainingContext } from "@/lib/masters/training-context";
import { effectiveStaffRole } from "@/lib/presentation/employment";
import { serverEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";

/** 生成中の滞留とみなすまでの時間（04 D04-34） */
export const AI_STALE_AFTER_MS = 10 * 60 * 1000;
/** provider に渡す AbortSignal の期限（04 D04-38。maxDuration 300 秒の内側） */
export const AI_GENERATE_TIMEOUT_MS = 240_000;

/** service が付ける失敗理由（provider 以外の失敗。04 §5.9） */
export const AI_INTERNAL_ERROR = "internal_error";

/**
 * 種類の版（11-6 §3.7.7・§3.8）。採用向けは AI_PROMPT_VERSION（必須）。育成・定着は AI_TRAINING_PROMPT_VERSION で、未設定（空を
 * 含む）なら null（無効）。経年比較は版の環境変数がまだ無いので null（AI_LONGITUDINAL_PROMPT_VERSION は PR-7.11b が足す）。
 * 版が登録されていて種類が合い、本番・Preview では承認された版であることは、起動時の検証（lib/utils/env.ts）が確かめる
 */
export function promptVersionOf(kind: AiAnalysisKind): string | null {
  const env = serverEnv();
  switch (kind) {
    case "recruitment":
      return env.AI_PROMPT_VERSION;
    case "training":
      return env.AI_TRAINING_PROMPT_VERSION ?? null;
    case "longitudinal":
      return null;
  }
}

/** 生成できる設定か（11-6 §2.7.4）。採用向けは常に有効 */
export function isAiKindEnabled(kind: AiAnalysisKind): boolean {
  return promptVersionOf(kind) !== null;
}

function isStale(startedAt: Date | null, nowMs: number): boolean {
  return startedAt === null || nowMs - startedAt.getTime() >= AI_STALE_AFTER_MS;
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

/** 2. 対象の結果（閲覧範囲。見えなければ 404）と受検者（氏名・職業） */
async function loadTarget(
  ctx: AdminContext,
  resultId: string,
): Promise<{ readonly result: Result; readonly respondent: Respondent }> {
  const result = await loadVisibleResult(ctx, resultId);
  const respondent = await getRespondent({ respondentId: result.respondentId, viewer: ctx });
  if (!respondent) throw resultNotFound();
  return { result, respondent };
}

/** 3. 採用向け・育成・定着は、表示上の役職が責任者の受験では使えない（409 AI_NOT_APPLICABLE。K-21、11-6 §2.2） */
function assertApplicable(result: Result, respondent: Respondent, kind: AiAnalysisKind): void {
  if (
    kind !== "longitudinal" &&
    effectiveStaffRole(result.staffRole, respondent.occupationCode) === "manager"
  ) {
    throw API_ERRORS.aiNotApplicable();
  }
}

/** 種類の応答（11-6 §3.6）。buildAiArea のその種類の分（その種類の分析だけを読む）に resultId と kind を付ける */
async function kindResponse(
  ctx: AdminContext,
  result: Result,
  respondent: Respondent,
  kind: AiAnalysisKind,
): Promise<AiKindResponse> {
  const area = await buildAiArea({ viewer: ctx, result, respondent }, { onlyKind: kind });
  switch (kind) {
    case "recruitment":
      if (area.recruitment === null) throw API_ERRORS.aiNotApplicable();
      return { resultId: result.id, kind, ...area.recruitment };
    case "training":
      if (area.training === null) throw API_ERRORS.aiNotApplicable();
      return { resultId: result.id, kind, ...area.training };
    case "longitudinal":
      return { resultId: result.id, kind, ...area.longitudinal };
  }
}

/** 失敗の記録。記録自体の失敗は握りつぶしてログだけ残す（generating のまま残っても滞留検知で failed に戻る。04 D04-34） */
async function recordFailure(
  ctx: AdminContext,
  resultId: string,
  kind: AiAnalysisKind,
  reason: string,
): Promise<void> {
  try {
    await markAiGenerationFailed({ resultId, viewer: ctx, kind, reason, meta: ctx.request });
  } catch (error) {
    logger.error("ai.mark_failed_failed", {
      resultId,
      kind,
      reason,
      errorName: error instanceof Error ? error.constructor.name : typeof error,
    });
  }
}

/** GET …/ai-analysis/{kind}（11-6 §3.5）。生成中の滞留（10 分超）を見つけたら failed（timeout）に戻してから返す */
export async function getAiState(
  ctx: AdminContext,
  resultId: string,
  kind: AiAnalysisKind,
): Promise<AiKindResponse> {
  const target = await loadTarget(ctx, resultId);
  assertApplicable(target.result, target.respondent, kind);
  let { result } = target;
  const state = aiKindState(result, kind);
  if (state.status === "generating" && isStale(state.startedAt, Date.now())) {
    await markAiGenerationFailed({
      resultId,
      viewer: ctx,
      kind,
      reason: "timeout",
      meta: ctx.request,
    });
    result = await loadVisibleResult(ctx, resultId);
  }
  return kindResponse(ctx, result, target.respondent, kind);
}

interface GenerationLog {
  readonly result: Result;
  readonly kind: AiAnalysisKind;
  readonly provider: AiProvider | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly startedAt: number;
}

/** 1 回の生成につき 1 行（07 §4.8、11-6 §2.16）。氏名・入力とプロンプトの中身・出力の中身・API キーは出さない */
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
    kind: log.kind,
    provider: log.provider?.name ?? null,
    model: log.model,
    promptVersion: log.promptVersion,
    maxTokens: AI_MAX_TOKENS[log.kind],
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

/**
 * 1. 要求の本文（11-6 §3.4・§3.5 の 1）。育成・定着は context の 8 項目（すべて必須・選択肢のコードだけ・context の中の余分なキーは
 * 拒否。外側の未知のキーは無視）で、形が違えば ZodError（http の toApiError が 422 VALIDATION_ERROR にする）。採用向けと経年比較は
 * 本文を読まない（経年比較の前回は PR-7.11b）
 */
function readTrainingContext(kind: AiAnalysisKind, body: unknown): TrainingContext | null {
  return kind === "training" ? trainingAiRequestSchema.parse(body).context : null;
}

/**
 * 9・10. 種類の入力を作り、provider を呼ぶ。採用向けは buildAiAnalysisInput のまま、育成・定着はそれに 8 項目のコードを足す
 * （11-6 §3.5 の 9。表示名への置き換えはプロンプトの組み立て）。経年比較の入力文は PR-7.11b（6 で 503 になり、ここには来ない）
 */
async function callProvider(
  provider: AiProvider,
  kind: AiAnalysisKind,
  target: { readonly result: Result; readonly respondent: Respondent },
  context: TrainingContext | null,
  options: GenerateOptions,
): Promise<AiGenerateResult> {
  const input = buildAiAnalysisInput({
    respondentName: target.respondent.name,
    occupationCode: target.respondent.occupationCode,
    score: toScoreResult(target.result),
  });
  switch (kind) {
    case "recruitment":
      return provider.generate(kind, input, options);
    case "training":
      // 1 で読んだ 8 項目（育成・定着では null にならない）
      if (context === null) throw new AiProviderError("config_error", "no context for training");
      return provider.generate(kind, { ...input, context }, options);
    case "longitudinal":
      throw new AiProviderError("config_error", `no input for ${kind}`);
  }
}

/**
 * POST …/ai-analysis/{kind}（同期方式。11-6 §3.5 の手順 1〜3・5〜13）。body は育成・定着の要求の本文（採用向けと経年比較は読まない）。
 * 生成済みで読めるなら、本文の 8 項目によらず保存済みを返す（作り直さない）
 */
export async function generateAi(
  ctx: AdminContext,
  resultId: string,
  kind: AiAnalysisKind,
  body: unknown,
): Promise<AiKindResponse> {
  // 1. 要求の本文（422 は 404・409 より先）
  const context = readTrainingContext(kind, body);
  // 2. 対象の結果と受検者
  const target = await loadTarget(ctx, resultId);
  const { result } = target;
  // 3. 責任者の受験の採用向け・育成・定着
  assertApplicable(result, target.respondent, kind);
  // （4. 経年比較の前回の確かめは PR-7.11b）
  // 5. 生成済みで最新の分析が読めるなら、保存済みを返す（作り直さない。読めなければ作り直す。11-6 §2.3.4）
  const state = aiKindState(result, kind);
  if (state.status === "completed") {
    const saved = await kindResponse(ctx, result, target.respondent, kind);
    if (saved.status === "completed") return saved;
  }
  // 6. 有効でない種類
  const promptVersion = promptVersionOf(kind);
  if (promptVersion === null) throw API_ERRORS.aiKindDisabled();
  // 7. 生成中（開始から 10 分未満）
  if (state.status === "generating" && !isStale(state.startedAt, Date.now())) {
    throw alreadyGenerating();
  }

  // 8. generating へ（トランザクション。二重起動は RepositoryError("AI_ALREADY_GENERATING") → 409）
  const started = await markAiGenerationStarted({
    resultId,
    viewer: ctx,
    kind,
    staleAfterMs: AI_STALE_AFTER_MS,
  });
  if (started.alreadyCompleted) {
    return kindResponse(ctx, await loadVisibleResult(ctx, resultId), target.respondent, kind);
  }

  // 9・10. 生成
  const env = serverEnv();
  const log: { -readonly [K in keyof GenerationLog]: GenerationLog[K] } = {
    result,
    kind,
    provider: null,
    model: env.AI_MODEL,
    promptVersion,
    startedAt: Date.now(),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_GENERATE_TIMEOUT_MS);
  let generated: AiGenerateResult;
  let provider: AiProvider;
  try {
    provider = getAiProvider();
    log.provider = provider;
    generated = await callProvider(provider, kind, target, context, {
      model: env.AI_MODEL,
      promptVersion,
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
    // 11. 失敗
    await recordFailure(ctx, resultId, kind, failure.reason);
    throw generationFailed(failure.reason);
  }
  clearTimeout(timer);

  // 12. 成功（aiAnalyses の作成・results のその種類の項目（育成・定着は 8 項目も）の更新・監査ログを 1 バッチ）
  try {
    await saveAiAnalysis({
      resultId,
      viewer: ctx,
      kind,
      generated,
      provider: provider.name,
      reliability: result.reliability,
      trainingContext: context,
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
      kind,
      errorName: error instanceof Error ? error.constructor.name : typeof error,
    });
    await recordFailure(ctx, resultId, kind, AI_INTERNAL_ERROR);
    throw generationFailed(AI_INTERNAL_ERROR);
  }
  logGeneration(log, { status: "completed", generated });
  // 13. 結果を読み直して返す
  return kindResponse(ctx, await loadVisibleResult(ctx, resultId), target.respondent, kind);
}
