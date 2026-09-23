// マスタの不変条件テスト M-01〜M-08（03 §10.3、08 §3.2.1）
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHOICE_SCORE_TABLE } from "@/lib/masters/choice-scores";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import {
  ACTIVE_QUESTIONS,
  QUESTION_BY_NO,
  QUESTION_PAGE_LAYOUT,
  QUESTIONS,
  SCORED_QUESTION_NOS,
} from "@/lib/masters/questions";
import type { IndicatorDefinition } from "@/lib/masters/types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SCORE_ATTRIBUTE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function countTerms<K extends string>(
  def: IndicatorDefinition<K>,
  pred: (t: IndicatorDefinition<K>["terms"][number]) => boolean,
): number {
  return def.terms.filter(pred).length;
}

describe("M-01 16 尺度", () => {
  it("TRAIT_KEYS 順に 16 件", () => {
    expect(TRAIT_DEFINITIONS.map((d) => d.key)).toEqual([...TRAIT_KEYS]);
    expect(TRAIT_DEFINITIONS.map((d) => d.sortOrder)).toEqual(TRAIT_KEYS.map((_, i) => i + 1));
  });
  it.each(TRAIT_DEFINITIONS.map((d) => [d.key, d] as const))(
    "%s: 項数 15、score のみ、+1 が 8・−1 が 7、定数 14、×1、クランプなし",
    (_, d) => {
      expect(d.terms).toHaveLength(15);
      expect(d.terms.every((t) => t.attribute === "score")).toBe(true);
      expect(countTerms(d, (t) => t.sign === 1)).toBe(8);
      expect(countTerms(d, (t) => t.sign === -1)).toBe(7);
      expect(d.constant).toBe(14);
      expect(d.multiplier).toBe(1);
      expect(d.clampMin).toBeNull();
    },
  );
  it("協力性の式が付録B §2 の出現順どおり", () => {
    const d = TRAIT_DEFINITIONS[0]!;
    expect(d.label).toBe("協力性");
    expect(d.terms.map((t) => t.sign * t.questionNo)).toEqual([
      24, 93, 67, 116, 130, 26, 139, 96, -1, -35, -63, -108, -118, -22, -91,
    ]);
  });
});

describe("M-02 相性 5 軸", () => {
  it("COMPATIBILITY_KEYS 順、項数 20、減算項の数 2・0・0・4・16、定数 0、×1、クランプなし", () => {
    expect(COMPATIBILITY_DEFINITIONS.map((d) => d.key)).toEqual([...COMPATIBILITY_KEYS]);
    expect(COMPATIBILITY_DEFINITIONS.map((d) => countTerms(d, (t) => t.sign === -1))).toEqual([
      2, 0, 0, 4, 16,
    ]);
    for (const d of COMPATIBILITY_DEFINITIONS) {
      expect(d.terms).toHaveLength(20);
      expect(
        d.terms.every(
          (t) => t.attribute === "score_compat" || t.attribute === "score_compat_minus",
        ),
      ).toBe(true);
      expect(d.terms.filter((t) => t.sign === 1).every((t) => t.attribute === "score_compat")).toBe(
        true,
      );
      expect(d.constant).toBe(0);
      expect(d.multiplier).toBe(1);
      expect(d.clampMin).toBeNull();
    }
  });
  it("適応する環境の減算項は Q4（score_compat）と Q60（score_compat_minus）", () => {
    const minus = COMPATIBILITY_DEFINITIONS[0]!.terms.filter((t) => t.sign === -1);
    expect(minus).toEqual([
      { questionNo: 4, attribute: "score_compat", sign: -1 },
      { questionNo: 60, attribute: "score_compat_minus", sign: -1 },
    ]);
  });
  it("低い側・高い側ラベル（00 §1.3）", () => {
    expect(COMPATIBILITY_DEFINITIONS.map((d) => [d.lowLabel, d.highLabel])).toEqual([
      ["個人優先型", "組織優先型"],
      ["変化の少ない業務", "変化の多い業務"],
      ["主観的", "客観的"],
      ["依存的", "主体的"],
      ["ストレスを感じやすい", "ストレスを感じにくい"],
    ]);
  });
});

