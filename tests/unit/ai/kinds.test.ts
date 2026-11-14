// lib/ai/kinds.ts（11-6 §3.7.1）: 種類の判定と、種類ごとの出力の上限（K-25。M7-ai-18 の定数の分）
import { describe, expect, it } from "vitest";

import { AI_ANALYSIS_KINDS, AI_MAX_TOKENS, isAiAnalysisKind } from "@/lib/ai/kinds";

describe("isAiAnalysisKind", () => {
  it("3 つの種類の文字だけを真にする", () => {
    expect(AI_ANALYSIS_KINDS).toEqual(["recruitment", "training", "longitudinal"]);
    for (const kind of AI_ANALYSIS_KINDS) expect(isAiAnalysisKind(kind)).toBe(true);
  });

  it("大文字・空文字・ほかの語・文字でない値は偽", () => {
    for (const value of ["Recruitment", "", "foo", " training", null, undefined, 1, {}, []]) {
      expect(isAiAnalysisKind(value)).toBe(false);
    }
  });
});

describe("AI_MAX_TOKENS（K-25。11-6 §2.9）", () => {
  it("採用向け 16000・育成・定着 16000・経年比較 32000", () => {
    expect(AI_MAX_TOKENS).toEqual({ recruitment: 16000, training: 16000, longitudinal: 32000 });
  });
});
