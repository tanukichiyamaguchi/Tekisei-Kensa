// 管理者 API の応答 Dto（04 §8.2）。AI 解説・結果詳細・比較は dto/result.ts
import type {
  AdminRole,
  DiagnosisExperience,
  EmploymentStatus,
  RespondentKind,
  StaffRole,
} from "@/lib/db/types";
import type { AptitudeTypeKey, SocialStyleKey, TeamCode } from "@/lib/scoring/types";

export interface MeDto {
  readonly adminUserId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: AdminRole;
  readonly canViewExecutives: boolean;
  readonly organization: {
    readonly organizationId: string;
    readonly name: string;
    readonly code: string | null;
    readonly customerNumber: string | null;
  };
  /** adminInvite は常に null（平文は再発行時の応答にだけ含まれる。04 §5.1 D04-56） */
  readonly links: {
    readonly applicant: string;
    readonly executive: string;
    readonly adminInvite: null;
    readonly adminInviteIssuedAt: string | null;
  };
}

export interface SessionCreatedDto {
  readonly expiresAt: string;
}

export interface InviteAcceptedDto {
  readonly organizationName: string;
  readonly email: string;
  readonly nextUrl: string;
}

/** PATCH /api/v1/admin/me（04 §5.1）。email / password を変更したときは reloginRequired が true でセッション Cookie は削除済み */
export interface MeUpdatedDto extends MeDto {
  readonly reloginRequired: boolean;
}

/** POST /api/v1/admin/organization/invite-token（04 §5.2）。平文のリンクはこの応答でだけ返す */
export interface InviteRotatedDto {
  readonly adminInvite: string;
  readonly rotatedAt: string;
}

/** GET /api/v1/admin/results（04 §5.3、11-2 §3.5）。クエリを受け取らず、閲覧範囲の全行を返す */
export interface ResultListDto {
  readonly generatedAt: string; // 基準時刻（ISO 8601。一覧のデータをサーバで読んだ時刻）
  readonly rows: readonly ResultListRowDto[]; // 代表の submittedAt の降順
}

/**
 * 回答一覧の 1 行（同じ人の受験をまとめた行。11-2 §2.2）。値は代表の受験とその受検者のもの。
 * 個人情報は代表の受検者の氏名・電話番号だけ（前回以前の受験の氏名・電話番号は返さない）。職業名は画面が引く
 */
export interface ResultListRowDto {
  readonly resultId: string; // 代表の受験
  readonly respondentId: string; // 代表の受検者（更新・削除に使う）
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationCode: number;
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
  readonly employmentStatus: EmploymentStatus;
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
  readonly staffRole: StaffRole | null;
  readonly aptitudeType: AptitudeTypeKey;
  readonly submittedAt: string;
  readonly exams: readonly ResultListExamDto[]; // つながり。[0] が代表
}

/** 行のつながりの受験 1 件（11-2 §3.5）。hasLongitudinalReport は「経年比較あり」（11-2 §2.9） */
export interface ResultListExamDto {
  readonly resultId: string;
  readonly respondentId: string;
  readonly submittedAt: string;
  readonly hasLongitudinalReport: boolean;
}

/** GET /api/v1/admin/admin-users（04 §5.11）。Auth に無い uid の email は null */
export interface AdminUserItemDto {
  readonly adminUserId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: AdminRole;
  readonly isSuspended: boolean;
  readonly createdAt: string;
}
export interface AdminUserListDto {
  readonly items: readonly AdminUserItemDto[];
  readonly total: number;
}

/**
 * PATCH /api/v1/admin/respondents/{respondentId}（04 §5.6、11-2 §3.6）。teamCode・isExcluded・employment・staffRole は
 * 更新したあとの代表の受験（行の代表）の値。送信前の受検者は resultIds が空で、employment・staffRole が null
 */
export interface PersonUpdatedDto {
  readonly respondentId: string; // パスの受検者
  readonly resultIds: readonly string[]; // 書いた範囲の受験（つながりの順）
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
  readonly employment: {
    readonly status: EmploymentStatus;
    readonly hiredOn: string | null;
    readonly leftOn: string | null;
  } | null;
  readonly staffRole: StaffRole | null;
  readonly isVisibleAfterUpdate: boolean; // 更新後も閲覧者に見えるか（オーナー以外が責任者・幹部にしたとき false）
  readonly updatedAt: string;
}

/** GET /api/v1/admin/classification（04 §5.7） */
export interface ClassificationMemberDto {
  readonly resultId: string;
  readonly respondentId: string;
  readonly name: string;
  readonly kind: RespondentKind;
  readonly isExcluded: boolean;
  readonly submittedAt: string;
}
export interface ClassificationDto {
  readonly total: number;
  readonly styles: ReadonlyArray<{
    readonly socialStyle: SocialStyleKey;
    readonly count: number;
    readonly types: ReadonlyArray<{
      readonly aptitudeType: AptitudeTypeKey;
      readonly count: number;
      readonly members: readonly ClassificationMemberDto[];
    }>;
  }>;
}

/** GET /api/v1/admin/usage-logs（04 §5.8、11-2 §3.8）。送信済みの全件（ページングなし）。total は items の件数 */
export interface UsageLogListDto {
  readonly items: readonly UsageLogItemDto[];
  readonly total: number;
}

/**
 * GET /api/v1/admin/usage-logs の 1 行（04 §5.8）。respondentId の null は将来の物理削除に備えた型。
 * submittedAt は送信済みだけを返すので常に値がある（型は今のまま）
 */
export interface UsageLogItemDto {
  readonly usageLogId: string;
  readonly respondentId: string | null;
  readonly resultId: string | null;
  readonly name: string;
  readonly phoneNumber: string;
  readonly kind: RespondentKind;
  readonly diagnosisExperience: DiagnosisExperience;
  readonly registeredAt: string;
  readonly submittedAt: string | null;
}