describe("M-03 資質 4 型", () => {
  it("APTITUDE_KEYS 順、項数 26、social_important 6、全項 +1、下限 0", () => {
    expect(APTITUDE_DEFINITIONS.map((d) => d.key)).toEqual([...APTITUDE_KEYS]);
    for (const d of APTITUDE_DEFINITIONS) {
      expect(d.terms).toHaveLength(26);
      expect(countTerms(d, (t) => t.attribute === "social_important")).toBe(6);
      expect(d.terms.every((t) => t.sign === 1)).toBe(true);
      expect(d.clampMin).toBe(0);
    }
  });
  it("social_plus / social_minus の数（16・4、19・1、15・5、19・1）", () => {
    expect(
      APTITUDE_DEFINITIONS.map((d) => [
        countTerms(d, (t) => t.attribute === "social_plus"),
        countTerms(d, (t) => t.attribute === "social_minus"),
      ]),
    ).toEqual([
      [16, 4],
      [19, 1],
      [15, 5],
      [19, 1],
    ]);
  });
  it("自己実現型に Q13 の social_plus が 2 件（D3-04）", () => {
    const d = APTITUDE_DEFINITIONS.find((x) => x.key === "self_actualizing")!;
    expect(countTerms(d, (t) => t.questionNo === 13 && t.attribute === "social_plus")).toBe(2);
  });
  it("内部名は感性開放型、表示名は直感型など（00 §1.4）", () => {
    expect(APTITUDE_DEFINITIONS.map((d) => [d.internalName, d.label])).toEqual([
      ["感性開放型", "直感型"],
      ["環境受容型", "柔軟型"],
      ["自己実現型", "目標達成型"],
      ["探求論理型", "専門追求型"],
    ]);
  });
});

describe("M-04 リスク 7 項目", () => {
  it("RISK_KEYS 順、項数 10、全項 +1、×5、score_type の数 4・0・1・4・3・1・0", () => {
    expect(RISK_DEFINITIONS.map((d) => d.key)).toEqual([...RISK_KEYS]);
    expect(RISK_DEFINITIONS.map((d) => countTerms(d, (t) => t.attribute === "score_type"))).toEqual(
      [4, 0, 1, 4, 3, 1, 0],
    );
    for (const d of RISK_DEFINITIONS) {
      expect(d.terms).toHaveLength(10);
      expect(d.terms.every((t) => t.sign === 1)).toBe(true);
      expect(d.terms.every((t) => t.attribute === "score" || t.attribute === "score_type")).toBe(
        true,
      );
      expect(d.multiplier).toBe(5);
      expect(d.clampMin).toBeNull();
    }
  });
});

describe("M-05 16 タイプ", () => {
  it("APTITUDE_TYPE_KEYS 順、加算 + 減算 = 20、重要 6", () => {
    expect(APTITUDE_TYPE_DEFINITIONS.map((d) => d.key)).toEqual([...APTITUDE_TYPE_KEYS]);
    for (const d of APTITUDE_TYPE_DEFINITIONS) {
      expect(countTerms(d, (t) => t.attribute === "score_type")).toBe(20);
      expect(countTerms(d, (t) => t.attribute === "score_important" && t.sign === 1)).toBe(6);
      expect(d.terms).toHaveLength(26);
    }
  });
  it("減算の設問は generalist Q45・Q46、scientist Q11・Q25・Q45、conductor Q4 のみ", () => {
    const minus = Object.fromEntries(
      APTITUDE_TYPE_DEFINITIONS.map((d) => [
        d.key,
        d.terms.filter((t) => t.sign === -1).map((t) => t.questionNo),
      ]),
    );
    for (const key of APTITUDE_TYPE_KEYS) {
      const expected =
        { generalist: [45, 46], scientist: [11, 25, 45], conductor: [4] }[key as string] ?? [];
      expect(minus[key], key).toEqual(expected);
    }
  });
  it("所属分類が各 4 タイプ", () => {
    for (const style of SOCIAL_STYLE_KEYS) {
      expect(APTITUDE_TYPE_DEFINITIONS.filter((d) => d.socialStyle === style)).toHaveLength(4);
    }
  });
  it("全マスタの questionNo が 1〜144（Q145〜Q204 は採点に使わない）", () => {
    const all = [
      ...TRAIT_DEFINITIONS,
      ...COMPATIBILITY_DEFINITIONS,
      ...APTITUDE_DEFINITIONS,
      ...RISK_DEFINITIONS,
      ...APTITUDE_TYPE_DEFINITIONS,
    ].flatMap((d) => d.terms.map((t) => t.questionNo));
    expect(all.every((q) => Number.isInteger(q) && q >= 1 && q <= 144)).toBe(true);
  });
  it("Q64・Q144 はどの指標にも使われない（信頼係数のみ）", () => {
    const used = new Set(
      [
        ...TRAIT_DEFINITIONS,
        ...COMPATIBILITY_DEFINITIONS,
        ...APTITUDE_DEFINITIONS,
        ...RISK_DEFINITIONS,
        ...APTITUDE_TYPE_DEFINITIONS,
      ].flatMap((d) => d.terms.map((t) => t.questionNo)),
    );
    const unused = SCORED_QUESTION_NOS.filter((q) => !used.has(q));
    expect(unused).toEqual([64, 144]);
  });
});

