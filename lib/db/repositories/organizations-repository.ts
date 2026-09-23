// 組織（02 §3.1、§8.3）
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { addAuditLogToBatch } from "./audit-logs-repository";
import { issueInviteToken } from "@/lib/auth/invite-token";
import type { RequestMeta } from "@/lib/auth/claims";
import { COLLECTIONS, db, organizationsRef, rawCollection } from "@/lib/db/collections";
import type { Organization } from "@/lib/db/domain";
import { RepositoryError } from "@/lib/db/errors";
import { fromSnapshot, toOrganization } from "@/lib/db/mappers/documents";
import { organizationCreateSchema } from "@/lib/db/schemas/organization";
import { validateForWrite } from "@/lib/db/schemas/validate";

export interface CreateOrganizationInput {
  readonly name: string;
  readonly code: string | null;
  readonly customerNumber: string | null;
}
export interface CreatedOrganization {
  readonly organizationId: string;
  readonly inviteToken: string; // 平文。呼び出し元（scripts）が 1 回だけ表示する。保存しない
}

/** 組織を作成し、初回の招待トークンを発行する。auditLogs に organization.create（actorKind: system） */
export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreatedOrganization> {
  const ref = rawCollection(COLLECTIONS.organizations).doc();
  const invite = issueInviteToken();
  const data = validateForWrite(
    organizationCreateSchema,
    {
      name: input.name,
      code: input.code,
      customerNumber: input.customerNumber,
      inviteTokenHash: invite.tokenHash,
      inviteTokenIssuedAt: Timestamp.now(),
      deletedAt: null,
    },
    "organizations",
  );
  const batch = db().batch();
  batch.create(ref, {
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  addAuditLogToBatch(batch, {
    organizationId: ref.id,
    actorKind: "system",
    actorUid: null,
    actorRole: null,
    action: "organization.create",
    targetCollection: COLLECTIONS.organizations,
    targetId: ref.id,
    details: { hasCode: input.code !== null, hasCustomerNumber: input.customerNumber !== null },
    ipAddress: null,
    userAgent: null,
  });
  await batch.commit();
  return { organizationId: ref.id, inviteToken: invite.token };
}

/** deletedAt == null の組織を返す。無ければ null */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const org = fromSnapshot(await organizationsRef().doc(organizationId).get(), toOrganization);
  return org && org.deletedAt === null ? org : null;
}

/** 招待トークン（平文）のハッシュで組織を引く。無効・削除済みなら null（Q9） */
export async function findOrganizationByInviteTokenHash(
  inviteTokenHash: string,
): Promise<Organization | null> {
  const snapshot = await organizationsRef()
    .where("inviteTokenHash", "==", inviteTokenHash)
    .where("deletedAt", "==", null)
    .limit(1)
    .get();
  const doc = snapshot.docs[0];
  return doc ? toOrganization(doc.id, doc.data()) : null;
}

export interface RotateInviteTokenInput {
  readonly organizationId: string;
  readonly actor:
    | { readonly kind: "admin"; readonly uid: string; readonly role: "owner" | "super_admin" }
    | { readonly kind: "system" };
  readonly meta: RequestMeta | null;
}

/** 新しいトークンを生成し inviteTokenHash / inviteTokenIssuedAt を更新する。平文を返す（応答で 1 回だけ表示。D02-35） */
export async function rotateInviteToken(
  input: RotateInviteTokenInput,
): Promise<{ readonly inviteToken: string; readonly issuedAt: Date }> {
  const org = await getOrganization(input.organizationId);
  if (!org) throw new RepositoryError("ORGANIZATION_NOT_FOUND", "組織が見つかりません");
  const invite = issueInviteToken();
  const issuedAt = Timestamp.now();
  const batch = db().batch();
  batch.update(rawCollection(COLLECTIONS.organizations).doc(org.id), {
    inviteTokenHash: invite.tokenHash,
    inviteTokenIssuedAt: issuedAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  addAuditLogToBatch(batch, {
    organizationId: org.id,
    actorKind: input.actor.kind,
    actorUid: input.actor.kind === "admin" ? input.actor.uid : null,
    actorRole: input.actor.kind === "admin" ? input.actor.role : null,
    action: "organization.rotate_invite_token",
    targetCollection: COLLECTIONS.organizations,
    targetId: org.id,
    details: {},
    ipAddress: input.meta?.ipAddress ?? null,
    userAgent: input.meta?.userAgent ?? null,
  });
  await batch.commit();
  return { inviteToken: invite.token, issuedAt: issuedAt.toDate() };
}
