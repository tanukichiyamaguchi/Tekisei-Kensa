// U-01 lib/db/mappers（02 §5.5、03 §5.9）と、M7 で足した項目の読み取りの補い（11-1 §3.2、11-2 §3.1、11-6 §3.1・§3.2、
// 11-7 §3.1、11-8 §3.2・§3.3。M7-misc-06・07）。Emulator 不要（Admin SDK の Timestamp は Node で生成できる）
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toAnswerMap, toAnswersField } from "@/lib/db/mappers/answers";
import {
  fromSnapshot,
  toAdminUser,
  toAiAnalysis,
  toAssessmentSession,
  toOrganization,
  toRespondent,
} from "@/lib/db/mappers/documents";
import {
  toPopulationMember,
  toResult,
  toResultDocFields,
  toScoreResult,
} from "@/lib/db/mappers/result";
import { MappingError, toDate, toNullableDate, toTimestamp } from "@/lib/db/mappers/timestamp";
import type {
  AdminUserDoc,
  AiAnalysisDoc,
  AssessmentSessionDoc,
  OrganizationDoc,
  RespondentDoc,
  ResultDoc,
} from "@/lib/db/types";
import { scoreAnswers } from "@/lib/scoring/score";
import { TRAIT_KEYS } from "@/lib/scoring/types";

import { cyclicAnswers, randomAnswers, seededRandom } from "../scoring/helpers";

const T06 = scoreAnswers(cyclicAnswers());

function resultDoc(overrides: Partial<ResultDoc> = {}): ResultDoc {
  const now = Timestamp.fromMillis(1_790_000_000_123);
  return {
    ...toResultDocFields(T06),
    organizationId: "org1",
    respondentId: "resp1",
    sessionId: "sess1",
    respondentKind: "applicant",
    teamCode: null,
    isExcluded: false,
    submittedAt: now,
    aiGenerationStatus: "not_generated",
    aiGenerationStartedAt: null,
    aiGenerationError: null,
    latestAiAnalysisId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as ResultDoc;
}

describe("ScoreResult ↔ results 文書", () => {
  it("T-06 の ScoreResult が往復で深い等価（キーは snake_case のまま、丸めなし）", () => {
    const fields = toResultDocFields(T06);
    expect(Object.keys(fields.traits)).toEqual([...TRAIT_KEYS]);
    expect(toScoreResult(fields)).toStrictEqual({ ...T06 });
  });

  it("乱数回答 50 件でも往復で深い等価（JSON 往復＝Firestore の倍精度 number と同じ表現）", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 50; i += 1) {
      const score = scoreAnswers(randomAnswers(random));
      const stored = JSON.parse(JSON.stringify(toResultDocFields(score))) as ReturnType<
        typeof toResultDocFields
      >;
      expect(toScoreResult(stored)).toStrictEqual({ ...score });
    }
  });

  it("toResultDocFields は凍結された map を複製して返す（Firestore に渡せる素の object）", () => {
    const fields = toResultDocFields(T06);
    expect(Object.isFrozen(fields.traits)).toBe(false);
    expect(fields.traits).not.toBe(T06.traits);
  });

  it("toResult は Timestamp を Date に、deletedAt: null を null のまま返す", () => {
    const r = toResult("res1", resultDoc());
    expect(r.id).toBe("res1");
    expect(r.submittedAt).toEqual(new Date(1_790_000_000_123));
    expect(r.deletedAt).toBeNull();
    expect(r.aiGenerationStartedAt).toBeNull();
    expect(r.traits).toStrictEqual(T06.traits);
  });

  it("指標のキー欠落・number 以外・不正な列挙値は MappingError", () => {
    const traits: Record<string, number> = { ...T06.traits };
    delete traits.deliberateness;
    expect(() =>
      toScoreResult({ ...toResultDocFields(T06), traits: traits as typeof T06.traits }),
    ).toThrow(MappingError);
    expect(() =>
      toScoreResult({
        ...toResultDocFields(T06),
        traits: { ...T06.traits, deliberateness: "15" as unknown as number },
      }),
    ).toThrow(MappingError);
    expect(() =>
      toScoreResult({
        ...toResultDocFields(T06),
        traits: { ...T06.traits, deliberateness: Number.NaN },
      }),
    ).toThrow(MappingError);
    expect(() =>
      toScoreResult({ ...toResultDocFields(T06), aptitudeType: "unknown" as "conductor" }),
    ).toThrow(MappingError);
    expect(() =>
      toResult("x", resultDoc({ submittedAt: undefined as unknown as Timestamp })),
    ).toThrow(MappingError);
  });

  it("toPopulationMember は traits と compatibility だけを返す", () => {
    const member = toPopulationMember(resultDoc());
    expect(Object.keys(member).sort()).toEqual(["compatibility", "traits"]);
    expect(member.traits).toStrictEqual(T06.traits);
    expect(member.compatibility).toStrictEqual(T06.compatibility);
  });
});

