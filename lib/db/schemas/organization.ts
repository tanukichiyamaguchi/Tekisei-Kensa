import { z } from "zod";

import { sha256HexSchema, storedText, timestampSchema } from "./values";

/** organizations の作成データ（createdAt / updatedAt はリポジトリが serverTimestamp で付ける。02 §3.1） */
export const organizationCreateSchema = z.strictObject({
  name: storedText(1, 200),
  code: storedText(1, 100).nullable(),
  customerNumber: storedText(1, 100).nullable(),
  inviteTokenHash: sha256HexSchema,
  inviteTokenIssuedAt: timestampSchema,
  deletedAt: z.null(),
});
