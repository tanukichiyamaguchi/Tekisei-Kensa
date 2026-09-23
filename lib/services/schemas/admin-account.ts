// アカウント変更の入力（04 §5.1）
import { z } from "zod";

import { requiredText } from "./common";

export const updateMeInputSchema = z
  .object({
    name: requiredText(100).optional(),
    email: z.email({ message: "メールアドレスの形式が正しくありません" }).max(254).optional(),
    // 8〜72 文字（06 §3.7）、英字と数字を含む（01 D01-10）。Admin SDK の updateUser には
    // Firebase コンソールのパスワード ポリシーが及ばないため、サーバの入力検証で課す
    password: z
      .string()
      .min(8, { message: "パスワードは 8 文字以上で入力してください" })
      .max(72, { message: "パスワードは 72 文字以内で入力してください" })
      .refine((s) => /[A-Za-z]/.test(s) && /[0-9]/.test(s), {
        message: "パスワードには英字と数字を含めてください",
      })
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
