// Firestore の保存形（02 §5.3）。Timestamp を含み、文書 ID は含まない。
import type { Timestamp } from "firebase-admin/firestore";

import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput, AiGenerationStatus, AiUsage } from "@/lib/ai/types";
import type { TrainingContext } from "@/lib/masters/training-context";
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
/** 区分（00 §1.8、11-2 §2.3）。受験のときは受検者区分から決める（applicant → candidate、executive → employed。K-28） */
export const EMPLOYMENT_STATUSES = ["candidate", "employed", "left"] as const; // 求職者・在籍・退職
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
/** 役職（00 §1.8、11-2 §2.3）。未設定は null */
export const STAFF_ROLES = ["manager", "leader", "staff"] as const; // 責任者・幹部・スタッフ
export type StaffRole = (typeof STAFF_ROLES)[number];
/** 新機能のお知らせのキー（出す順。11-8 §2.8.1） */
export const ANNOUNCEMENT_KEYS = ["employment_analysis", "ai_training", "ai_recruitment"] as const;
export type AnnouncementKey = (typeof ANNOUNCEMENT_KEYS)[number];

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
  readonly inviteToken: string; // 招待トークンの平文（K-30。11-8 §3.2）。M7 より前の文書には無い（読み取りで補う）
  readonly inviteTokenHash: string; // sha256 hex
  readonly inviteTokenIssuedAt: Timestamp;
}

export interface AdminUserDoc extends SoftDeletableDoc {
  readonly organizationId: string; // カスタムクレームと同じ値
  readonly role: AdminRole; // カスタムクレームと同じ値
  readonly displayName: string;
  readonly isSuspended: boolean;
  /** お知らせの既読（キー → 閉じた日時。11-8 §3.3）。M7 より前の文書には無い（読み取りで補う） */
  readonly dismissedAnnouncements: Readonly<Partial<Record<AnnouncementKey, Timestamp>>>;
}

export interface RespondentDoc extends SoftDeletableDoc {
  readonly organizationId: string;
  readonly kind: RespondentKind;
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationCode: number; // 新規は 1〜8・10（10 K-19・K-21）。K-19 より前の旧データは 9 もある
  readonly diagnosisExperience: DiagnosisExperience;
  readonly teamCode: TeamCode | null; // 正
  readonly isExcluded: boolean; // 正
  readonly sessionId: string;
  readonly usageLogId: string | null; // 利用履歴の ID か null（11-1 §3.2.1）
  readonly resultId: string | null;
  readonly previousResultId: string | null; // 前回の候補（11-1 §3.2.1）。M7 より前の文書には無い（null とみなす）
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
  readonly lastSavedStepNo: number | null; // 1〜4（参考の値。11-1 §3.2.2）。M7 より前の文書には無い（null とみなす）
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
  // 以下は M7 で足した項目。M7 より前の文書には無い（mapper が補う。02 §5.5）
  readonly employmentStatus: EmploymentStatus; // 区分（11-2 §3.1）
  readonly hiredOn: string | null; // 入社日。暦日 YYYY-MM-DD
  readonly leftOn: string | null; // 退職日。暦日 YYYY-MM-DD
  readonly staffRole: StaffRole | null; // 役職。未設定は null
  readonly previousResultId: string | null; // 前回の結果（11-7 §3.1）
  readonly trainingAiStatus: AiGenerationStatus; // 育成・定着の AI 解説（11-6 §3.1）
  readonly trainingAiStartedAt: Timestamp | null;
  readonly trainingAiError: string | null;
  readonly latestTrainingAiAnalysisId: string | null;
  readonly trainingContext: TrainingContext | null; // 生成に使った 8 項目
  readonly longitudinalAiStatus: AiGenerationStatus; // 経年比較の AI 解説（11-6 §3.1）
  readonly longitudinalAiStartedAt: Timestamp | null;
  readonly longitudinalAiError: string | null;
  readonly latestLongitudinalAiAnalysisId: string | null;
}

export interface AiAnalysisDoc extends BaseDoc {
  readonly organizationId: string;
  readonly resultId: string;
  readonly respondentId: string;
  readonly analysisKind: AiAnalysisKind;
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
  // 以下は M7 で足した項目（11-6 §3.2）。M7 より前の文書には無い（null とみなす）
  readonly trainingContext: TrainingContext | null; // 育成・定着は入力の 8 項目、経年比較は今回の 8 項目の写し
  readonly previousResultId: string | null; // 経年比較で生成に使った前回の結果
  readonly usedTrainingAction: boolean | null; // 経年比較で育成・定着の一手を入力に入れたか
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
export type {
  AiAnalysisKind,
  AiGenerationStatus,
  AptitudeKey,
  AptitudeTypeKey,
  SocialStyleKey,
  TeamCode,
  TrainingContext,
};
