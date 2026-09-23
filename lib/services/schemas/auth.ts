// 認証系の入力（04 §6）
import { z } from "zod";

import { requiredText } from "./common";

export const createSessionInputSchema = z.object({
  idToken: z.string().min(1).max(4096),
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const acceptInviteInputSchema = z.object({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, { message: "リンクが正しくありません" }),
  name: requiredText(100),
  email: z.email({ message: "メールアドレスの形式が正しくありません" }).max(254),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
