import { z } from "zod";

import { docIdSchema } from "./values";
import { ADMIN_ROLES, AUDIT_ACTOR_KINDS } from "@/lib/db/types";

const detailValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);

/** auditLogs の作成データ（02 §3.8）。details に個人情報を入れない（呼び出し元の責任。値の型だけ検証する） */
export const auditLogCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  actorKind: z.enum(AUDIT_ACTOR_KINDS),
  actorUid: docIdSchema.nullable(),
  actorRole: z.enum(ADMIN_ROLES).nullable(),
  action: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  targetCollection: z.string().min(1).nullable(),
  targetId: docIdSchema.nullable(),
  details: z.record(z.string(), detailValue),
  ipAddress: z.string().max(45).nullable(),
  userAgent: z.string().max(500).nullable(),
});
