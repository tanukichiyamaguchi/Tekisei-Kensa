// 組織内分類のクエリ（04 §5.7）。回答一覧・利用履歴の API はクエリを受け取らない（11-2 §3.5・§3.8）。
// 組織内分類の作り直し（11-3 の PR-7.7a）で classificationQuerySchema を消し、このファイルも消す
import { z } from "zod";

/** クエリ文字列の true / false（それ以外は 422） */
const queryBoolean = z.enum(["true", "false"]).transform((v) => v === "true");

export const classificationQuerySchema = z.object({
  includeExcluded: queryBoolean.default(true),
});
export type ClassificationQuery = z.infer<typeof classificationQuerySchema>;
