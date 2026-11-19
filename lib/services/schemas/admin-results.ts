// 結果の AI 解説の生成の要求の本文（04 §5.9、11-6 §3.4・§3.5 の 1・§3.7.4）
import { z } from "zod";

import { trainingContextSchema } from "@/lib/db/schemas/training-context";

/**
 * 育成・定着の生成の要求（POST …/ai-analysis/training）。context の 8 項目はすべて必須で、各項目は選択肢のコード、context の中の
 * 余分なキーは拒否する（trainingContextSchema。違えば 422）。外側の本文の未知のキーは無視する（04 §2.3）。経年比較の要求の
 * longitudinalAiRequestSchema は PR-7.11b
 */
export const trainingAiRequestSchema = z.object({ context: trainingContextSchema });
