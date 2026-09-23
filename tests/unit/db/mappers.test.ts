// U-01 lib/db/mappers（02 §5.5、03 §5.9）。Emulator 不要（Admin SDK の Timestamp は Node で生成できる）
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { toAnswerMap, toAnswersField } from "@/lib/db/mappers/answers";
import { fromSnapshot, toOrganization } from "@/lib/db/mappers/documents";
import {
  toPopulationMember,
  toResult,
  toResultDocFields,
  toScoreResult,
} from "@/lib/db/mappers/result";
import { MappingError, toDate, toNullableDate, toTimestamp } from "@/lib/db/mappers/timestamp";
import type { OrganizationDoc, ResultDoc } from "@/lib/db/types";
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
