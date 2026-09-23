// アカウント変更の入力（04 §5.1）
import { z } from "zod";

import { requiredText } from "./common";

export const updateMeInputSchema = z
  .object({
    name: requiredText(100).optional(),
    email: z.email({ message: "メールアドレスの形式が正しくありません" }).max(254).optional(),
    password: z
      .string()
      .min(8, { message: "パスワードは 8 文字以上で入力してください" })
      .max(256)
      .optional(),
    reauthIdToken: z.string().min(1).max(4096).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.password !== undefined, {
    message: "変更する項目がありません",
  })
  .refine(
    (v) => (v.password === undefined && v.email === undefined) || v.reauthIdToken !== undefined,
    { path: ["reauthIdToken"], message: "現在のパスワードで再認証してください" },
  );
export type UpdateMeInput = z.infer<typeof updateMeInputSchema>;
