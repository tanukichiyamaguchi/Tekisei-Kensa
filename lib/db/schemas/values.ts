// 書き込み前検証（02 §2、§3）と API 入力検証（04 §2.3）が共有する値の制約。
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

/** コードポイント単位の文字数（02 §2、04 §2.1） */
export const cpLength = (s: string): number => Array.from(s).length;

/** Firestore の文書 ID・Firebase Auth の uid（英数字 1〜128 文字。04 §2.1） */
export const docIdSchema = z.string().regex(/^[A-Za-z0-9]{1,128}$/);

/** 保存用の文字列: 前後空白を除去済みで、空白のみでなく、min〜max 文字（コードポイント） */
export function storedText(min: number, max: number) {
  return z
    .string()
    .refine((s) => s === s.trim(), { message: "前後の空白を除去してください" })
    .refine((s) => cpLength(s) >= min && cpLength(s) <= max, {
      message: `${min}〜${max} 文字で指定してください`,
    });
}

export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const teamCodeSchema = z.string().regex(/^[A-Z]$/, { message: "チームは A〜Z です" });
// 職業コード 1〜8（lib/masters/occupations.ts。10 K-19）
export const occupationCodeSchema = z.number().int().min(1).max(8);
export const choiceCodeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const scoredQuestionNoSchema = z.number().int().min(1).max(144);
export const pageNoSchema = z.number().int().min(1).max(20);

/** answers map のキー（"1"〜"144"。先頭ゼロなし。02 §3.4） */
export const answerKeySchema = z.string().regex(/^(?:[1-9]\d?|1[0-3]\d|14[0-4])$/);

export const timestampSchema = z.custom<Timestamp>((v) => v instanceof Timestamp, {
  message: "Timestamp ではありません",
});
