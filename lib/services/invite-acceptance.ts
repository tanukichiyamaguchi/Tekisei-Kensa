// 招待リンクによる管理者追加（04 §6.3、02 §9.7）
import type { InviteAcceptedDto } from "./dto/admin";
import { API_ERRORS } from "./errors";
import { firebaseErrorCode } from "./firebase-errors";
import type { AcceptInviteInput } from "./schemas/auth";
import {
  completeAdminAccount,
  createAdminAccount,
  findRecoverableUidByEmail,
} from "@/lib/auth/admin-accounts";
import { hashInviteToken, isInviteTokenFormat } from "@/lib/auth/invite-token";
import { safeEqualHex } from "@/lib/auth/random-token";
import type { RequestMeta } from "@/lib/auth/request-meta";
import type { Organization } from "@/lib/db/domain";
import { findOrganizationByInviteTokenHash } from "@/lib/db/repositories/organizations-repository";
import { errorFields, logger } from "@/lib/utils/logger";

async function organizationForToken(inviteToken: string): Promise<Organization | null> {
  if (!isInviteTokenFormat(inviteToken)) return null;
  const hash = hashInviteToken(inviteToken);
  const org = await findOrganizationByInviteTokenHash(hash);
  // クエリの等価条件で引いた後も定数時間で再照合する（04 §6.3 手順 1）
  return org && safeEqualHex(org.inviteTokenHash, hash) ? org : null;
}

/** サインアップ画面の事前検証（06 M-02）。例外を投げない */
export async function validateInviteToken(
  inviteToken: string,
): Promise<{ readonly organizationName: string } | null> {
  const org = await organizationForToken(inviteToken);
  return org ? { organizationName: org.name } : null;
}

export async function acceptInvite(
  input: AcceptInviteInput,
  meta: RequestMeta,
): Promise<InviteAcceptedDto> {
  const org = await organizationForToken(input.inviteToken);
  if (!org) throw API_ERRORS.inviteTokenInvalid();
  const account = {
    email: input.email,
    displayName: input.name,
    organizationId: org.id,
    role: "admin" as const,
    actorKind: "admin" as const,
    meta,
  };
  let uid: string;
  try {
    uid = (await createAdminAccount(account)).uid;
  } catch (error) {
    if (firebaseErrorCode(error) !== "auth/email-already-exists") {
      logger.error("invite.create_failed", {
        requestId: meta.requestId,
        organizationId: org.id,
        ...errorFields(error),
      });
      throw error;
    }
    // 途中失敗の回復（02 D02-40）: クレーム未設定かつ adminUsers 文書が無いユーザーに限り手順 2〜4 を再実行する
    const recoverable = await findRecoverableUidByEmail(input.email);
    if (!recoverable) throw API_ERRORS.emailAlreadyRegistered();
    try {
      await completeAdminAccount({ ...account, uid: recoverable });
    } catch (e) {
      logger.error("invite.complete_failed", {
        requestId: meta.requestId,
        uid: recoverable,
        ...errorFields(e),
      });
      throw e;
    }
    uid = recoverable;
  }
  logger.info("invite.accepted", {
    requestId: meta.requestId,
    organizationId: org.id,
    adminUid: uid,
  });
  return { organizationName: org.name, email: input.email, nextUrl: "/admin/login" };
}
