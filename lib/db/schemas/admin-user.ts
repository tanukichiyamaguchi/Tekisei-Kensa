import { z } from "zod";

import { docIdSchema, storedText } from "./values";
import { ADMIN_ROLES } from "@/lib/db/types";

/** adminUsers の作成データ（02 §3.2）。displayName は空文字を許容する */
export const adminUserCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  role: z.enum(ADMIN_ROLES),
  displayName: z.union([z.literal(""), storedText(1, 100)]),
  isSuspended: z.literal(false),
  deletedAt: z.null(),
});

export const displayNameSchema = z.union([z.literal(""), storedText(1, 100)]);
