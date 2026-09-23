// 性質テスト T-10（03 §10.6）: 固定シードの乱数回答 1,000 件
import { describe, expect, it } from "vitest";

import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { scoreAnswers } from "@/lib/scoring/score";
import type { AnswerMap } from "@/lib/scoring/types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";

import { randomAnswers, seededRandom } from "./helpers";
import { isInRange, VALUE_RANGES } from "./value-ranges";

const random = seededRandom(20260923);
const SAMPLES: AnswerMap[] = Array.from({ length: 1000 }, () => randomAnswers(random));

describe("T-10 乱数回答 1,000 件の性質", () => {
  it("値域と刻み（03 §5.10）", () => {
    for (const answers of SAMPLES) {
      const r = scoreAnswers(answers);
      for (const k of TRAIT_KEYS) expect(isInRange(r.traits[k], VALUE_RANGES.traits)).toBe(true);
      for (const k of COMPATIBILITY_KEYS) {
        expect(isInRange(r.compatibility[k], VALUE_RANGES.compatibility)).toBe(true);
      }
      for (const k of APTITUDE_KEYS)
        expect(isInRange(r.aptitudes[k], VALUE_RANGES.aptitudes)).toBe(true);
      for (const k of RISK_KEYS) expect(isInRange(r.risks[k], VALUE_RANGES.risks)).toBe(true);
      for (const k of APTITUDE_TYPE_KEYS) {
        expect(isInRange(r.aptitudeTypeScores[k], VALUE_RANGES.aptitudeTypeScores)).toBe(true);
      }
      for (const k of SOCIAL_STYLE_KEYS) {
        expect(isInRange(r.socialStyles[k], VALUE_RANGES.socialStyles)).toBe(true);
      }
      expect(isInRange(r.reliability, VALUE_RANGES.reliability)).toBe(true);
    }
  });

  it("資質の候補: first の値 ≥ second の値、同点なら APTITUDE_KEYS で first が先、first ≠ second", () => {
    for (const answers of SAMPLES) {
      const r = scoreAnswers(answers);
      const f = r.aptitudes[r.aptitudeFirst];
      const s = r.aptitudes[r.aptitudeSecond];
      expect(r.aptitudeFirst).not.toBe(r.aptitudeSecond);
      expect(f).toBeGreaterThanOrEqual(s);
      expect(Math.max(...APTITUDE_KEYS.map((k) => r.aptitudes[k]))).toBe(f);
      if (f === s) {
        expect(APTITUDE_KEYS.indexOf(r.aptitudeFirst)).toBeLessThan(
          APTITUDE_KEYS.indexOf(r.aptitudeSecond),
        );
      }
      // second は first を除いた中の最大で、同点なら定義順で先
      const rest = APTITUDE_KEYS.filter((k) => k !== r.aptitudeFirst);
      const secondMax = Math.max(...rest.map((k) => r.aptitudes[k]));
      expect(s).toBe(secondMax);
      expect(rest.find((k) => r.aptitudes[k] === secondMax)).toBe(r.aptitudeSecond);
    }
  });

  it("タイプ・スタイル: 最大値の中で定義順の先頭。スタイル × 2 = 所属タイプ得点の最大", () => {
    for (const answers of SAMPLES) {
      const r = scoreAnswers(answers);
      const typeMax = Math.max(...APTITUDE_TYPE_KEYS.map((k) => r.aptitudeTypeScores[k]));
      expect(APTITUDE_TYPE_KEYS.find((k) => r.aptitudeTypeScores[k] === typeMax)).toBe(
        r.aptitudeType,
      );
      const styleMax = Math.max(...SOCIAL_STYLE_KEYS.map((k) => r.socialStyles[k]));
      expect(SOCIAL_STYLE_KEYS.find((k) => r.socialStyles[k] === styleMax)).toBe(r.socialStyle);
      for (const s of SOCIAL_STYLE_KEYS) {
        const members = APTITUDE_TYPE_DEFINITIONS.filter((t) => t.socialStyle === s);
        expect(r.socialStyles[s] * 2).toBe(
          Math.max(...members.map((t) => r.aptitudeTypeScores[t.key])),
        );
      }
    }
  });

  it("決定性と順序非依存（キー順を逆にしても同じ）", () => {
    for (const answers of SAMPLES.slice(0, 100)) {
      const reversed = Object.fromEntries(Object.entries(answers).reverse()) as AnswerMap;
      const a = scoreAnswers(answers);
      expect(scoreAnswers(answers)).toEqual(a);
      expect(scoreAnswers(reversed)).toEqual(a);
    }
  });
});
