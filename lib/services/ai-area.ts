// AI 解説の領域のデータ（11-6 §3.7.7）。結果詳細（getResultDetail）・種類ごとの API（generateAi・getAiState）・印刷（print-data）が共用する。
// 読み取りは、受け取った結果・受検者と、採用向け・育成・定着の最新の分析（最大 2 文書）だけ。生成済みなのに保存した出力が読めない種類
// （最新の分析の ID が無い・文書が無い・参照が合わない・必須の項目が無い・スキーマに合わない）は failed・internal_error として返し
// （保存はしない）、ログ ai.output_unreadable を出す（11-6 §2.3.4・§2.16）。
// PR-7.9 の形: 経年比較のタブを出さず（PR-7.11a が visibleTabs の末尾に足す）、経年比較は状態だけを返す
import { isAiKindEnabled } from "./ai-analysis";
import type {
  AiAreaDto,
  AiKindStateDto,
  AiLatestDto,
  LongitudinalAiDto,
  RecruitmentAiDto,
  TrainingAiDto,
} from "./dto/ai";
import type { Viewer } from "@/lib/auth/claims";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { parseStoredAiOutput } from "@/lib/ai/schema";
import type { AiOutputByKind } from "@/lib/ai/types";
import { aiKindState } from "@/lib/db/ai-kind-fields";
import type { AiAnalysis, Respondent, Result } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { MappingError } from "@/lib/db/mappers/timestamp";
import { getAiAnalysis } from "@/lib/db/repositories/ai-analyses-repository";
import { effectiveStaffRole } from "@/lib/presentation/employment";
import { logger } from "@/lib/utils/logger";

export interface AiAreaSource {
  /** 画面は AdminContext、印刷はトークンの役割 */
  readonly viewer: Viewer;
  readonly result: Result;
  readonly respondent: Respondent;
}

const TABS_FOR_MANAGER: readonly AiAnalysisKind[] = [];
const TABS_FOR_OTHERS: readonly AiAnalysisKind[] = ["recruitment", "training"];

/**
 * 出すタブ（11-6 §2.2、K-21）。表示上の役職が責任者の受験は採用向け・育成・定着を出さない。経年比較のタブは PR-7.11a まで
 * 出さないので、PR-7.9 の責任者の受験はタブが 0 になる（11-6 §4.4）
 */
export function visibleTabsOf(result: Result, respondent: Respondent): readonly AiAnalysisKind[] {
  return effectiveStaffRole(result.staffRole, respondent.occupationCode) === "manager"
    ? TABS_FOR_MANAGER
    : TABS_FOR_OTHERS;
}

/** 種類の状態（results の 4 項目のうち状態・開始日時・理由と、生成できる設定か） */
function stateOf(result: Result, kind: AiAnalysisKind): AiKindStateDto {
  const state = aiKindState(result, kind);
  return {
    status: state.status,
    startedAt: state.startedAt?.toISOString() ?? null,
    error: state.error,
    enabled: isAiKindEnabled(kind),
  };
}

/**
 * 最新の分析の文書を読む。文書が無い・参照が合わない（AI_ANALYSIS_MISMATCH）・必須の項目が無い（MappingError）ときは null
 * （読めないものとして作り直せるようにする。結果詳細の全体を 500 にしない）
 */
async function readAnalysis(
  source: AiAreaSource,
  kind: AiAnalysisKind,
  aiAnalysisId: string,
): Promise<AiAnalysis | null> {
  try {
    return await getAiAnalysis({
      aiAnalysisId,
      resultId: source.result.id,
      organizationId: source.viewer.organizationId,
      kind,
    });
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "AI_ANALYSIS_MISMATCH") return null;
    if (error instanceof MappingError) return null;
    throw error;
  }
}

/**
 * 種類の最新の分析を読む。読めない（最新の分析の ID が無い・文書が無い・参照が合わない・必須の項目が無い・スキーマに合わない）
 * ときは null にして、ログ ai.output_unreadable（resultId・kind・aiAnalysisId・promptVersion だけ。読めた文書が無いときの
 * promptVersion は null）を出す
 */
async function readLatest<K extends AiAnalysisKind>(
  source: AiAreaSource,
  kind: K,
  aiAnalysisId: string | null,
): Promise<AiLatestDto<AiOutputByKind[K]> | null> {
  const analysis = aiAnalysisId === null ? null : await readAnalysis(source, kind, aiAnalysisId);
  const output = analysis === null ? null : parseStoredAiOutput(kind, analysis.output);
  if (analysis === null || output === null) {
    logger.warn("ai.output_unreadable", {
      resultId: source.result.id,
      kind,
      aiAnalysisId,
      promptVersion: analysis?.promptVersion ?? null,
    });
    return null;
  }
  return {
    aiAnalysisId: analysis.id,
    provider: analysis.provider,
    model: analysis.model,
    promptVersion: analysis.promptVersion,
    generatedAt: analysis.createdAt.toISOString(),
    reliability: analysis.reliability,
    output,
  };
}

/**
 * 採用向け・育成・定着の状態と最新の分析。生成済みで、読む種類（onlyKind が無いか、その種類）なら最新の分析を読む。読めなければ
 * （最新の分析の ID が無いときを含む）failed・internal_error・latest null。読まない種類は状態だけ（latest null）
 */
async function kindWithLatest<K extends "recruitment" | "training">(
  source: AiAreaSource,
  kind: K,
  readsLatest: boolean,
): Promise<AiKindStateDto & { readonly latest: AiLatestDto<AiOutputByKind[K]> | null }> {
  const state = stateOf(source.result, kind);
  if (state.status !== "completed" || !readsLatest) {
    return { ...state, latest: null };
  }
  const latest = await readLatest(source, kind, aiKindState(source.result, kind).latestId);
  return latest === null
    ? { ...state, status: "failed", error: "internal_error", latest: null }
    : { ...state, latest };
}

/**
 * AI 解説の領域（11-6 §3.6・§3.7.7）。visibleTabs に無い採用向け・育成・定着は null。onlyKind があれば、その種類の分析だけを読む
 * （ほかの種類は状態だけ）
 */
export async function buildAiArea(
  source: AiAreaSource,
  options: { readonly onlyKind?: AiAnalysisKind } = {},
): Promise<AiAreaDto> {
  const visibleTabs = visibleTabsOf(source.result, source.respondent);
  const readsLatest = (kind: AiAnalysisKind) =>
    options.onlyKind === undefined || options.onlyKind === kind;

  let recruitment: RecruitmentAiDto | null = null;
  if (visibleTabs.includes("recruitment")) {
    recruitment = await kindWithLatest(source, "recruitment", readsLatest("recruitment"));
  }
  let training: TrainingAiDto | null = null;
  if (visibleTabs.includes("training")) {
    const { latest, ...state } = await kindWithLatest(source, "training", readsLatest("training"));
    // 8 項目は生成済みで最新の分析が読めたときだけ（PR-7.9 は育成・定着の出力のスキーマが無く、いつも null。11-6 §3.6）
    training = {
      ...state,
      context: latest === null ? null : source.result.trainingContext,
      latest,
    };
  }
  const longitudinal: LongitudinalAiDto = stateOf(source.result, "longitudinal");
  return { visibleTabs, recruitment, training, longitudinal };
}
