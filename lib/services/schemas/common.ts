// API 入力検証の共通スキーマ（04 §2.3）。値の制約は 02 の書き込み前検証と共有する
import { z } from "zod";

import {
  choiceCodeSchema,
  cpLength,
  docIdSchema,
  scoredQuestionNoSchema,
  teamCodeSchema,
} from "@/lib/db/schemas/values";
import type { ComparisonScope, TeamCode } from "@/lib/scoring/types";

export { choiceCodeSchema, docIdSchema, scoredQuestionNoSchema, teamCodeSchema };

/** 前後空白を除去し、空白のみを拒否する必須文字列 */
export const requiredText = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: "必須項目です" })
    .refine((s) => cpLength(s) <= max, { message: `${max} 文字以内で入力してください` });

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** 比較範囲のクエリ。ComparisonScope に変換する（04 §2.10 の推奨: transform で変換する） */
export const comparisonScopeQuerySchema = z
  .object({
    scope: z.enum(["organization", "team"]),
    teamCode: teamCodeSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "team" && v.teamCode === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["teamCode"],
        message: "scope=team のときは teamCode が必要です",
      });
    }
    if (v.scope === "organization" && v.teamCode !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["teamCode"],
        message: "scope=organization のときは teamCode を指定できません",
      });
    }
  })
  .transform((v): ComparisonScope =>
    v.scope === "team"
      ? { kind: "team", teamCode: v.teamCode as TeamCode }
      : { kind: "organization" },
  );

export const pdfModeSchema = z.enum(["full", "restricted"]);
