// 結果詳細・比較・AI 解説の応答 Dto（04 §8.2）。指標キーは TraitKey 等の識別子のまま（04 D04-28）
import type { AiAnalysisOutput, AiGenerationStatus } from "@/lib/ai/types";
import type { DiagnosisExperience, RespondentKind } from "@/lib/db/types";
import type { ComparisonResult, ScoreResult, TeamCode } from "@/lib/scoring/types";

/** GET/POST …/ai-analysis（04 §5.9）。結果詳細にも resultId を除いた形で含める */
export interface AiAnalysisDto {
  readonly resultId: string;
  readonly status: AiGenerationStatus;
  readonly startedAt: string | null;
  readonly error: string | null;
  readonly latest: {
    readonly aiAnalysisId: string;
    readonly provider: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly generatedAt: string;
    readonly reliability: number;
    readonly output: AiAnalysisOutput;
  } | null;
}

/** GET /api/v1/admin/results/{resultId}（04 §5.4）。比較を除く全セクションをこの 1 応答で描画する */
export interface ResultDetailDto {
  readonly resultId: string;
  readonly respondent: {
    readonly respondentId: string;
    readonly name: string;
    readonly occupationCode: number;
    readonly kind: RespondentKind;
    readonly diagnosisExperience: DiagnosisExperience;
    readonly teamCode: TeamCode | null;
    readonly isExcluded: boolean;
  };
  readonly submittedAt: string;
  readonly scoringVersion: string;
  readonly scores: ScoreResult;
  readonly aiAnalysis: Omit<AiAnalysisDto, "resultId">;
}

/** GET /api/v1/admin/results/{resultId}/comparison（04 §5.5）。保存せず呼び出しごとに計算する */
export interface ComparisonDto extends ComparisonResult {
  readonly resultId: string;
  readonly scoringVersion: string;
  readonly includesSubject: boolean;
  readonly computedAt: string;
}