describe("M-06 設問マスタ", () => {
  it("204 件、1〜204 が欠落・重複なし", () => {
    expect(QUESTIONS).toHaveLength(204);
    expect(QUESTIONS.map((q) => q.questionNo)).toEqual(
      Array.from({ length: 204 }, (_, i) => i + 1),
    );
    expect(QUESTION_BY_NO.size).toBe(204);
  });
  it("1〜144 は出題・採点対象、145〜204 は対象外で step・page が null", () => {
    for (const q of QUESTIONS) {
      const scored = q.questionNo <= 144;
      expect(q.isActive).toBe(scored);
      expect(q.isScored).toBe(scored);
      if (!scored) {
        expect(q.step).toBeNull();
        expect(q.page).toBeNull();
      }
    }
    expect(ACTIVE_QUESTIONS).toHaveLength(144);
    expect(SCORED_QUESTION_NOS).toEqual(Array.from({ length: 144 }, (_, i) => i + 1));
  });
  it("1〜144 の step・page が QUESTION_PAGE_LAYOUT（36 問 × 4、7・7・7・7・8）と一致", () => {
    const expected: Array<[number, number]> = [];
    for (let step = 1; step <= QUESTION_PAGE_LAYOUT.stepCount; step += 1) {
      QUESTION_PAGE_LAYOUT.pageSizes.forEach((size, i) => {
        for (let n = 0; n < size; n += 1) expected.push([step, i + 1]);
      });
    }
    expect(ACTIVE_QUESTIONS.map((q) => [q.step, q.page])).toEqual(expected);
    expect(QUESTION_BY_NO.get(1)).toMatchObject({ step: 1, page: 1 });
    expect(QUESTION_BY_NO.get(36)).toMatchObject({ step: 1, page: 5 });
    expect(QUESTION_BY_NO.get(37)).toMatchObject({ step: 2, page: 1 });
    expect(QUESTION_BY_NO.get(144)).toMatchObject({ step: 4, page: 5 });
  });
  it("設問文は付録A の転記そのまま（代表例）", () => {
    expect(QUESTION_BY_NO.get(1)?.text).toBe("人の好き嫌いが多い");
    expect(QUESTION_BY_NO.get(4)?.text).toBe("まとめやくを担当するのは負担に感じる");
    expect(QUESTION_BY_NO.get(144)?.text).toBe("食べ物の好き嫌いが多い");
    expect(QUESTION_BY_NO.get(145)?.text).toBe("行動的、野心的、エネルギッシュである");
    expect(QUESTION_BY_NO.get(204)?.text).toBe("単独仕事より、チーム仕事の方が好きだ");
  });
});

describe("M-07 「感性解放型」がコードに出現しない（08 D08-04 の拡張版）", () => {
  const FORBIDDEN = "感性" + "解放型";
  const TARGET_DIRS = ["lib", "components", "app", "firebase", "scripts"];
  const EXCLUDED = [path.join("lib", "ai", "prompts") + path.sep];

  function walk(dir: string): string[] {
    const abs = path.join(ROOT, dir);
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return [];
    }
    return entries.flatMap((name) => {
      const rel = path.join(dir, name);
      return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
    });
  }

  it("lib/ai/prompts/ 以外の lib・components・app・firebase・scripts に含まれない", () => {
    const files = TARGET_DIRS.flatMap(walk).filter(
      (f) => !EXCLUDED.some((prefix) => f.startsWith(prefix)),
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) =>
      readFileSync(path.join(ROOT, f), "utf8").includes(FORBIDDEN),
    );
    expect(offenders).toEqual([]);
  });
});

