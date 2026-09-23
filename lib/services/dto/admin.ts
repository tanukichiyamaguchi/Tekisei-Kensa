// 管理者 API の応答 Dto（04 §8.2）。AI 解説・結果詳細・比較は dto/result.ts
import type { AiGenerationStatus } from "@/lib/ai/types";
import type { AdminRole, DiagnosisExperience, RespondentKind } from "@/lib/db/types";
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

export interface PagedDto<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** GET /api/v1/admin/results の 1 行（04 §5.3）。職業名は画面が lib/masters/occupations.ts で引く */
export interface ResultListItemDto {
  readonly resultId: string;
  readonly respondentId: string;
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationCode: number;
  readonly kind: RespondentKind;
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
  readonly submittedAt: string;
  readonly aptitudeType: AptitudeTypeKey;
  readonly socialStyle: SocialStyleKey;
  readonly aiGenerationStatus: AiGenerationStatus;
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

/** PATCH /api/v1/admin/respondents/{respondentId}（04 §5.6） */
export interface RespondentUpdatedDto {
  readonly respondentId: string;
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
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

/** GET /api/v1/admin/usage-logs の 1 行（04 §5.8）。respondentId の null は将来の物理削除に備えた型 */
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
