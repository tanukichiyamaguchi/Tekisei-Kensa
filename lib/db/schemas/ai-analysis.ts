import { z } from "zod";

import { docIdSchema } from "./values";

/**
 * aiAnalyses の作成データ（02 §3.6）。output の中身の検証は 07 の AiAnalysisOutputSchema が行う（M5）。
 * ここでは保存形の型だけを確認する
 */
export const aiAnalysisCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  resultId: docIdSchema,
  respondentId: docIdSchema,
  analysisKind: z.string().min(1).max(50),
  provider: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  promptVersion: z.string().min(1).max(50),
  output: z.record(z.string(), z.unknown()),
  rawText: z.string().min(1),
  usage: z
    .strictObject({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadInputTokens: z.number(),
      cacheCreationInputTokens: z.number(),
    })
    .nullable(),
  stopReason: z.string().nullable(),
  requestId: z.string().nullable(),
  status: z.literal("completed"),
  reliability: z.number().min(0).max(100),
  generatedBy: docIdSchema,
});
