// 採点のテスト T-01〜T-09b（03 §10.4〜§10.5）
import { describe, expect, it } from "vitest";

import { computeReliability } from "@/lib/scoring/compute-reliability";
import { InvalidAnswerMapError } from "@/lib/scoring/errors";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ChoiceCode, ScoreResult } from "@/lib/scoring/types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

import { cyclicAnswers, EPS, neutralCount, uniformAnswers, withOverrides } from "./helpers";

/** 全問同一回答の期待値（03 §10.4 の表。列は 全問 1〜5） */
const UNIFORM: Record<string, readonly [number, number, number, number, number]> = {
  trait: [16, 15.5, 15, 14.5, 14],
  adaptive_environment: [80, 48, 0, -48, -80],
  adaptive_work: [100, 60, 0, -60, -100],
  thinking_tendency: [100, 60, 0, -60, -100],
  decision_making: [60, 36, 0, -36, -60],
  stress_tolerance: [-60, -36, 0, 36, 60],
  sensory_open: [115, 57.5, 0, 0, 0],
  environment_receptive: [137.5, 68.75, 0, 0, 0],
  self_actualizing: [107.5, 53.75, 0, 0, 0],
  inquiry_logical: [137.5, 68.75, 0, 0, 0],
  misconduct: [100, 65, 30, -5, -40],
  complaint: [100, 75, 50, 25, 0],
  mental_distress: [100, 72.5, 45, 17.5, -10],
  careless_mistake: [100, 65, 30, -5, -40],
  resignation_trouble: [100, 67.5, 35, 2.5, -30],
  communication_issue: [100, 72.5, 45, 17.5, -10],
  low_motivation: [100, 75, 50, 25, 0],
  type: [58, 29, 0, -29, -58],
  generalist: [50, 25, 0, -25, -50],
  scientist: [46, 23, 0, -23, -46],
  conductor: [54, 27, 0, -27, -54],
  driving: [29, 14.5, 0, -14.5, -29],
  expressive: [29, 14.5, 0, -14.5, -29],
  analytical: [29, 14.5, 0, -11.5, -23],
  amiable: [29, 14.5, 0, -12.5, -25],
  reliability: [100, 100, 0, 100, 100],
};

const CHOICES: readonly ChoiceCode[] = [1, 2, 3, 4, 5];

describe("全問同一回答の各指標（03 §10.4）", () => {
  it.each(CHOICES)("全問 %i", (choice) => {
    const i = choice - 1;
    const r = scoreAnswers(uniformAnswers(choice));
    for (const k of TRAIT_KEYS) expect(r.traits[k], k).toBe(UNIFORM.trait![i]);
    for (const k of COMPATIBILITY_KEYS) expect(r.compatibility[k], k).toBe(UNIFORM[k]![i]);
    for (const k of APTITUDE_KEYS) expect(r.aptitudes[k], k).toBe(UNIFORM[k]![i]);
    for (const k of RISK_KEYS) expect(r.risks[k], k).toBe(UNIFORM[k]![i]);
    for (const k of APTITUDE_TYPE_KEYS) {
      expect(r.aptitudeTypeScores[k], k).toBe((UNIFORM[k] ?? UNIFORM.type!)[i]);
    }
    for (const k of SOCIAL_STYLE_KEYS) expect(r.socialStyles[k], k).toBe(UNIFORM[k]![i]);
    expect(r.reliability).toBeCloseTo(UNIFORM.reliability![i]!, 9);
  });
});

