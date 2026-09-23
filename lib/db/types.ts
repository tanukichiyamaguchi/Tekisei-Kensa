// Firestore の保存形（02 §5.3）。Timestamp を含み、文書 ID は含まない。
import type { Timestamp } from "firebase-admin/firestore";

import type { AiAnalysisOutput, AiGenerationStatus, AiUsage } from "@/lib/ai/types";
import type {
  AptitudeKey,
  AptitudeTypeKey,
  ScoreResult,
  SocialStyleKey,
  TeamCode,
} from "@/lib/scoring/types";

/** 列挙値（00 §1.8、§5） */
export const ADMIN_ROLES = ["owner", "admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const RESPONDENT_KINDS = ["applicant", "executive"] as const;
export type RespondentKind = (typeof RESPONDENT_KINDS)[number];
export const DIAGNOSIS_EXPERIENCES = ["first_time", "experienced"] as const;
export type DiagnosisExperience = (typeof DIAGNOSIS_EXPERIENCES)[number];
export const SESSION_STATUSES = ["draft", "submitted"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const AUDIT_ACTOR_KINDS = ["admin", "respondent", "system"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];
export const AI_ANALYSIS_STATUSES = ["completed"] as const;
export type AiAnalysisStatus = (typeof AI_ANALYSIS_STATUSES)[number];

/** 監査フィールド（00 §2.1） */
export interface BaseDoc {
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
/** 論理削除を持つ文書。作成時に deletedAt: null を明示する */
export interface SoftDeletableDoc extends BaseDoc {
  readonly deletedAt: Timestamp | null;
}

export interface OrganizationDoc extends SoftDeletableDoc {
  readonly name: string;
  readonly code: string | null;
  readonly customerNumber: string | null;
  readonly inviteTokenHash: string; // sha256 hex
  readonly inviteTokenIssuedAt: Timestamp;
}

export interface AdminUserDoc extends SoftDeletableDoc {
  readonly organizationId: string; // カスタムクレームと同じ値
  readonly role: AdminRole; // カスタムクレームと同じ値
  readonly displayName: string;
  readonly isSuspended: boolean;
}

export interface RespondentDoc extends SoftDeletableDoc {
  readonly organizationId: string;
  readonly kind: RespondentKind;
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationCode: number; // 1〜8（10 K-19）
  readonly diagnosisExperience: DiagnosisExperience;
  readonly teamCode: TeamCode | null; // 正
  readonly isExcluded: boolean; // 正
  readonly sessionId: string;
  readonly usageLogId: string;
  readonly resultId: string | null;
}

/** answers の保存形。キーは "1"〜"144"、値は 1〜5（choice_code） */
export type AnswersField = Readonly<Record<string, number>>;

export interface AssessmentSessionDoc extends SoftDeletableDoc {
  readonly organizationId: string;
  readonly respondentId: string;
  readonly status: SessionStatus;
  readonly sessionTokenHash: string; // sha256 hex
  readonly tokenExpiresAt: Timestamp;
  readonly answers: AnswersField;
  readonly lastSavedPageNo: number | null; // 1〜20
  readonly lastAnsweredAt: Timestamp | null;
  readonly startedAt: Timestamp | null;
  readonly submittedAt: Timestamp | null;
  readonly resultId: string | null;
}

/** results 文書。指標部分は ScoreResult をそのまま含む（00 §2.1、§3.4） */
export interface ResultDoc extends SoftDeletableDoc, ScoreResult {
  readonly organizationId: string;
  readonly respondentId: string;
  readonly sessionId: string;
  readonly respondentKind: RespondentKind; // 複製
  readonly teamCode: TeamCode | null; // 複製
  readonly isExcluded: boolean; // 複製
  readonly submittedAt: Timestamp;
  readonly aiGenerationStatus: AiGenerationStatus;
  readonly aiGenerationStartedAt: Timestamp | null;
  readonly aiGenerationError: string | null; // AiFailureReason | "internal_error"
  readonly latestAiAnalysisId: string | null;
}

export interface AiAnalysisDoc extends BaseDoc {
  readonly organizationId: string;
  readonly resultId: string;
  readonly respondentId: string;
  readonly analysisKind: string; // "recruitment"
  readonly provider: string; // "anthropic" | "stub"
  readonly model: string;
  readonly promptVersion: string;
  readonly output: AiAnalysisOutput; // 付録D §2 のキーのまま
  readonly rawText: string;
  readonly usage: AiUsage | null;
  readonly stopReason: string | null;
  readonly requestId: string | null;
  readonly status: AiAnalysisStatus;
  readonly reliability: number;
  readonly generatedBy: string; // uid
}

export interface UsageLogDoc extends BaseDoc {
  readonly organizationId: string;
  readonly respondentId: string;
  readonly resultId: string | null;
  readonly respondentKind: RespondentKind; // 複製
  readonly name: string; // 複製
  readonly phoneNumber: string; // 複製
  readonly diagnosisExperience: DiagnosisExperience;
  readonly registeredAt: Timestamp;
  readonly submittedAt: Timestamp | null;
}

export type AuditDetailValue = string | number | boolean | null | readonly string[];
export type AuditDetails = Readonly<Record<string, AuditDetailValue>>;

export interface AuditLogDoc extends BaseDoc {
  readonly organizationId: string;
  readonly actorKind: AuditActorKind;
  readonly actorUid: string | null;
  readonly actorRole: AdminRole | null;
  readonly action: string; // 04 の AuditAction（02 §11）
  readonly targetCollection: string | null;
  readonly targetId: string | null;
  readonly details: AuditDetails;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** 参照用に再エクスポート（services が lib/scoring を直接 import しなくてよいように） */
export type { AiGenerationStatus, AptitudeKey, AptitudeTypeKey, SocialStyleKey, TeamCode };