describe("Timestamp ↔ Date", () => {
  it("ミリ秒まで往復する", () => {
    const d = new Date(Date.UTC(2026, 8, 23, 1, 2, 3, 456));
    expect(toDate(toTimestamp(d), "x")).toEqual(d);
    expect(toNullableDate(null, "x")).toBeNull();
    expect(toNullableDate(toTimestamp(d), "x")).toEqual(d);
  });
  it("Timestamp 以外（Date、数値、undefined）は MappingError", () => {
    for (const v of [new Date(), 0, undefined, "2026-01-01"])
      expect(() => toDate(v, "x")).toThrow(MappingError);
    expect(() => toNullableDate(undefined, "x")).toThrow(MappingError);
  });
});

describe("回答 map（文字列キー ↔ 数値キー）", () => {
  it("往復で一致し、undefined の値は保存しない", () => {
    const field = toAnswersField({ 1: 1, 8: 5, 144: 3, 2: undefined });
    expect(field).toEqual({ "1": 1, "8": 5, "144": 3 });
    expect(toAnswerMap(field)).toEqual({ 1: 1, 8: 5, 144: 3 });
  });
});

describe("fromSnapshot", () => {
  it("存在しない文書は null、存在すれば id 付きで変換する", () => {
    const now = Timestamp.now();
    const doc: OrganizationDoc = {
      name: "テスト",
      code: null,
      customerNumber: null,
      inviteToken: "T".repeat(43),
      inviteTokenHash: "a".repeat(64),
      inviteTokenIssuedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const snap = (exists: boolean) =>
      ({
        exists,
        id: "org1",
        data: () => (exists ? doc : undefined),
      }) as unknown as DocumentSnapshot<OrganizationDoc>;
    expect(fromSnapshot(snap(false), toOrganization)).toBeNull();
    const org = fromSnapshot(snap(true), toOrganization);
    expect(org).toMatchObject({ id: "org1", name: "テスト", deletedAt: null });
  });
});

/** M7 で足した項目を消した文書（M7 より前の形） */
function withoutFields<T extends object>(doc: T, fields: readonly string[]): T {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !fields.includes(k))) as T;
}

const RESULT_M7_FIELDS = [
  "employmentStatus",
  "hiredOn",
  "leftOn",
  "staffRole",
  "previousResultId",
  "trainingAiStatus",
  "trainingAiStartedAt",
  "trainingAiError",
  "latestTrainingAiAnalysisId",
  "trainingContext",
  "longitudinalAiStatus",
  "longitudinalAiStartedAt",
  "longitudinalAiError",
  "latestLongitudinalAiAnalysisId",
] as const;

const VALID_CONTEXT = {
  tenure: "under_1y",
  evaluation: "above",
  expectedRole: "leader",
  recentState: "motivated",
  relationship: "good",
  wish: "expand_role",
  changeSinceJoining: "growing",
  concern: "none",
} as const;

