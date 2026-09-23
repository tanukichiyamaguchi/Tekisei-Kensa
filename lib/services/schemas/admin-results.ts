// 回答一覧・組織内分類・利用履歴のクエリ（04 §5.3、§5.7、§5.8）
import { z } from "zod";

import { pagingSchema, teamCodeSchema } from "./common";

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

export const listUsageLogsQuerySchema = pagingSchema.extend({
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ListUsageLogsQuery = z.infer<typeof listUsageLogsQuerySchema>;
