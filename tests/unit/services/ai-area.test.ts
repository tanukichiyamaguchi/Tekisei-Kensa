// M7-ai-01（11-6 §5.1。PR-7.9 の形）: visibleTabsOf（11-6 §2.2・§3.7.7、K-21）。表示上の役職が責任者の受験は採用向け・育成・定着を
// 出さない。経年比較のタブは PR-7.11a まで出さないので、責任者の受験は []、ほかは ["recruitment", "training"]（PR-7.11a で
// 責任者 → ["longitudinal"]、ほか → 3 つに改める）。種類ごとの版と有効かどうか（promptVersionOf・isAiKindEnabled。11-6 §2.7.4・
// §3.7.7）。buildAiArea は結合テスト（M7-ai-34）で確かめる。Emulator 不要
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Respondent, Result } from "@/lib/db/domain";
import { toRespondent } from "@/lib/db/mappers/documents";
import { toResult, toResultDocFields } from "@/lib/db/mappers/result";
import type { RespondentDoc, ResultDoc, StaffRole } from "@/lib/db/types";
import { scoreAnswers } from "@/lib/scoring/score";
import { isAiKindEnabled, promptVersionOf } from "@/lib/services/ai-analysis";
import { visibleTabsOf } from "@/lib/services/ai-area";
import { resetEnvCacheForTest } from "@/lib/utils/env";

import { cyclicAnswers } from "../scoring/helpers";

const NOW = Timestamp.fromMillis(1_790_000_000_000);

function resultOf(staffRole: StaffRole | null): Result {
  const doc: ResultDoc = {
    ...toResultDocFields(scoreAnswers(cyclicAnswers())),
    organizationId: "org1",
    respondentId: "resp1",
    sessionId: "sess1",
    respondentKind: staffRole === null ? "applicant" : "executive",
    teamCode: null,
    isExcluded: false,
    submittedAt: NOW,
    aiGenerationStatus: "not_generated",
    aiGenerationStartedAt: null,
    aiGenerationError: null,
    latestAiAnalysisId: null,
    employmentStatus: staffRole === null ? "candidate" : "employed",
    hiredOn: null,
    leftOn: null,
    staffRole,
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
  };
  return toResult("res1", doc);
}

function respondentOf(occupationCode: number): Respondent {
  const doc: RespondentDoc = {
    organizationId: "org1",
    kind: "applicant",
    name: "テストテスト 01",
    phoneNumber: "00000000000",
    occupationCode,
    diagnosisExperience: "first_time",
    teamCode: null,
    isExcluded: false,
    sessionId: "sess1",
    usageLogId: "log1",
    resultId: "res1",
    previousResultId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
  return toRespondent("resp1", doc);
}

describe("M7-ai-01 visibleTabsOf（PR-7.9 の形）", () => {
  it("表示上の役職が責任者の受験はタブが 0（役職 manager、役職 null で職業コード 10）", () => {
    expect(visibleTabsOf(resultOf("manager"), respondentOf(1))).toEqual([]);
    expect(visibleTabsOf(resultOf("manager"), respondentOf(10))).toEqual([]);
    expect(visibleTabsOf(resultOf(null), respondentOf(10))).toEqual([]);
  });

  it("ほか（役職 leader・staff、役職 null で職業コード 10 以外）は採用向けと育成・定着の 2 つ。役職が保存されていれば職業より優先", () => {
    for (const role of ["leader", "staff"] as const) {
      expect(visibleTabsOf(resultOf(role), respondentOf(1)), role).toEqual([
        "recruitment",
        "training",
      ]);
      // 職業が責任者でも、役職が保存されていれば役職で決まる（11-2 の effectiveStaffRole）
      expect(visibleTabsOf(resultOf(role), respondentOf(10)), `${role} 10`).toEqual([
        "recruitment",
        "training",
      ]);
    }
    for (const code of [1, 2, 7, 8, 9]) {
      expect(visibleTabsOf(resultOf(null), respondentOf(code)), String(code)).toEqual([
        "recruitment",
        "training",
      ]);
    }
  });
});

describe("promptVersionOf・isAiKindEnabled（PR-7.9: 採用向けだけが有効）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTest();
  });

  it("採用向けは AI_PROMPT_VERSION の版で有効。育成・定着と経年比較は版の環境変数がまだ無く null で無効（PR-7.10・PR-7.11b）", () => {
    const env = {
      NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-tekisei",
      NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      AI_PROVIDER: "stub",
      AI_MODEL: "claude-opus-5",
      AI_PROMPT_VERSION: "recruitment-v2",
      PDF_TOKEN_SECRET: "x".repeat(32),
      VERCEL: "",
      VERCEL_ENV: "",
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    resetEnvCacheForTest();
    expect(promptVersionOf("recruitment")).toBe("recruitment-v2");
    expect(promptVersionOf("training")).toBeNull();
    expect(promptVersionOf("longitudinal")).toBeNull();
    expect(isAiKindEnabled("recruitment")).toBe(true);
    expect(isAiKindEnabled("training")).toBe(false);
    expect(isAiKindEnabled("longitudinal")).toBe(false);
  });
});