describe("results の M7 の項目の読み取り（toResult。11-2 §3.1、11-7 §3.1、11-6 §3.1）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("項目の無い文書: 区分は受検者区分から（applicant → candidate、executive → employed）、入社日・退職日・役職は null", () => {
    const applicant = toResult("r1", withoutFields(resultDoc(), RESULT_M7_FIELDS));
    expect(applicant).toMatchObject({
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
    const executive = toResult(
      "r2",
      withoutFields(resultDoc({ respondentKind: "executive" }), RESULT_M7_FIELDS),
    );
    expect(executive).toMatchObject({
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
  });

  it("項目の無い文書: previousResultId は null、AI の 3 系統は not_generated と null", () => {
    const r = toResult("r1", withoutFields(resultDoc(), RESULT_M7_FIELDS));
    expect(r).toMatchObject({
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
    });
    // 採用向けの 4 項目は今のまま
    expect(r).toMatchObject({ aiGenerationStatus: "not_generated", latestAiAnalysisId: null });
  });

  it("値のある文書はそのまま（開始日時は Date に変える）", () => {
    const started = Timestamp.fromMillis(1_790_000_100_000);
    const r = toResult(
      "r1",
      resultDoc({
        employmentStatus: "left",
        hiredOn: "2024-04-01",
        leftOn: "2026-03-31",
        staffRole: "leader",
        previousResultId: "prev1",
        trainingAiStatus: "completed",
        trainingAiStartedAt: started,
        trainingAiError: null,
        latestTrainingAiAnalysisId: "ai1",
        trainingContext: VALID_CONTEXT,
        longitudinalAiStatus: "failed",
        longitudinalAiStartedAt: started,
        longitudinalAiError: "timeout",
        latestLongitudinalAiAnalysisId: null,
      }),
    );
    expect(r).toMatchObject({
      employmentStatus: "left",
      hiredOn: "2024-04-01",
      leftOn: "2026-03-31",
      staffRole: "leader",
      previousResultId: "prev1",
      trainingAiStatus: "completed",
      trainingAiStartedAt: new Date(1_790_000_100_000),
      latestTrainingAiAnalysisId: "ai1",
      trainingContext: VALID_CONTEXT,
      longitudinalAiStatus: "failed",
      longitudinalAiStartedAt: new Date(1_790_000_100_000),
      longitudinalAiError: "timeout",
    });
  });

  it("区分がある文書は、ほかの 3 つが無くても区分を補わない（ある値は検証しない）", () => {
    const r = toResult(
      "r1",
      withoutFields(resultDoc({ employmentStatus: "employed" }), [
        "hiredOn",
        "leftOn",
        "staffRole",
      ]),
    );
    expect(r).toMatchObject({
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
  });

  it("形の違う trainingContext は null になり、warn のログに results.training_context_invalid と resultId だけが出る", () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    const broken = { ...VALID_CONTEXT, tenure: "secret-tenure-value", extra: "secret-extra" };
    const r = toResult(
      "resBroken1",
      resultDoc({ trainingContext: broken as unknown as ResultDoc["trainingContext"] }),
    );
    expect(r.trainingContext).toBeNull();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "warn",
      message: "results.training_context_invalid",
      resultId: "resBroken1",
    });
    expect(Object.keys(entry).sort()).toEqual(["level", "message", "resultId", "time"]);
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("under_1y");
    // 正しい形・null・項目なしはログを出さない
    toResult("r2", resultDoc({ trainingContext: VALID_CONTEXT }));
    toResult("r3", resultDoc({ trainingContext: null }));
    toResult("r4", withoutFields(resultDoc(), ["trainingContext"]));
    expect(lines).toHaveLength(1);
  });
});

