// 作成の検証（02 §2・§3）のうち M7 で足した値と項目: M7-exam-01（職業コード）、M7-list-18（暦日）、
// results の区分・入社日・退職日・役職（11-2 §3.1）と AI の 3 系統（11-6 §3.1）、aiAnalyses の種類ごとの組み合わせ
// （11-6 §3.2）、M7-misc-08（組織の招待トークンと管理者の既読。11-8 §3.2・§3.3）、
// 受検セッションの lastSavedStepNo と利用履歴の作成（11-1 §3.2.2・§3.2.4）
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { toResultDocFields } from "@/lib/db/mappers/result";
import { adminUserCreateSchema, announcementKeySchema } from "@/lib/db/schemas/admin-user";
import { aiAnalysisCreateSchema } from "@/lib/db/schemas/ai-analysis";
import {
  answersPatchSchema,
  assessmentSessionCreateSchema,
  saveAnswersInputSchema,
} from "@/lib/db/schemas/assessment-session";
import { organizationCreateSchema } from "@/lib/db/schemas/organization";
import { resultCreateSchema } from "@/lib/db/schemas/result";
import { usageLogCreateSchema } from "@/lib/db/schemas/usage-log";
import {
  calendarDateSchema,
  occupationCodeSchema,
  stepNoSchema,
  storedOccupationCodeSchema,
} from "@/lib/db/schemas/values";
import { isValidCalendarDate } from "@/lib/presentation/employment";
import { scoreAnswers } from "@/lib/scoring/score";

import { cyclicAnswers } from "../scoring/helpers";

const pathsOf = (result: { success: boolean; error?: { issues: Array<{ path: unknown[] }> } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.path.join("."));

/** field を除いた作成データ（項目の無い作成データ） */
const without = (data: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== field));

