// 受検者 API の応答 Dto（04 §8.2）。受検者の氏名・電話番号・採点結果は返さない（要件定義書 §4）
import type { RespondentKind, SessionStatus } from "@/lib/db/types";
import { SCORED_QUESTION_COUNT } from "@/lib/masters/question-layout";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

/** 受検の設問数（Q1〜Q144） */
export const TOTAL_QUESTION_COUNT = SCORED_QUESTION_COUNT;

export interface ResumableSessionDto {
  readonly sessionId: string;
  readonly answeredCount: number;
}

export interface AssessmentLinkDto {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly kind: RespondentKind;
  /** 同一ブラウザで再開できる draft セッション（04 §4.1、D04-43）。無ければ null。個人情報は含めない */
  readonly resumable: ResumableSessionDto | null;
}

export interface SessionCreatedDto {
  readonly sessionId: string;
  readonly organizationId: string;
  readonly kind: RespondentKind;
  readonly status: SessionStatus;
  readonly tokenExpiresAt: string;
  readonly nextUrl: string;
}

export interface SessionStartedDto {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly tokenExpiresAt: string; // 延長後（D04-45）
}

export interface SavedAnswerDto {
  readonly questionNo: QuestionNo;
  readonly choiceCode: ChoiceCode;
}

export interface SessionProgressDto {
  readonly sessionId: string;
  readonly organizationName: string;
  readonly kind: RespondentKind;
  readonly status: SessionStatus;
  readonly startedAt: string | null;
  readonly lastSavedPageNo: number | null; // 通しページ番号 1〜20（02 D02-37）
  readonly answeredCount: number;
  readonly totalCount: typeof TOTAL_QUESTION_COUNT;
  /** questionNo 昇順（04 D04-44） */
  readonly answers: readonly SavedAnswerDto[];
  readonly tokenExpiresAt: string;
}

export interface AnswersSavedDto {
  readonly sessionId: string;
  readonly pageNo: number; // 1〜20（入力の pageNo をそのまま返す）
  readonly savedCount: number;
  readonly answeredCount: number;
  readonly totalCount: typeof TOTAL_QUESTION_COUNT;
  readonly lastSavedPageNo: number;
  readonly tokenExpiresAt: string;
}

export interface SessionSubmittedDto {
  readonly sessionId: string;
  readonly status: "submitted";
  readonly submittedAt: string;
  readonly nextUrl: string;
}

/** 受検者画面の URL（05 §1.1）。Dto の nextUrl に使う */
export const examUrls = {
  session: (sessionId: string) => `/exam/${sessionId}`,
  complete: (sessionId: string) => `/exam/${sessionId}/complete`,
} as const;