describe("respondents・assessmentSessions・aiAnalyses の M7 の項目の読み取り（11-1 §3.2、11-6 §3.2）", () => {
  const now = Timestamp.fromMillis(1_790_000_000_000);

  it("respondents: previousResultId の無い文書は null、ある値はそのまま。usageLogId は null も読める", () => {
    const doc: RespondentDoc = {
      organizationId: "org1",
      kind: "applicant",
      name: "テスト 太郎",
      phoneNumber: "00000000000",
      occupationCode: 10,
      diagnosisExperience: "first_time",
      teamCode: null,
      isExcluded: false,
      sessionId: "sess1",
      usageLogId: "log1",
      resultId: null,
      previousResultId: "prev1",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    expect(toRespondent("resp1", doc)).toMatchObject({
      previousResultId: "prev1",
      occupationCode: 10,
    });
    expect(
      toRespondent("resp1", withoutFields(doc, ["previousResultId"])).previousResultId,
    ).toBeNull();
    expect(toRespondent("resp1", { ...doc, usageLogId: null }).usageLogId).toBeNull();
    // usageLogId は今のまま必須（無い文書はデータ不整合）
    expect(() => toRespondent("resp1", withoutFields(doc, ["usageLogId"]))).toThrow(MappingError);
  });

  it("M7-exam-31 のうち mapper の分: lastSavedPageNo だけを持つ M7 より前のセッションは lastSavedStepNo == null", () => {
    const doc: AssessmentSessionDoc = {
      organizationId: "org1",
      respondentId: "resp1",
      status: "draft",
      sessionTokenHash: "b".repeat(64),
      tokenExpiresAt: now,
      answers: { "1": 3 },
      lastSavedPageNo: 1,
      lastSavedStepNo: 2,
      lastAnsweredAt: now,
      startedAt: now,
      submittedAt: null,
      resultId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const legacy = toAssessmentSession("sess1", withoutFields(doc, ["lastSavedStepNo"]));
    expect(legacy.lastSavedStepNo).toBeNull();
    expect(legacy.lastSavedPageNo).toBe(1);
    expect(toAssessmentSession("sess1", doc).lastSavedStepNo).toBe(2);
  });

  it("aiAnalyses: 3 項目の無い文書は null、ある値はそのまま", () => {
    const doc: AiAnalysisDoc = {
      organizationId: "org1",
      resultId: "res1",
      respondentId: "resp1",
      analysisKind: "longitudinal",
      provider: "stub",
      model: "claude-opus-5",
      promptVersion: "longitudinal-v1",
      output: {} as AiAnalysisDoc["output"],
      rawText: "{}",
      usage: null,
      stopReason: null,
      requestId: null,
      status: "completed",
      reliability: 80,
      generatedBy: "uid1",
      trainingContext: VALID_CONTEXT,
      previousResultId: "prev1",
      usedTrainingAction: true,
      createdAt: now,
      updatedAt: now,
    };
    expect(toAiAnalysis("ai1", doc)).toMatchObject({
      trainingContext: VALID_CONTEXT,
      previousResultId: "prev1",
      usedTrainingAction: true,
    });
    const legacy = toAiAnalysis(
      "ai1",
      withoutFields({ ...doc, analysisKind: "recruitment" as const }, [
        "trainingContext",
        "previousResultId",
        "usedTrainingAction",
      ]),
    );
    expect(legacy).toMatchObject({
      analysisKind: "recruitment",
      trainingContext: null,
      previousResultId: null,
      usedTrainingAction: null,
    });
  });
});

describe("M7-misc-06 toAdminUser の dismissedAnnouncements（11-8 §3.3）", () => {
  const now = Timestamp.fromMillis(1_790_000_000_000);
  const adminUserDoc = (dismissed: unknown): AdminUserDoc =>
    ({
      organizationId: "org1",
      role: "admin",
      displayName: "",
      isSuspended: false,
      dismissedAnnouncements: dismissed,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }) as AdminUserDoc;

  it("項目が無い・map でない（null・配列・文字・数値・Timestamp）ときは空", () => {
    const legacy = toAdminUser("u1", withoutFields(adminUserDoc({}), ["dismissedAnnouncements"]));
    expect(legacy.dismissedAnnouncements.size).toBe(0);
    for (const bad of [null, [], ["ai_training"], "ai_training", 1, now]) {
      expect(toAdminUser("u1", adminUserDoc(bad)).dismissedAnnouncements.size, String(bad)).toBe(0);
    }
    expect(toAdminUser("u1", adminUserDoc({})).dismissedAnnouncements.size).toBe(0);
  });

  it("知らないキーと Timestamp でない値は無視し、正しい値は日時（Date）に変える", () => {
    const at = Timestamp.fromMillis(1_790_000_500_000);
    const user = toAdminUser(
      "u1",
      adminUserDoc({
        ai_training: at,
        employment_analysis: "2026-11-09",
        ai_recruitment: 1_790_000_500_000,
        unknown_key: at,
      }),
    );
    expect([...user.dismissedAnnouncements.entries()]).toEqual([
      ["ai_training", new Date(1_790_000_500_000)],
    ]);
    const all = toAdminUser(
      "u1",
      adminUserDoc({ ai_recruitment: at, employment_analysis: at, ai_training: at }),
    );
    // 並びは ANNOUNCEMENT_KEYS（出す順）
    expect([...all.dismissedAnnouncements.keys()]).toEqual([
      "employment_analysis",
      "ai_training",
      "ai_recruitment",
    ]);
  });
});

describe("M7-misc-07 toOrganization の inviteToken（11-8 §3.2）", () => {
  const now = Timestamp.fromMillis(1_790_000_000_000);
  const TOKEN = "Abc_-0123456789".padEnd(43, "x");
  const organizationDoc = (inviteToken: unknown): OrganizationDoc =>
    ({
      name: "テストサロン",
      code: null,
      customerNumber: null,
      inviteToken,
      inviteTokenHash: "a".repeat(64),
      inviteTokenIssuedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }) as OrganizationDoc;

  it("正しい値（43 文字の A-Za-z0-9_-）はそのまま", () => {
    expect(TOKEN).toHaveLength(43);
    expect(toOrganization("org1", organizationDoc(TOKEN)).inviteToken).toBe(TOKEN);
  });

  it("無い・文字でない・形が違う（42 文字、44 文字、記号を含む）ときは null", () => {
    const legacy = withoutFields(organizationDoc(TOKEN), ["inviteToken"]);
    expect(toOrganization("org1", legacy).inviteToken).toBeNull();
    for (const bad of [
      TOKEN.slice(1),
      `${TOKEN}y`,
      `${TOKEN.slice(1)}+`,
      `${TOKEN.slice(1)}/`,
      "",
      null,
      43,
    ]) {
      expect(toOrganization("org1", organizationDoc(bad)).inviteToken, String(bad)).toBeNull();
    }
  });
});