describe("M7-exam-01 職業コードの検証（11-1 §3.5）", () => {
  it("occupationCodeSchema（新規の登録）は 1〜8・10 を通し、0・9・11・1.5・文字を拒む", () => {
    for (const ok of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      expect(occupationCodeSchema.safeParse(ok).success, String(ok)).toBe(true);
    }
    for (const bad of [0, 9, 11, 1.5, -1, "1", null]) {
      expect(occupationCodeSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  it("storedOccupationCodeSchema（保存済み）は 1〜10 を通し、0・11・1.5 を拒む", () => {
    for (let code = 1; code <= 10; code += 1) {
      expect(storedOccupationCodeSchema.safeParse(code).success, String(code)).toBe(true);
    }
    for (const bad of [0, 11, 1.5]) {
      expect(storedOccupationCodeSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe("M7-list-18 calendarDateSchema（11-2 §3.1）", () => {
  it("isValidCalendarDate と同じ判定（範囲の両端・うるう日・実在しない日・形の違い）", () => {
    for (const s of [
      "1900-01-01",
      "2100-12-31",
      "2024-02-29",
      "1899-12-31",
      "2101-01-01",
      "2026-02-30",
      "2025-02-29",
      "2026-1-01",
      "",
    ]) {
      expect(calendarDateSchema.safeParse(s).success, s).toBe(isValidCalendarDate(s));
    }
    expect(calendarDateSchema.safeParse("2024-02-29").success).toBe(true);
    expect(calendarDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(calendarDateSchema.safeParse(20240229).success).toBe(false);
  });
});

/** submitSession() が書く作成時の値（求職者） */
function resultCreation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...toResultDocFields(scoreAnswers(cyclicAnswers())),
    organizationId: "org1",
    respondentId: "resp1",
    sessionId: "sess1",
    respondentKind: "applicant",
    teamCode: null,
    isExcluded: false,
    submittedAt: Timestamp.now(),
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
    deletedAt: null,
    ...overrides,
  };
}

const VALID_CONTEXT = {
  tenure: "year_2",
  evaluation: "meets",
  expectedRole: "trainer",
  recentState: "low_energy",
  relationship: "specific_mismatch",
  wish: "skill_up",
  changeSinceJoining: "unchanged",
  concern: "few_reports",
};

describe("resultCreateSchema の区分・入社日・退職日・役職（11-2 §3.1）", () => {
  it("作成時の値（求職者は candidate、既存スタッフは employed と null 3 つ）を通す", () => {
    expect(resultCreateSchema.safeParse(resultCreation()).success).toBe(true);
    expect(
      resultCreateSchema.safeParse(
        resultCreation({ respondentKind: "executive", employmentStatus: "employed" }),
      ).success,
    ).toBe(true);
  });

  it("検証の列の規則に合う値は通す（退職と退職日、入社日 ≤ 退職日、役職の列挙）", () => {
    for (const ok of [
      { employmentStatus: "left", hiredOn: "2024-04-01", leftOn: "2026-03-31" },
      { employmentStatus: "left", hiredOn: "2026-03-31", leftOn: "2026-03-31" },
      { employmentStatus: "left", leftOn: "2026-03-31" },
      { employmentStatus: "employed", hiredOn: "2024-02-29" },
      { staffRole: "manager" },
      { staffRole: "leader" },
      { staffRole: "staff" },
    ]) {
      expect(resultCreateSchema.safeParse(resultCreation(ok)).success, JSON.stringify(ok)).toBe(
        true,
      );
    }
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["区分の値の外", { employmentStatus: "retired" }, "employmentStatus"],
    ["区分が null", { employmentStatus: null }, "employmentStatus"],
    ["実在しない入社日", { hiredOn: "2026-02-30" }, "hiredOn"],
    ["形の違う入社日", { hiredOn: "2026/04/01" }, "hiredOn"],
    ["範囲の外の退職日", { employmentStatus: "left", leftOn: "2101-01-01" }, "leftOn"],
    ["在籍のまま退職日がある", { employmentStatus: "employed", leftOn: "2026-03-31" }, "leftOn"],
    ["求職者のまま退職日がある", { leftOn: "2026-03-31" }, "leftOn"],
    [
      "退職日 < 入社日",
      { employmentStatus: "left", hiredOn: "2026-04-01", leftOn: "2026-03-31" },
      "leftOn",
    ],
    ["役職の値の外", { staffRole: "owner" }, "staffRole"],
  ])("%s は拒む", (_, overrides, path) => {
    expect(pathsOf(resultCreateSchema.safeParse(resultCreation(overrides)))).toContain(path);
  });

  it("4 項目のどれかが無い作成データは拒む（作成のときは必ず書く）", () => {
    for (const field of ["employmentStatus", "hiredOn", "leftOn", "staffRole"]) {
      expect(resultCreateSchema.safeParse(without(resultCreation(), field)).success, field).toBe(
        false,
      );
    }
  });
});

describe("resultCreateSchema の previousResultId（11-7 §3.1）と AI の 3 系統（11-6 §3.1）", () => {
  it("previousResultId は文書 ID か null。形の違う値・無い作成データは拒む", () => {
    expect(
      resultCreateSchema.safeParse(resultCreation({ previousResultId: "Res0000000001" })).success,
    ).toBe(true);
    expect(
      pathsOf(resultCreateSchema.safeParse(resultCreation({ previousResultId: "a/b" }))),
    ).toContain("previousResultId");
    expect(
      resultCreateSchema.safeParse(without(resultCreation(), "previousResultId")).success,
    ).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    ["育成・定着の状態が generating", { trainingAiStatus: "generating" }],
    ["育成・定着の状態が completed", { trainingAiStatus: "completed" }],
    ["育成・定着の開始日時", { trainingAiStartedAt: Timestamp.now() }],
    ["育成・定着の理由", { trainingAiError: "timeout" }],
    ["育成・定着の最新の分析", { latestTrainingAiAnalysisId: "Ai0000000001" }],
    ["8 項目", { trainingContext: VALID_CONTEXT }],
    ["経年比較の状態が generating", { longitudinalAiStatus: "generating" }],
    ["経年比較の状態の値の外", { longitudinalAiStatus: "unknown" }],
    ["経年比較の開始日時", { longitudinalAiStartedAt: Timestamp.now() }],
    ["経年比較の理由", { longitudinalAiError: "internal_error" }],
    ["経年比較の最新の分析", { latestLongitudinalAiAnalysisId: "Ai0000000002" }],
  ])("作成時の値でない %s は拒む", (_, overrides) => {
    const [field] = Object.keys(overrides);
    expect(pathsOf(resultCreateSchema.safeParse(resultCreation(overrides)))).toContain(field);
  });

  it("AI の 9 項目のどれかが無い作成データは拒む", () => {
    for (const field of [
      "trainingAiStatus",
      "trainingAiStartedAt",
      "trainingAiError",
      "latestTrainingAiAnalysisId",
      "trainingContext",
      "longitudinalAiStatus",
      "longitudinalAiStartedAt",
      "longitudinalAiError",
      "latestLongitudinalAiAnalysisId",
    ]) {
      expect(resultCreateSchema.safeParse(without(resultCreation(), field)).success, field).toBe(
        false,
      );
    }
  });
});

/** saveAiAnalysis() が書く作成データ（採用向け） */
function aiCreation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: "org1",
    resultId: "res1",
    respondentId: "resp1",
    analysisKind: "recruitment",
    provider: "stub",
    model: "claude-opus-5",
    promptVersion: "recruitment-v1",
    output: { summary: "要約" },
    rawText: "{}",
    usage: null,
    stopReason: "end_turn",
    requestId: null,
    status: "completed",
    reliability: 80,
    generatedBy: "uid1",
    trainingContext: null,
    previousResultId: null,
    usedTrainingAction: null,
    ...overrides,
  };
}

describe("aiAnalysisCreateSchema の種類ごとの組み合わせ（11-6 §3.2）", () => {
  it("種類ごとの正しい組み合わせを通す", () => {
    for (const ok of [
      {},
      { analysisKind: "training", promptVersion: "training-v1", trainingContext: VALID_CONTEXT },
      {
        analysisKind: "longitudinal",
        promptVersion: "longitudinal-v1",
        previousResultId: "Res0000000001",
        usedTrainingAction: false,
      },
      {
        analysisKind: "longitudinal",
        trainingContext: VALID_CONTEXT,
        previousResultId: "Res0000000001",
        usedTrainingAction: true,
      },
    ]) {
      expect(aiAnalysisCreateSchema.safeParse(aiCreation(ok)).success, JSON.stringify(ok)).toBe(
        true,
      );
    }
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["採用向けで 8 項目がある", { trainingContext: VALID_CONTEXT }, "trainingContext"],
    ["採用向けで前回の結果がある", { previousResultId: "Res0000000001" }, "previousResultId"],
    ["採用向けで一手の有無がある", { usedTrainingAction: false }, "usedTrainingAction"],
    ["育成・定着で 8 項目が null", { analysisKind: "training" }, "trainingContext"],
    [
      "育成・定着で前回の結果がある",
      {
        analysisKind: "training",
        trainingContext: VALID_CONTEXT,
        previousResultId: "Res0000000001",
      },
      "previousResultId",
    ],
    [
      "経年比較で前回の結果が null",
      { analysisKind: "longitudinal", usedTrainingAction: true },
      "previousResultId",
    ],
    [
      "経年比較で一手の有無が null",
      { analysisKind: "longitudinal", previousResultId: "Res0000000001" },
      "usedTrainingAction",
    ],
    [
      "経年比較で前回の結果が文書 ID の形でない",
      { analysisKind: "longitudinal", previousResultId: "a/b", usedTrainingAction: true },
      "previousResultId",
    ],
    ["種類の値の外", { analysisKind: "other" }, "analysisKind"],
    [
      "8 項目の形の違い",
      { analysisKind: "training", trainingContext: { ...VALID_CONTEXT, tenure: "x" } },
      "trainingContext.tenure",
    ],
  ])("%s は拒む", (_, overrides, path) => {
    expect(pathsOf(aiAnalysisCreateSchema.safeParse(aiCreation(overrides)))).toContain(path);
  });

  it("3 項目のどれかが無い作成データは拒む", () => {
    for (const field of ["trainingContext", "previousResultId", "usedTrainingAction"]) {
      expect(aiAnalysisCreateSchema.safeParse(without(aiCreation(), field)).success, field).toBe(
        false,
      );
    }
  });
});

describe("M7-misc-08 作成の検証（11-8 §3.2・§3.3）", () => {
  const TOKEN = "A".repeat(20) + "z".repeat(10) + "0123456789_-a"; // 43 文字の A-Za-z0-9_-
  const organization = (overrides: Record<string, unknown> = {}) => ({
    name: "テストサロン",
    code: null,
    customerNumber: null,
    inviteToken: TOKEN,
    inviteTokenHash: "a".repeat(64),
    inviteTokenIssuedAt: Timestamp.now(),
    deletedAt: null,
    ...overrides,
  });

  it("organizationCreateSchema は 43 文字の形の inviteToken を要る", () => {
    expect(TOKEN).toHaveLength(43);
    expect(organizationCreateSchema.safeParse(organization()).success).toBe(true);
    expect(
      pathsOf(organizationCreateSchema.safeParse(without(organization(), "inviteToken"))),
    ).toContain("inviteToken");
    for (const bad of [
      TOKEN.slice(1),
      `${TOKEN}a`,
      `${TOKEN.slice(1)}+`,
      `${TOKEN.slice(1)}=`,
      null,
    ]) {
      expect(
        pathsOf(organizationCreateSchema.safeParse(organization({ inviteToken: bad }))),
        String(bad),
      ).toContain("inviteToken");
    }
  });

  const adminUser = (overrides: Record<string, unknown> = {}) => ({
    organizationId: "org1",
    role: "admin",
    displayName: "",
    isSuspended: false,
    dismissedAnnouncements: {},
    deletedAt: null,
    ...overrides,
  });

  it("adminUserCreateSchema は dismissedAnnouncements: {} だけを許す（無い・キーがある・map でないと拒む）", () => {
    expect(adminUserCreateSchema.safeParse(adminUser()).success).toBe(true);
    expect(
      pathsOf(adminUserCreateSchema.safeParse(without(adminUser(), "dismissedAnnouncements"))),
    ).toContain("dismissedAnnouncements");
    for (const bad of [{ ai_training: Timestamp.now() }, { unknown_key: true }, null, []]) {
      expect(
        adminUserCreateSchema.safeParse(adminUser({ dismissedAnnouncements: bad })).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it("お知らせのキーは 3 つだけ（出す順）", () => {
    expect(announcementKeySchema.options).toEqual([
      "employment_analysis",
      "ai_training",
      "ai_recruitment",
    ]);
    expect(announcementKeySchema.safeParse("ai_recruitment").success).toBe(true);
    expect(announcementKeySchema.safeParse("other").success).toBe(false);
  });
});

describe("受検セッションの作成と保存の検証（11-1 §3.2.2）", () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    organizationId: "org1",
    respondentId: "resp1",
    status: "draft",
    sessionTokenHash: "a".repeat(64),
    tokenExpiresAt: Timestamp.now(),
    answers: {},
    lastSavedStepNo: null,
    lastAnsweredAt: null,
    startedAt: null,
    submittedAt: null,
    resultId: null,
    deletedAt: null,
    ...overrides,
  });

  it("assessmentSessionCreateSchema は lastSavedStepNo: null で通し、lastSavedPageNo を受け付けない（書かない。strict）", () => {
    expect(assessmentSessionCreateSchema.safeParse(session()).success).toBe(true);
    expect(
      assessmentSessionCreateSchema.safeParse(session({ lastSavedPageNo: null })).success,
    ).toBe(false);
    expect(
      pathsOf(assessmentSessionCreateSchema.safeParse(without(session(), "lastSavedStepNo"))),
    ).toContain("lastSavedStepNo");
    expect(assessmentSessionCreateSchema.safeParse(session({ lastSavedStepNo: 1 })).success).toBe(
      false,
    );
  });

  it("stepNoSchema と保存の lastSavedStepNo は 1〜4", () => {
    for (const n of [1, 2, 3, 4]) {
      expect(stepNoSchema.safeParse(n).success).toBe(true);
      expect(saveAnswersInputSchema.safeParse({ lastSavedStepNo: n }).success).toBe(true);
    }
    for (const n of [0, 5, 1.5, null]) {
      expect(stepNoSchema.safeParse(n).success).toBe(false);
      expect(saveAnswersInputSchema.safeParse({ lastSavedStepNo: n }).success).toBe(false);
    }
    expect(saveAnswersInputSchema.safeParse({ lastSavedPageNo: 1 }).success).toBe(false);
  });

  it("answersPatchSchema は 1 回の保存で 1〜41 問（42 問は拒む）", () => {
    const patch = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), 3]));
    expect(answersPatchSchema.safeParse(patch(41)).success).toBe(true);
    const tooMany = answersPatchSchema.safeParse(patch(42));
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0]?.message).toBe("1 回の保存の回答は 1〜41 問です");
  });
});

describe("usageLogCreateSchema（11-1 §3.2.4。利用履歴は送信のときに作る）", () => {
  const usageLog = (overrides: Record<string, unknown> = {}) => ({
    organizationId: "org1",
    respondentId: "resp1",
    resultId: "res1",
    respondentKind: "applicant",
    name: "見本 花子",
    phoneNumber: "０９０ーabc",
    diagnosisExperience: "first_time",
    registeredAt: Timestamp.now(),
    submittedAt: Timestamp.now(),
    ...overrides,
  });

  it("resultId・submittedAt を書いた作成データを通す（電話番号は前後の空白を除いた入力のまま）", () => {
    expect(usageLogCreateSchema.safeParse(usageLog()).success).toBe(true);
    expect(usageLogCreateSchema.safeParse(usageLog({ respondentKind: "executive" })).success).toBe(
      true,
    );
  });

  it("resultId・submittedAt の null と欠けを拒む", () => {
    for (const field of ["resultId", "submittedAt"]) {
      expect(pathsOf(usageLogCreateSchema.safeParse(usageLog({ [field]: null }))), field).toContain(
        field,
      );
      expect(pathsOf(usageLogCreateSchema.safeParse(without(usageLog(), field))), field).toContain(
        field,
      );
    }
    expect(pathsOf(usageLogCreateSchema.safeParse(usageLog({ resultId: "a/b" })))).toContain(
      "resultId",
    );
    expect(
      pathsOf(usageLogCreateSchema.safeParse(usageLog({ submittedAt: new Date() }))),
    ).toContain("submittedAt");
  });
});
