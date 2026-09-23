// アカウント（04 §5.1、§5.2）。M2 では GET /me と login-events を実装し、PATCH /me・再発行・管理者一覧は M4 で追加する
import { appendAuditLogStrict } from "./audit";
import type { MeDto } from "./dto/admin";
import { API_ERRORS } from "./errors";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import { appBaseUrl } from "@/lib/utils/env";

export async function getMe(ctx: AdminContext): Promise<MeDto> {
  const org = await getOrganization(ctx.organizationId);
  // 組織が論理削除済み: 組織ごと停止している状態（画面は E-01）
  if (!org) throw API_ERRORS.adminSuspended();
  const base = appBaseUrl();
  const q = encodeURIComponent(org.id);
  return {
    adminUserId: ctx.uid,
    name: ctx.displayName,
    email: ctx.email,
    role: ctx.role,
    canViewExecutives: ctx.canViewExecutives,
    organization: {
      organizationId: org.id,
      name: org.name,
      code: org.code,
      customerNumber: org.customerNumber,
    },
    links: {
      applicant: `${base}/exam?q=${q}&p=user`,
      executive: `${base}/exam?q=${q}&p=executives`,
      adminInvite: null,
      adminInviteIssuedAt: org.inviteTokenIssuedAt.toISOString(),
    },
  };
}

/** admin.login を 1 件記録する。それ以外の読み書きはしない（04 §5.1 D04-24） */
export async function recordLoginEvent(ctx: AdminContext): Promise<void> {
  await appendAuditLogStrict({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "admin.login",
    targetCollection: COLLECTIONS.adminUsers,
    targetId: ctx.uid,
    details: {},
    request: ctx.request,
  });
}