describe("同点処理（T-01〜T-05）", () => {
  it("T-01 全問 1: 優劣性 16、資質 environment_receptive / inquiry_logical、attendant、driving、信頼係数 100", () => {
    const r = scoreAnswers(uniformAnswers(1));
    expect(r.traits.deliberateness).toBe(16);
    expect([r.aptitudeFirst, r.aptitudeSecond]).toEqual([
      "environment_receptive",
      "inquiry_logical",
    ]);
    expect(r.aptitudeType).toBe("attendant");
    expect(r.socialStyle).toBe("driving");
    expect(r.reliability).toBe(100);
  });
  it("T-02 全問 3: 資質全て 0 → sensory_open / environment_receptive、attendant、driving、信頼係数 0", () => {
    const r = scoreAnswers(uniformAnswers(3));
    expect(r.traits.deliberateness).toBe(15);
    expect([r.aptitudeFirst, r.aptitudeSecond]).toEqual(["sensory_open", "environment_receptive"]);
    expect(r.aptitudeType).toBe("attendant");
    expect(r.socialStyle).toBe("driving");
    expect(r.reliability).toBe(0);
  });
  it("T-03 全問 5: 資質クランプ後 0 → sensory_open / environment_receptive、scientist、analytical", () => {
    const r = scoreAnswers(uniformAnswers(5));
    expect(r.traits.deliberateness).toBe(14);
    expect([r.aptitudeFirst, r.aptitudeSecond]).toEqual(["sensory_open", "environment_receptive"]);
    expect(r.aptitudeType).toBe("scientist");
    expect(r.socialStyle).toBe("analytical");
    expect(r.risks.complaint).toBe(0);
    expect(r.risks.low_motivation).toBe(0);
    expect(r.reliability).toBe(100);
  });
  it("T-04 全問 4: scientist（−23）、analytical（−11.5）、ストレス耐性 +36", () => {
    const r = scoreAnswers(uniformAnswers(4));
    expect(r.aptitudeType).toBe("scientist");
    expect(r.socialStyle).toBe("analytical");
    expect(r.compatibility.adaptive_environment).toBe(-48);
    expect(r.compatibility.stress_tolerance).toBe(36);
  });
  it("T-05 全問 2: 資質 environment_receptive / inquiry_logical、attendant、driving", () => {
    const r = scoreAnswers(uniformAnswers(2));
    expect(r.traits.deliberateness).toBe(15.5);
    expect([r.aptitudeFirst, r.aptitudeSecond]).toEqual([
      "environment_receptive",
      "inquiry_logical",
    ]);
    expect(r.aptitudeType).toBe("attendant");
    expect(r.socialStyle).toBe("driving");
  });
});

describe("T-06 周期回答 Q(q) = ((q − 1) mod 5) + 1 の回帰ベクトル（03 §10.5）", () => {
  const r: ScoreResult = scoreAnswers(cyclicAnswers());

  it("16 尺度（優劣性 14。12 に固定されない）", () => {
    expect(TRAIT_KEYS.map((k) => r.traits[k])).toEqual([
      15, 13.5, 14, 13, 14.5, 18.5, 13, 13.5, 16, 15.5, 13.5, 15.5, 16, 16, 13, 17,
    ]);
  });
  it("相性 5 軸", () => {
    expect(COMPATIBILITY_KEYS.map((k) => r.compatibility[k])).toEqual([-3, 0, 11, -13, -7]);
  });
  it("資質 4 型と候補", () => {
    expect(APTITUDE_KEYS.map((k) => r.aptitudes[k])).toEqual([13.75, 7.5, 22.5, 12.5]);
    expect([r.aptitudeFirst, r.aptitudeSecond]).toEqual(["self_actualizing", "sensory_open"]);
  });
  it("リスク 7 項目", () => {
    expect(RISK_KEYS.map((k) => r.risks[k])).toEqual([27.5, 47.5, 30, 57.5, 42.5, 52.5, 42.5]);
  });
  it("16 タイプ得点とタイプ", () => {
    expect(APTITUDE_TYPE_KEYS.map((k) => r.aptitudeTypeScores[k])).toEqual([
      3.5, 8, 4, 6.5, 5, -2.5, 2.5, 9.5, -2.5, -1, -10, 4.5, -2, -4.5, -1, 7.5,
    ]);
    expect(r.aptitudeType).toBe("pioneer");
  });
  it("ソーシャルスタイル", () => {
    expect(SOCIAL_STYLE_KEYS.map((k) => r.socialStyles[k])).toEqual([4.75, 3.75, 3.25, 4]);
    expect(r.socialStyle).toBe("driving");
  });
  it("信頼係数 78.685（どちらでもない 29 問）", () => {
    expect(neutralCount(cyclicAnswers())).toBe(29);
    expect(Math.abs(r.reliability - 78.685)).toBeLessThan(EPS);
  });
});

