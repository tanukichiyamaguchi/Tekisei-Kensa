import { z } from "zod";

import {
  TRAINING_CONTEXT_ITEMS,
  TRAINING_CONTEXT_KEYS,
  type TrainingContextKey,
} from "@/lib/masters/training-context";

/** 項目の値: その項目の選択肢のコードのどれか */
function codeOf(key: TrainingContextKey): z.ZodType<string> {
  return z.enum(TRAINING_CONTEXT_ITEMS[key].options.map((o) => o.code));
}

/**
 * 育成・定着の 8 項目（11-6 §3.7.4）。8 つすべて必須、各項目は選択肢のコード、余分なキーは拒否。
 * results.trainingContext の読み取り、aiAnalyses の作成の検証、生成の要求の検証が使う
 */
export const trainingContextSchema = z.strictObject(
  Object.fromEntries(TRAINING_CONTEXT_KEYS.map((k) => [k, codeOf(k)])) as Record<
    TrainingContextKey,
    z.ZodType<string>
  >,
);
