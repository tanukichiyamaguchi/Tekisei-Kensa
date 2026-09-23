// 検証用データによるテスト T-10b〜T-11（03 §10.7、08 §3.6。tests/verify_fixtures.py の移植）
import { describe, expect, it } from "vitest";

import { compareWithPopulation } from "@/lib/scoring/compare";
import { pickFirstMax, rankKeys } from "@/lib/scoring/evaluate";
import type { PopulationMember, TraitScores } from "@/lib/scoring/types";
import {
  APTITUDE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";

import { EPS } from "./helpers";
import { loadFixture } from "./fixture-adapter";
import { isInRange, VALUE_RANGES } from "./value-ranges";

const { records, sample } = loadFixture();
const current = records.filter((r) => r.isCurrentLogic);

describe("検証用データの前提", () => {
  it("73 件、うち現行ロジック整合 31 件", () => {
    expect(records).toHaveLength(73);
    expect(current).toHaveLength(31);
  });
});

describe("T-10b 値の範囲と刻み", () => {
  it("全 73 件の 16 尺度・リスク・信頼係数", () => {
    for (const r of records) {
      for (const k of TRAIT_KEYS)
        expect(isInRange(r.traits[k], VALUE_RANGES.traits), `${r.id} ${k}`).toBe(true);
      for (const k of RISK_KEYS)
        expect(isInRange(r.risks[k], VALUE_RANGES.risks), `${r.id} ${k}`).toBe(true);
      expect(isInRange(r.reliability, VALUE_RANGES.reliability), r.id).toBe(true);
    }
  });
  it("現行ロジック整合 31 件の相性・資質・スタイル", () => {
    for (const r of current) {
      for (const k of COMPATIBILITY_KEYS) {
        expect(isInRange(r.compatibility[k], VALUE_RANGES.compatibility), `${r.id} ${k}`).toBe(
          true,
        );
      }
      for (const k of APTITUDE_KEYS) {
        expect(isInRange(r.aptitudes[k], VALUE_RANGES.aptitudes), `${r.id} ${k}`).toBe(true);
      }
      for (const k of SOCIAL_STYLE_KEYS) {
        expect(isInRange(r.socialStyles[k], VALUE_RANGES.socialStyles), `${r.id} ${k}`).toBe(true);
      }
    }
  });
  it("相性の負値は実際に発生している（R052 の意思決定 = −7）", () => {
    const negatives = current.flatMap((r) =>
      COMPATIBILITY_KEYS.filter((k) => r.compatibility[k] < 0).map((k) => [
        r.id,
        k,
        r.compatibility[k],
      ]),
    );
    expect(negatives).toEqual([["R052", "decision_making", -7]]);
  });
});

describe("T-10c 資質第一・第二候補 = rankKeys(資質 4 値, APTITUDE_KEYS) の上位 2 つ", () => {
  it("73 件すべて一致（同点を含む行も定義順で一致）", () => {
    const mismatches = records.filter((r) => {
      const [first, second] = rankKeys(r.aptitudes, APTITUDE_KEYS);
      return first !== r.aptitudeFirst || second !== r.aptitudeSecond;
    });
    expect(mismatches.map((r) => r.id)).toEqual([]);
  });
  it("上位 2 位の決定に同点が関わる行が存在する（同点処理を実際に検証している）", () => {
    const tied = records.filter((r) => {
      const values = APTITUDE_KEYS.map((k) => r.aptitudes[k]).sort((a, b) => b - a);
      return values[0] === values[1] || values[1] === values[2];
    });
    expect(tied.length).toBeGreaterThan(0);
  });
});

describe("T-10d ソーシャルスタイル = pickFirstMax(4 値, SOCIAL_STYLE_KEYS)", () => {
  it("73 件すべて一致", () => {
    const mismatches = records.filter(
      (r) => pickFirstMax(r.socialStyles, SOCIAL_STYLE_KEYS) !== r.socialStyle,
    );
    expect(mismatches.map((r) => r.id)).toEqual([]);
  });
  it("最大値が同点の行は 15 件", () => {
    const ties = records.filter((r) => {
      const max = Math.max(...SOCIAL_STYLE_KEYS.map((k) => r.socialStyles[k]));
      return SOCIAL_STYLE_KEYS.filter((k) => r.socialStyles[k] === max).length > 1;
    });
    expect(ties).toHaveLength(15);
  });
  it("Expressive と Analytical が同点最大となる行は 0 件（D-21 の仮置きは検証用データで判別不能）", () => {
    const ambiguous = records.filter((r) => {
      const max = Math.max(...SOCIAL_STYLE_KEYS.map((k) => r.socialStyles[k]));
      return (
        r.socialStyles.expressive === max &&
        r.socialStyles.analytical === max &&
        r.socialStyles.driving !== max
      );
    });
    expect(ambiguous).toHaveLength(0);
  });
});

describe("T-10e 既存不具合の記録: 優劣性 = 12", () => {
  it("records は全件 12 だが、sample のチャート用レコードの正しい値は 13", () => {
    expect(records.every((r) => r.traits.deliberateness === 12)).toBe(true);
    const r073 = records.find((r) => r.id === sample.subjectId)!;
    expect(r073.traits.deliberateness).toBe(12);
    expect(sample.radarTraits.deliberateness).toBe(13);
  });
});

describe("T-10f sample のチャート用レコードが R073 と一致", () => {
  it("16 尺度（優劣性を除く）・資質 4 値・スタイル 4 値", () => {
    const r073 = records.find((r) => r.id === sample.subjectId)!;
    for (const k of TRAIT_KEYS.filter((t) => t !== "deliberateness")) {
      expect(sample.radarTraits[k], k).toBe(r073.traits[k]);
    }
    expect(sample.radarAptitudes).toEqual(r073.aptitudes);
    expect(sample.radarSocialStyles).toEqual(r073.socialStyles);
  });
});

describe("T-11 比較計算（03 §7.7）", () => {
  const r073 = records.find((r) => r.id === sample.subjectId)!;
  const c = sample.comparison;
  // 既存の平均値そのものは再現できない（D3-17）ため、観測された差分と平均を入力として与える。
  // 平均 = 受検者 + 差分 とすれば |平均 − 受検者| = 差分 になる（優劣性は受検者・平均とも不具合で 12、差分 0）
  const traitAverages = Object.fromEntries(
    TRAIT_KEYS.map((k) => [k, r073.traits[k] + c.traitDiffs[k]]),
  ) as TraitScores;
  const population: PopulationMember[] = [
    { traits: traitAverages, compatibility: c.compatibilityAverages },
  ];
  const result = compareWithPopulation(
    { traits: r073.traits, compatibility: r073.compatibility },
    population,
    { kind: "organization" },
  );

  it("受検者 R073 の思考の傾向 28・適応力 23", () => {
    expect(r073.compatibility.thinking_tendency).toBe(28);
    expect(r073.traits.adaptability).toBe(23);
  });
  it("合致度 49.8409…（観測値と一致）", () => {
    expect(Math.abs(result.matchScore - c.matchScore)).toBeLessThan(EPS);
    expect(Math.abs(result.matchScore - 49.84090909090909)).toBeLessThan(EPS);
  });
  it("思考の傾向以外の 4 軸の偏差は観測値と一致", () => {
    for (const k of COMPATIBILITY_KEYS.filter((a) => a !== "thinking_tendency")) {
      expect(Math.abs(result.axisDeviations[k] - c.axisDeviations[k]), k).toBeLessThan(EPS);
    }
  });
  it("思考の傾向の偏差は 53.195（既存の不具合値 50.695 ではない）", () => {
    expect(c.axisDeviations.thinking_tendency).toBe(50.695);
    expect(Math.abs(result.axisDeviations.thinking_tendency - 53.195)).toBeLessThan(EPS);
  });
  it("偏差値 69.189（既存 68.689）、評価 E、立ち位置 strong_leader", () => {
    expect(c.deviationScore).toBe(68.689);
    expect(Math.abs(result.deviationScore - 69.189)).toBeLessThan(EPS);
    expect(result.grade).toBe("E");
    expect(c.grade).toBe("E");
    expect(result.position).toBe("strong_leader");
  });
});
