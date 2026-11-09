import { z } from "zod";

import { docIdSchema, storedText } from "./values";
import { ADMIN_ROLES, ANNOUNCEMENT_KEYS } from "@/lib/db/types";

/** adminUsers の作成データ（02 §3.2）。displayName は空文字を許容する。お知らせの既読は作成のときは空だけ（11-8 §3.3） */
export const adminUserCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  role: z.enum(ADMIN_ROLES),
  displayName: z.union([z.literal(""), storedText(1, 100)]),
  isSuspended: z.literal(false),
  dismissedAnnouncements: z.strictObject({}),
  deletedAt: z.null(),
});

/** お知らせのキー（11-8 §3.3。既読の書き込みの前に確かめる） */
export const announcementKeySchema = z.enum(ANNOUNCEMENT_KEYS);

export const displayNameSchema = z.union([z.literal(""), storedText(1, 100)]);
