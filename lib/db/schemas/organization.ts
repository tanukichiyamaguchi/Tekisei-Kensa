import { z } from "zod";

import { sha256HexSchema, storedText, timestampSchema } from "./values";
import { TOKEN_PATTERN } from "@/lib/auth/random-token";

/** organizations の作成データ（createdAt / updatedAt はリポジトリが serverTimestamp で付ける。02 §3.1） */
export const organizationCreateSchema = z.strictObject({
  name: storedText(1, 200),
  code: storedText(1, 100).nullable(),
  customerNumber: storedText(1, 100).nullable(),
  inviteToken: z.string().regex(TOKEN_PATTERN), // 招待トークンの平文（K-30。11-8 §3.2）
  inviteTokenHash: sha256HexSchema,
  inviteTokenIssuedAt: timestampSchema,
  deletedAt: z.null(),
});
