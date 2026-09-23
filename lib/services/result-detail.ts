// 結果詳細（04 §5.4）。results 1 文書 + respondents 1 文書 + 最新 aiAnalyses 1 文書（読み取り最大 3 回、HTTP 1 回）
import { writeAuditLog } from "./audit";
import type { AiAnalysisDto, ResultDetailDto } from "./dto/result";
import { ApiError } from "./errors";
import { assertVisibleToAdmin } from "./visibility";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import type { AiAnalysis, Result } from "@/lib/db/domain";
import { getAiAnalysis } from "@/lib/db/repositories/ai-analyses-repository";
import { getRespondent } from "@/lib/db/repositories/respondents-repository";
import { getResult } from "@/lib/db/repositories/results-repository";
import { toScoreResult } from "@/lib/db/mappers/result";
import { docIdSchema } from "@/lib/db/schemas/values";

export function resultNotFound(): ApiError {
  return new ApiError(404, "RESULT_NOT_FOUND", "診断結果が見つかりません");
}

/** 文書 ID の形式確認 → 可視性（組織一致・未削除・幹部の可視性）。見えなければ 404 RESULT_NOT_FOUND */
export async function loadVisibleResult(ctx: AdminContext, resultId: string): Promise<Result> {
  if (!docIdSchema.safeParse(resultId).success) {
    throw new ApiError(404, "NOT_FOUND", "指定されたリソースが見つかりません");
  }
  const result = await getResult({ resultId, viewer: ctx });
  // リポジトリ内の判定に加えた二重防御（04 §5 冒頭の 2・3）
  assertVisibleToAdmin(ctx, result && { ...result, kind: result.respondentKind }, resultNotFound);
  return result as Result;
}

/** AI 解説の状態と最新の本文（04 §5.9 の GET と同じ形） */
export function toAiAnalysisDto(result: Result, latest: AiAnalysis | null): AiAnalysisDto {
  return {
    resultId: result.id,
    status: result.aiGenerationStatus,
    startedAt: result.aiGenerationStartedAt?.toISOString() ?? null,
    error: result.aiGenerationError,
    latest: latest && {
      aiAnalysisId: latest.id,
      provider: latest.provider,
      model: latest.model,
      promptVersion: latest.promptVersion,
      generatedAt: latest.createdAt.toISOString(),
      reliability: latest.reliability,
      output: latest.output,
    },
  };
}

export async function getResultDetail(
  ctx: AdminContext,
  resultId: string,
): Promise<ResultDetailDto> {
  const result = await loadVisibleResult(ctx, resultId);
  const respondent = await getRespondent({ respondentId: result.respondentId, viewer: ctx });
  if (!respondent) throw resultNotFound();
  const latest =
    result.latestAiAnalysisId === null
      ? null
      : await getAiAnalysis({
          aiAnalysisId: result.latestAiAnalysisId,
          resultId: result.id,
          organizationId: ctx.organizationId,
        });
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "result.view",
    targetCollection: COLLECTIONS.results,
    targetId: result.id,
    details: {},
    request: ctx.request,
  });
  const ai = toAiAnalysisDto(result, latest);
  return {
    resultId: result.id,
    respondent: {
      respondentId: respondent.id,
      name: respondent.name,
      occupationCode: respondent.occupationCode,
      kind: respondent.kind,
      diagnosisExperience: respondent.diagnosisExperience,
      teamCode: respondent.teamCode,
      isExcluded: respondent.isExcluded,
    },
    submittedAt: result.submittedAt.toISOString(),
    scoringVersion: result.scoringVersion,
    scores: toScoreResult(result),
    aiAnalysis: {
      status: ai.status,
      startedAt: ai.startedAt,
      error: ai.error,
      latest: ai.latest,
    },
  };
}
