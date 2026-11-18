// lib/db/ai-kind-fields.ts（11-6 §3.1 の種類と項目の対応 AI_KIND_FIELDS、§3.7.9 の aiKindState）。Emulator 不要
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { AI_ANALYSIS_KINDS } from "@/lib/ai/kinds";
import { AI_KIND_FIELDS, aiKindState } from "@/lib/db/ai-kind-fields";
import type { Result } from "@/lib/db/domain";
import { toResult, toResultDocFields } from "@/lib/db/mappers/result";
import type { ResultDoc } from "@/lib/db/types";
import { scoreAnswers } from "@/lib/scoring/score";

import { cyclicAnswers } from "../scoring/helpers";

const NOW = Timestamp.fromMillis(1_790_000_000_000);
const STARTED = Timestamp.fromMillis(1_790_000_123_000);

/** 3 種類の 12 項目をすべて持つ results 文書を読んだ Result */
function resultWith(overrides: Partial<ResultDoc> = {}): Result {
  const doc: ResultDoc = {
    ...toResultDocFields(scoreAnswers(cyclicAnswers())),
    organizationId: "org1",
    respondentId: "resp1",
    sessionId: "sess1",
    respondentKind: "applicant",
    teamCode: null,
    isExcluded: false,
    submittedAt: NOW,
    aiGenerationStatus: "not_generated",
    aiGenerationStartedAt: null,
    aiGenerationError: null,
    latestAiAnalysisId: null,
    employmentStatus: "candidate",
    hiredOn: null,
    leftOn: null,
    staffRole: null,
    previousResultId: null,
    trainingAiStatus: "not_generated",
    trainingAiStartedAt: null,
    trainingAiError: null,
    latestTrainingAiAnalysisId: null,
    trainingContext: null,
    longitudinalAiStatus: "not_generated",
    longitudinalAiStartedAt: null,
    longitudinalAiError: null,
    latestLongitudinalAiAnalysisId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
  return toResult("res1", doc);
}

describe("AI_KIND_FIELDS（11-6 §3.1 の種類と項目の対応）", () => {
  it("3 種類の 4 項目が表のとおり（採用向けは M7 より前の名前のまま）", () => {
    expect(AI_KIND_FIELDS).toEqual({
      recruitment: {
        status: "aiGenerationStatus",
        startedAt: "aiGenerationStartedAt",
        error: "aiGenerationError",
        latestId: "latestAiAnalysisId",
      },
      training: {
        status: "trainingAiStatus",
        startedAt: "trainingAiStartedAt",
        error: "trainingAiError",
        latestId: "latestTrainingAiAnalysisId",
      },
      longitudinal: {
        status: "longitudinalAiStatus",
        startedAt: "longitudinalAiStartedAt",
        error: "longitudinalAiError",
        latestId: "latestLongitudinalAiAnalysisId",
      },
    });
    expect(Object.keys(AI_KIND_FIELDS)).toEqual([...AI_ANALYSIS_KINDS]);
  });
});

describe("aiKindState（11-6 §3.7.9）", () => {
  const mixed = resultWith({
    aiGenerationStatus: "completed",
    latestAiAnalysisId: "aiRec1",
    trainingAiStatus: "failed",
    trainingAiError: "invalid_json",
    longitudinalAiStatus: "generating",
    longitudinalAiStartedAt: STARTED,
  });

  it("種類の 4 項目を読む（開始日時は Date）", () => {
    expect(aiKindState(mixed, "recruitment")).toEqual({
      status: "completed",
      startedAt: null,
      error: null,
      latestId: "aiRec1",
    });
    expect(aiKindState(mixed, "training")).toEqual({
      status: "failed",
      startedAt: null,
      error: "invalid_json",
      latestId: null,
    });
    expect(aiKindState(mixed, "longitudinal")).toEqual({
      status: "generating",
      startedAt: STARTED.toDate(),
      error: null,
      latestId: null,
    });
  });

  it("ほかの種類の項目を変えても、その種類の状態は変わらない", () => {
    const changedOthers: Record<(typeof AI_ANALYSIS_KINDS)[number], Partial<ResultDoc>> = {
      recruitment: {
        trainingAiStatus: "completed",
        latestTrainingAiAnalysisId: "aiTr9",
        longitudinalAiStatus: "failed",
        longitudinalAiError: "timeout",
      },
      training: {
        aiGenerationStatus: "failed",
        aiGenerationError: "timeout",
        latestAiAnalysisId: "aiRec9",
        longitudinalAiStatus: "completed",
        latestLongitudinalAiAnalysisId: "aiLo9",
      },
      longitudinal: {
        aiGenerationStatus: "generating",
        aiGenerationStartedAt: STARTED,
        trainingAiStatus: "generating",
        trainingAiStartedAt: STARTED,
      },
    };
    for (const kind of AI_ANALYSIS_KINDS) {
      const base = resultWith();
      const changed = resultWith(changedOthers[kind]);
      expect(aiKindState(changed, kind), kind).toEqual(aiKindState(base, kind));
    }
  });
});
