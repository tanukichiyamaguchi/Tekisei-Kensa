import { z } from "zod";

import { trainingContextSchema } from "./training-context";
import { docIdSchema } from "./values";
import { AI_ANALYSIS_KINDS } from "@/lib/ai/kinds";

/**
 * aiAnalyses の作成データ（02 §3.6）。output の中身の検証は 07 の AiAnalysisOutputSchema が行う（M5）。
 * ここでは保存形の型と、種類ごとの 3 項目の組み合わせ（11-6 §3.2）を確認する
 */
export const aiAnalysisCreateSchema = z
  .strictObject({
    organizationId: docIdSchema,
    resultId: docIdSchema,
    respondentId: docIdSchema,
    analysisKind: z.enum(AI_ANALYSIS_KINDS),
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
    trainingContext: trainingContextSchema.nullable(),
    previousResultId: docIdSchema.nullable(),
    usedTrainingAction: z.boolean().nullable(),
  })
  .superRefine((v, ctx) => {
    // 種類ごとの組み合わせ（11-6 §3.2）。採用向けは 3 項目とも null。育成・定着は 8 項目があり、残りは null。
    // 経年比較は前回の結果（文書 ID）と一手の有無（真偽）が要り、8 項目は今回の写しか null
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const mustBeNull = (path: "trainingContext" | "previousResultId" | "usedTrainingAction") => {
      if (v[path] !== null) fail(path, "この種類の AI 解説では null です");
    };
    switch (v.analysisKind) {
      case "recruitment":
        mustBeNull("trainingContext");
        mustBeNull("previousResultId");
        mustBeNull("usedTrainingAction");
        break;
      case "training":
        if (v.trainingContext === null) fail("trainingContext", "育成・定着は 8 項目が要ります");
        mustBeNull("previousResultId");
        mustBeNull("usedTrainingAction");
        break;
      case "longitudinal":
        if (v.previousResultId === null) fail("previousResultId", "経年比較は前回の結果が要ります");
        if (v.usedTrainingAction === null) {
          fail("usedTrainingAction", "経年比較は育成・定着の一手の有無が要ります");
        }
        break;
    }
  });
