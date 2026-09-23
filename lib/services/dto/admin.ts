// 管理者 API の応答 Dto（04 §8.2 のうち M2 で使うもの。残りは M4 で追加する）
import type { AdminRole } from "@/lib/db/types";

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
