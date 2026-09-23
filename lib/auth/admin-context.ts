// 管理者コンテキスト（04 §2.5.1）: セッション Cookie → カスタムクレーム → adminUsers 文書
import { canViewExecutives, parseAdminClaims } from "./claims";
import { metaFromHeaders, readCookie, type RequestMeta } from "./request-meta";
import { sessionCookieName, verifyAdminSessionCookie } from "./session-cookie";
import { COLLECTIONS } from "@/lib/db/collections";
import { getAdminUser } from "@/lib/db/repositories/admin-users-repository";
import type { AdminRole } from "@/lib/db/types";
import { writeAuditLog } from "@/lib/services/audit";
import { API_ERRORS } from "@/lib/services/errors";

export type { RequestMeta };

export interface AdminContext {
  readonly uid: string; // Firebase Auth の uid = adminUsers の文書 ID（00 D-22）
  readonly organizationId: string; // クレームの organizationId（文書と一致を確認済み）
  readonly role: AdminRole; // クレームの role
  readonly canViewExecutives: boolean;
  readonly email: string | null; // セッション Cookie の email クレーム
  readonly displayName: string; // adminUsers.displayName
  readonly request: RequestMeta;
}

async function resolveAdminContext(
  cookie: string | null,
  request: RequestMeta,
): Promise<AdminContext> {
  // 1〜2. Cookie の有無と検証（失効チェックあり）
  if (!cookie) throw API_ERRORS.unauthenticated();
  const decoded = await verifyAdminSessionCookie(cookie);
  if (!decoded) throw API_ERRORS.unauthenticated();
  // 3. クレームの形式
  const claims = parseAdminClaims(decoded);
  if (!claims) throw API_ERRORS.adminNotRegistered();
  // 4. adminUsers 文書（利用停止・削除の即時反映。クレームを正とする）
  const user = await getAdminUser(decoded.uid);
  if (!user) throw API_ERRORS.adminNotRegistered();
  if (user.organizationId !== claims.organizationId || user.role !== claims.role) {
    await writeAuditLog({
      organizationId: claims.organizationId,
      actorKind: "system",
      actorUid: null,
      actorRole: null,
      action: "admin.claims_mismatch",
      targetCollection: COLLECTIONS.adminUsers,
      targetId: decoded.uid,
      details: {
        claimRole: claims.role,
        docRole: user.role,
        organizationMatches: user.organizationId === claims.organizationId,
      },
      request,
    });
    throw API_ERRORS.adminNotRegistered();
  }
  if (user.isSuspended || user.deletedAt !== null) throw API_ERRORS.adminSuspended();
  // 5〜6
  return {
    uid: decoded.uid,
    organizationId: claims.organizationId,
    role: claims.role,
    canViewExecutives: canViewExecutives(claims.role),
    email: typeof decoded.email === "string" ? decoded.email : null,
    displayName: user.displayName,
    request,
  };
}

/**
 * Route Handler 用: Request の Cookie ヘッダーから解決する。
 * - Cookie なし・検証失敗・期限切れ・失効 → 401 UNAUTHENTICATED
 * - クレーム不正、adminUsers 文書なし、クレームとの不一致 → 403 ADMIN_NOT_REGISTERED
 * - isSuspended または deletedAt → 403 ADMIN_SUSPENDED
 */
export async function requireAdmin(request: Request, meta?: RequestMeta): Promise<AdminContext> {
  return resolveAdminContext(
    readCookie(request.headers, sessionCookieName()),
    meta ?? metaFromHeaders(request.headers),
  );
}

/** Server Component 用: next/headers の cookies() / headers() から解決する（判定は Request 版と同じ） */
export async function requireAdminFromCookies(): Promise<AdminContext> {
  const { cookies, headers } = await import("next/headers");
  const cookieStore = await cookies();
  const headerList = await headers();
  return resolveAdminContext(
    cookieStore.get(sessionCookieName())?.value ?? null,
    metaFromHeaders(headerList),
  );
}

/** owner / super_admin 以外なら 403 ROLE_REQUIRED */
export function requireOwner(ctx: AdminContext): AdminContext {
  if (ctx.role !== "owner" && ctx.role !== "super_admin") throw API_ERRORS.roleRequired();
  return ctx;
}
