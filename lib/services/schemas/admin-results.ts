// 回答一覧の URL のクエリと組織内分類のクエリ（04 §5.3、§5.7）。回答一覧・利用履歴の API はクエリを受け取らない（11-2 §3.5・§3.8）
import { z } from "zod";

import { pagingSchema, teamCodeSchema } from "./common";

/**
 * 今の回答一覧の画面（旧レイアウト）の URL のクエリ。PR-7.6 まで app/(admin)/admin/page.tsx が解釈に使い（不正は既定値）、
 * PR-7.6 で消す（11-2 §4.3）。API（GET /api/v1/admin/results）は使わない
 */
export const listResultsQuerySchema = pagingSchema.extend({
  q: z.string().trim().max(100).optional(),
  teamCode: z.union([teamCodeSchema, z.literal("none")]).optional(),
  excluded: z.enum(["all", "only", "none"]).default("all"),
  kind: z.enum(["applicant", "executive"]).optional(),
  sort: z.enum(["submittedAt", "name", "teamCode", "occupationCode"]).default("submittedAt"),
  order: z.enum(["asc", "desc"]).optional(),
});
export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>;

/** クエリ文字列の true / false（それ以外は 422） */
const queryBoolean = z.enum(["true", "false"]).transform((v) => v === "true");

export const classificationQuerySchema = z.object({
  includeExcluded: queryBoolean.default(true),
});
export type ClassificationQuery = z.infer<typeof classificationQuerySchema>;
