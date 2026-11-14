// PDF 印刷用ページのデータ取得と認可（07 §9.4、04 §7.2）。管理者 Cookie を使わず、印刷トークンだけで認可する。
// Admin SDK はセキュリティルールの対象外のため、組織の一致と幹部の可視性はトークンから作った Viewer でリポジトリが判定する。
// AI 解説は PR-7.12（11-6 §2.12・§3.7.8 の loadPrintAiArea・PrintAiArea）まで、全画面の PDF に生成済みの採用向けだけを載せる
// （07 D07-15。責任者の受験は載せない: K-21）
import { buildAiArea, visibleTabsOf } from "./ai-area";
import { computeComparison } from "./comparison";
import type { RecruitmentAiDto } from "./dto/ai";
import type { ComparisonDto, ResultDetailDto } from "./dto/result";
import { ApiError } from "./errors";
import { comparisonScopeQuerySchema, docIdSchema, pdfModeSchema } from "./schemas/common";
import { type PdfTokenPayload, verifyPdfToken } from "@/lib/auth/pdf-token";
import type { Viewer } from "@/lib/auth/claims";
import { getRespondent } from "@/lib/db/repositories/respondents-repository";
import { getResult } from "@/lib/db/repositories/results-repository";
import { toScoreResult } from "@/lib/db/mappers/result";
import { type PdfSectionVisibility, visibilityForMode } from "@/lib/pdf/visibility";
import type { ComparisonScope } from "@/lib/scoring/types";

export interface PrintData {
  readonly detail: Omit<ResultDetailDto, "ai">;
  /** 全画面の PDF に載せる採用向けの AI 解説（載せないときは null。PR-7.12 で表示中のタブの PrintAiArea に置き換える） */
  readonly recruitmentAi: RecruitmentAiDto | null;
  readonly comparison: ComparisonDto | null;
  readonly mode: PdfTokenPayload["mode"];
  readonly visibility: PdfSectionVisibility;
}

/** 印刷用ページのクエリ（searchParams をそのまま受ける） */
export type PrintQuery = Readonly<Record<string, string | string[] | undefined>>;

function single(query: PrintQuery, key: string): string | undefined {
  const value = query[key];
  return Array.isArray(value) ? undefined : value;
}

function sameScope(a: ComparisonScope | null, b: ComparisonScope | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === "organization" || (b.kind === "team" && a.teamCode === b.teamCode);
}

/** クエリの scope / teamCode。形式不正は undefined（不一致として扱う） */
function parseQueryScope(query: PrintQuery): ComparisonScope | null | undefined {
  const scope = single(query, "scope");
  const teamCode = single(query, "teamCode");
  if (scope === undefined && teamCode === undefined) return null;
  const parsed = comparisonScopeQuerySchema.safeParse({
    scope,
    ...(teamCode === undefined ? {} : { teamCode }),
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * 認可に失敗した場合・対象が見えない場合はすべて null（ページは notFound() を返す。04 §7.2、08 I-47）。
 * (1) トークンの検証（署名・期限・形式）、(2) パスの resultId・クエリの mode / scope / teamCode とトークンの一致、
 * (3)(4) トークンの { adminUid, organizationId, role } を Viewer にしたリポジトリの可視性判定（adminUsers は再読しない）
 */
export async function loadPrintData(input: {
  readonly resultId: string;
  readonly query: PrintQuery;
  readonly now?: Date;
}): Promise<PrintData | null> {
  const now = input.now ?? new Date();
  const token = single(input.query, "token");
  if (!token || !docIdSchema.safeParse(input.resultId).success) return null;

  let payload: PdfTokenPayload;
  try {
    payload = verifyPdfToken(token, now);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
  if (payload.resultId !== input.resultId) return null;
  const mode = pdfModeSchema.safeParse(single(input.query, "mode"));
  if (!mode.success || mode.data !== payload.mode) return null;
  const queryScope = parseQueryScope(input.query);
  if (queryScope === undefined || !sameScope(queryScope, payload.scope)) return null;

  const viewer: Viewer = {
    uid: payload.adminUid,
    organizationId: payload.organizationId,
    role: payload.role,
  };
  const result = await getResult({ resultId: payload.resultId, viewer });
  if (!result) return null;
  const respondent = await getRespondent({ respondentId: result.respondentId, viewer });
  if (!respondent) return null;

  const visibility = visibilityForMode(
    payload.mode,
    visibleTabsOf(result, respondent).includes("recruitment") &&
      result.aiGenerationStatus === "completed",
  );
  // AI 解説は掲載するときだけ、採用向けの最新の分析だけを読む（restricted と責任者の受験は AI の文書を読まない。07 D07-15）
  const recruitmentAi = visibility.showAiAnalysis
    ? (await buildAiArea({ viewer, result, respondent }, { onlyKind: "recruitment" })).recruitment
    : null;

  let comparison: ComparisonDto | null = null;
  if (payload.scope) {
    try {
      comparison = await computeComparison(
        { organizationId: payload.organizationId, result, scope: payload.scope },
        now,
      );
    } catch (error) {
      // 発行後に母集団が 0 件になった場合など。PDF 生成は print_page_unavailable で失敗させる
      if (error instanceof ApiError) return null;
      throw error;
    }
  }

  return {
    detail: {
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
    },
    recruitmentAi,
    comparison,
    mode: payload.mode,
    visibility: {
      ...visibility,
      // 保存した出力が読めないとき（failed・internal_error）は載せない
      showAiAnalysis:
        visibility.showAiAnalysis &&
        recruitmentAi?.status === "completed" &&
        recruitmentAi.latest !== null,
    },
  };
}