describe("T-07〜T-09", () => {
  it("T-07 Q145〜Q204 を任意の値で追加しても結果が T-06 と深い等価", () => {
    const extra: Record<number, ChoiceCode> = {};
    for (let q = 145; q <= 204; q += 1) extra[q] = ((q % 5) + 1) as ChoiceCode;
    expect(scoreAnswers({ ...cyclicAnswers(), ...extra })).toEqual(scoreAnswers(cyclicAnswers()));
  });
  it("T-07b 1〜204 以外のキーは無視する（D3-14）", () => {
    const input = { ...cyclicAnswers(), 0: 9, 999: 1 } as unknown as Parameters<
      typeof scoreAnswers
    >[0];
    expect(scoreAnswers(input)).toEqual(scoreAnswers(cyclicAnswers()));
  });
  it("T-08 scoringVersion と凍結", () => {
    const r = scoreAnswers(cyclicAnswers());
    expect(r.scoringVersion).toBe(SCORING_VERSION);
    expect(SCORING_VERSION).toBe("1.0.0");
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.traits)).toBe(true);
    expect(Object.isFrozen(r.socialStyles)).toBe(true);
  });
  it('T-09 不正入力: Q100 欠落、Q5 = 0、Q7 = 6、Q9 = "3"、Q10 = 2.5', () => {
    const input: Record<number, unknown> = { ...cyclicAnswers(), 5: 0, 7: 6, 9: "3", 10: 2.5 };
    delete input[100];
    let caught: unknown;
    try {
      scoreAnswers(input as Parameters<typeof scoreAnswers>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidAnswerMapError);
    const err = caught as InvalidAnswerMapError;
    expect(err.name).toBe("InvalidAnswerMapError");
    expect(err.missing).toEqual([100]);
    expect(err.invalid).toEqual([
      { questionNo: 5, value: 0 },
      { questionNo: 7, value: 6 },
      { questionNo: 9, value: "3" },
      { questionNo: 10, value: 2.5 },
    ]);
  });
  it("T-09 NaN・null も不正、全欠落は 144 件", () => {
    expect(() => scoreAnswers({ ...cyclicAnswers(), 1: Number.NaN } as never)).toThrow(
      InvalidAnswerMapError,
    );
    expect(() => scoreAnswers({ ...cyclicAnswers(), 2: null } as never)).toThrow(
      InvalidAnswerMapError,
    );
    try {
      scoreAnswers({});
    } catch (e) {
      expect((e as InvalidAnswerMapError).missing).toHaveLength(144);
    }
  });
  it("文字列キー（Firestore の map）でも同じ結果（03 §2.1）", () => {
    const stringKeyed = Object.fromEntries(
      Object.entries(cyclicAnswers()).map(([k, v]) => [String(k), v]),
    );
    expect(scoreAnswers(stringKeyed)).toEqual(scoreAnswers(cyclicAnswers()));
  });
});

describe("T-09b 信頼係数の境界（どちらでもない n 問）", () => {
  const cases: Array<[number, number]> = [
    [0, 100],
    [1, 99.265],
    [14, 89.71],
    [136, 0.04],
    [137, 0],
    [144, 0],
  ];
  it.each(cases)("n = %i → %f", (n, expected) => {
    const overrides: Record<number, ChoiceCode> = {};
    for (let q = 1; q <= n; q += 1) overrides[q] = 3;
    const answers = withOverrides(uniformAnswers(1), overrides);
    expect(neutralCount(answers)).toBe(n);
    expect(Math.abs(computeReliability(answers) - expected)).toBeLessThan(EPS);
    expect(Math.abs(scoreAnswers(answers).reliability - expected)).toBeLessThan(EPS);
  });
});
