// アカウント（04 §5.1、§5.2、§5.11）: GET/PATCH /me、ログイン記録、招待リンクの再発行、管理者一覧
import { appendAuditLogStrict } from "./audit";
import type { AdminUserListDto, InviteRotatedDto, MeDto, MeUpdatedDto } from "./dto/admin";
import { API_ERRORS, ApiError } from "./errors";
import type { UpdateMeInput } from "./schemas/admin-account";
import { getAdminEmails, updateAdminAuthUser } from "@/lib/auth/admin-accounts";
import { requireOwner, type AdminContext } from "@/lib/auth/admin-context";
import { inviteLink } from "@/lib/auth/invite-token";
import { revokeAdminSessions, verifyRecentIdToken } from "@/lib/auth/session-cookie";
import { COLLECTIONS } from "@/lib/db/collections";
import type { Organization } from "@/lib/db/domain";
import {
  listAdminUsers as listAdminUserDocs,
  updateAdminUserDisplayName,
} from "@/lib/db/repositories/admin-users-repository";
import {
  getOrganization,
  rotateInviteToken as rotateInviteTokenDocs,
} from "@/lib/db/repositories/organizations-repository";
import { appBaseUrl } from "@/lib/utils/env";

async function requireOrganization(ctx: AdminContext): Promise<Organization> {
  const org = await getOrganization(ctx.organizationId);
  // 組織が論理削除済み: 組織ごと停止している状態（画面は E-01）
  if (!org) throw API_ERRORS.adminSuspended();
  return org;
}

function toMeDto(
  ctx: AdminContext,
  org: Organization,
  override: { readonly name?: string; readonly email?: string | null } = {},
): MeDto {
  const base = appBaseUrl();
  const q = encodeURIComponent(org.id);
  return {
    adminUserId: ctx.uid,
    name: override.name ?? ctx.displayName,
    email: override.email === undefined ? ctx.email : override.email,
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

export async function getMe(ctx: AdminContext): Promise<MeDto> {
  return toMeDto(ctx, await requireOrganization(ctx));
}

function currentPasswordMismatch(): ApiError {
  return new ApiError(422, "CURRENT_PASSWORD_MISMATCH", "現在のパスワードが正しくありません");
}

/** ブラウザで現在のパスワードにより再認証して得た ID トークン（04 §5.1 D04-47 改）。uid 一致・auth_time 5 分以内 */
async function assertReauthenticated(ctx: AdminContext, reauthIdToken: string | undefined) {
  if (!reauthIdToken) throw currentPasswordMismatch();
  try {
    const decoded = await verifyRecentIdToken(reauthIdToken);
    if (decoded.uid !== ctx.uid) throw currentPasswordMismatch();
  } catch (error) {
    if (error instanceof ApiError && error.code === "ID_TOKEN_INVALID") {
      throw currentPasswordMismatch();
    }
    throw error;
  }
}

/**
 * 氏名・メールアドレス・パスワードの変更（04 §5.1）。メール・パスワードを変えたときは全セッションを失効させ、
 * 応答で reloginRequired: true を返す（Cookie の削除は Route Handler が行う）
 */
export async function updateMe(ctx: AdminContext, input: UpdateMeInput): Promise<MeUpdatedDto> {
  const org = await requireOrganization(ctx);
  const credentialsChanged = input.email !== undefined || input.password !== undefined;
  if (credentialsChanged) await assertReauthenticated(ctx, input.reauthIdToken);

  // 失敗し得る Firebase Auth の更新（重複メールの 409 など）を先に行い、氏名だけが変わる途中状態を作らない。
  // Firebase Auth の表示名はコンソールでの識別用に同期する（一覧の表示には使わない）
  await updateAdminAuthUser(ctx.uid, {
    displayName: input.name,
    email: input.email,
    password: input.password,
  });
  const fields: string[] = [];
  if (input.name !== undefined) {
    await updateAdminUserDisplayName({
      uid: ctx.uid,
      organizationId: ctx.organizationId,
      displayName: input.name,
    });
    fields.push("name");
  }
  if (input.email !== undefined) fields.push("email");
  if (input.password !== undefined) fields.push("password");

  // 値は入れず、変更した項目名だけを残す。セッションの失効より前に書く
  await appendAuditLogStrict({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "account.update",
    targetCollection: COLLECTIONS.adminUsers,
    targetId: ctx.uid,
    details: { fields },
    request: ctx.request,
  });
  if (credentialsChanged) await revokeAdminSessions(ctx.uid);

  return {
    ...toMeDto(ctx, org, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    }),
    reloginRequired: credentialsChanged,
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

/** 管理者追加用リンクの再発行（04 §5.2）。owner / super_admin のみ。平文のリンクはこの応答でだけ返す */
export async function rotateInviteToken(ctx: AdminContext): Promise<InviteRotatedDto> {
  requireOwner(ctx);
  const role = ctx.role === "super_admin" ? "super_admin" : "owner";
  const { inviteToken, issuedAt } = await rotateInviteTokenDocs({
    organizationId: ctx.organizationId,
    actor: { kind: "admin", uid: ctx.uid, role },
    meta: ctx.request,
  });
  return { adminInvite: inviteLink(appBaseUrl(), inviteToken), rotatedAt: issuedAt.toISOString() };
}

/** 同一組織の管理者一覧（04 §5.11）。owner / super_admin のみ。メールアドレスは Firebase Auth から引く */
export async function listAdminUsers(ctx: AdminContext): Promise<AdminUserListDto> {
  requireOwner(ctx);
  const users = await listAdminUserDocs(ctx.organizationId);
  const emails = await getAdminEmails(users.map((u) => u.id));
  const items = users.map((u) => ({
    adminUserId: u.id,
    name: u.displayName,
    email: emails.get(u.id) ?? null,
    role: u.role,
    isSuspended: u.isSuspended,
    createdAt: u.createdAt.toISOString(),
  }));
  return { items, total: items.length };
}