describe("M-08 配点表", () => {
  // 00 §1.9 のコピー用 JSON と同一
  const EXPECTED = {
    1: { score: 2, reliability: 1, social_plus: 5, social_minus: -2.5, score_important: 3, score_compat: 5, score_compat_minus: 5, score_type: 2, social_important: 7.5 },
    2: { score: 1.5, reliability: 1, social_plus: 2.5, social_minus: -1.25, score_important: 1.5, score_compat: 3, score_compat_minus: 3, score_type: 1, social_important: 3.75 },
    3: { score: 1, reliability: -0.5, social_plus: 0, social_minus: 0, score_important: 0, score_compat: 0, score_compat_minus: 0, score_type: 0, social_important: 0 },
    4: { score: 0.5, reliability: 1, social_plus: -1.25, social_minus: 2.5, score_important: -1.5, score_compat: -3, score_compat_minus: -3, score_type: -1, social_important: -2.5 },
    5: { score: 0, reliability: 1, social_plus: -2.5, social_minus: 5, score_important: -3, score_compat: -5, score_compat_minus: -5, score_type: -2, social_important: -5 },
  }; // prettier-ignore

  it("5 選択肢 × 9 属性が付録B §1（00 §1.9）と一致", () => {
    expect(CHOICE_SCORE_TABLE).toEqual(EXPECTED);
  });
  it("score_compat と score_compat_minus が全選択肢で等しい", () => {
    for (const code of [1, 2, 3, 4, 5] as const) {
      expect(CHOICE_SCORE_TABLE[code].score_compat).toBe(
        CHOICE_SCORE_TABLE[code].score_compat_minus,
      );
    }
  });
  it("全配点値が 0.25 の整数倍（2 進小数で正確。03 §3.2）", () => {
    for (const code of [1, 2, 3, 4, 5] as const) {
      for (const key of SCORE_ATTRIBUTE_KEYS) {
        expect(Number.isInteger(CHOICE_SCORE_TABLE[code][key] * 4)).toBe(true);
      }
    }
  });
});

describe("ソーシャルスタイル・タイプの表示用定義（00 §1.6・§1.7）", () => {
  it("sortOrder は driving, expressive, analytical, amiable、chartOrder の軸順は driving, expressive, amiable, analytical", () => {
    expect(SOCIAL_STYLE_DEFINITIONS.map((d) => d.key)).toEqual([...SOCIAL_STYLE_KEYS]);
    expect(SOCIAL_STYLE_DEFINITIONS.map((d) => d.sortOrder)).toEqual([1, 2, 3, 4]);
    const byChart = [...SOCIAL_STYLE_DEFINITIONS].sort((a, b) => a.chartOrder - b.chartOrder);
    expect(byChart.map((d) => d.key)).toEqual(["driving", "expressive", "amiable", "analytical"]);
    expect(SOCIAL_STYLE_DEFINITIONS.map((d) => d.color)).toEqual([
      "rgba(149,112,161)",
      "rgba(229,179,83)",
      "rgba(65,166,123)",
      "rgba(65,148,175)",
    ]);
  });
  it("タイプのキャラクター名（カタカナ・ひらがな）", () => {
    expect(APTITUDE_TYPE_DEFINITIONS.map((d) => d.characterName).join("")).toBe(
      "ハルカナオリツカレイマドカカナアイリヒナタアカリナツキミユエリカサラマイリサノゾミ",
    );
    expect(APTITUDE_TYPE_DEFINITIONS.map((d) => d.characterNameHiragana).join("")).toBe(
      "はるかなおりつかれいまどかかなあいりひなたあかりなつきみゆえりかさらまいりさのぞみ",
    );
  });
  it("マスタは凍結されている", () => {
    expect(Object.isFrozen(TRAIT_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(TRAIT_DEFINITIONS[0]!.terms[0])).toBe(true);
    expect(Object.isFrozen(CHOICE_SCORE_TABLE[1])).toBe(true);
  });
});
