// カスタムクレームの型と取得（02 §9.2）。判定関数は純関数（Firebase への I/O なし）
import type { DecodedIdToken } from "firebase-admin/auth";

import { ADMIN_ROLES } from "@/lib/db/types";
import type { AdminRole } from "@/lib/db/types";

export interface AdminClaims {
  readonly organizationId: string;
  readonly role: AdminRole;
}
export interface Viewer extends AdminClaims {
  readonly uid: string;
}

/** リクエスト付帯情報（監査ログ用。04 の RequestMeta の部分集合。02 §8.1） */
export interface RequestMeta {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

/** organizationId（英数字 1〜128 文字）と role（3 値）を検証する。満たさなければ null */
export function parseAdminClaims(
  decoded: Pick<DecodedIdToken, "organizationId" | "role"> | Record<string, unknown>,
): AdminClaims | null {
  const organizationId = (decoded as Record<string, unknown>).organizationId;
  const role = (decoded as Record<string, unknown>).role;
  if (typeof organizationId !== "string" || !ORGANIZATION_ID_PATTERN.test(organizationId))
    return null;
  if (typeof role !== "string" || !(ADMIN_ROLES as readonly string[]).includes(role)) return null;
  return { organizationId, role: role as AdminRole };
}

/** owner / super_admin は幹部のデータを閲覧できる（00 §5、D-14） */
export function canViewExecutives(role: AdminRole): boolean {
  return role === "owner" || role === "super_admin";
}

/** 招待トークン再発行・管理者一覧（owner / super_admin） */
export function canManageOrganization(role: AdminRole): boolean {
  return role === "owner" || role === "super_admin";
}

export function toCustomClaims(claims: AdminClaims): { organizationId: string; role: AdminRole } {
  return { organizationId: claims.organizationId, role: claims.role };
}
