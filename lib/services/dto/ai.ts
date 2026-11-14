// AI 解説の領域と種類ごとの API の応答 Dto（11-6 §3.6）。lib/db を読まない（型は lib/ai・lib/masters から）。
// PR-7.9 の形: 経年比較は状態だけ（前回・次の受験・受験回のつながり・レポートは PR-7.11a・PR-7.11b が足す）、育成・定着の出力の型は
// PR-7.10 が入れる（それまでは AiOutputByKind の never）
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput, AiGenerationStatus, AiOutputByKind } from "@/lib/ai/types";
import type { TrainingContext } from "@/lib/masters/training-context";

/** 種類ごとの状態。保存した出力が読めないときは status: "failed"・error: "internal_error" として返す */
export interface AiKindStateDto {
  readonly status: AiGenerationStatus;
  readonly startedAt: string | null;
  readonly error: string | null;
  /** 生成できる設定か（11-6 §2.7.4）。採用向けは常に true */
  readonly enabled: boolean;
}

export interface AiLatestDto<O> {
  readonly aiAnalysisId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly generatedAt: string; // 画面には出さない（ai-08）
  readonly reliability: number;
  readonly output: O;
}

export interface RecruitmentAiDto extends AiKindStateDto {
  readonly latest: AiLatestDto<AiAnalysisOutput> | null;
}

export interface TrainingAiDto extends AiKindStateDto {
  /** results.trainingContext（生成済みで最新の分析が読めたときだけ。PR-7.9 ではいつも null） */
  readonly context: TrainingContext | null;
  readonly latest: AiLatestDto<AiOutputByKind["training"]> | null;
}

/** 経年比較（PR-7.9 は状態だけ。access・current・previous・next・links・latest は PR-7.11a・PR-7.11b が足す） */
export type LongitudinalAiDto = AiKindStateDto;

export interface AiAreaDto {
  /** 出すタブ（11-6 §2.2）。PR-7.9 は経年比較のタブを出さず、責任者の受験は []（PR-7.11a から ["longitudinal"]） */
  readonly visibleTabs: readonly AiAnalysisKind[];
  /** visibleTabs に無い種類は null */
  readonly recruitment: RecruitmentAiDto | null;
  readonly training: TrainingAiDto | null;
  readonly longitudinal: LongitudinalAiDto;
}

/** GET・POST …/ai-analysis/{kind} の応答 */
export type AiKindResponse =
  | ({ readonly resultId: string; readonly kind: "recruitment" } & RecruitmentAiDto)
  | ({ readonly resultId: string; readonly kind: "training" } & TrainingAiDto)
  | ({ readonly resultId: string; readonly kind: "longitudinal" } & LongitudinalAiDto);
