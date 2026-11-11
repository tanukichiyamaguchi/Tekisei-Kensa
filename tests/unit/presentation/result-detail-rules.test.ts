// 結果詳細の表示の規則（11-4 §3.5 の result-detail-rules.ts・§5.1）。M7-result-04 rankRisks（並びと段階。段階の境目と色は
// colors.test.ts）、M7-result-06 sortTraitKeys、M7-result-07 fitLean、M7-result-12 小さい関数（aptitudeOfHeading・senseShortName・
// positionLines・detailHeading・noComparisonText と、受験日の formatYmd）
import { describe, expect, it } from "vitest";

import { DEVELOPMENT_GUIDES, POSITION_DEFINITIONS, TYPE_TEXTS } from "@/lib/masters/texts";
import { formatScopeLabel } from "@/lib/presentation/comparison-view";
import { formatYmd } from "@/lib/presentation/format-datetime";
import {
  aptitudeOfHeading,
  DEFAULT_VIEWER_STYLE,
  detailHeading,
  fitLean,
  noComparisonText,
  positionLines,
  rankRisks,
  senseShortName,
  sortTraitKeys,
} from "@/lib/presentation/result-detail-rules";
import { pickHighestTrait, pickLowestTrait } from "@/lib/presentation/trait-highlights";
import {
  APTITUDE_TYPE_KEYS,
  TRAIT_KEYS,
  type RiskScores,
  type TraitKey,
  type TraitScores,
} from "@/lib/scoring/types";

/** 16 項目を value にし、overrides の項目だけ替える */
function traitsOf(value: number, overrides: Partial<Record<TraitKey, number>> = {}): TraitScores {
  return Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, overrides[key] ?? value]),
  ) as unknown as TraitScores;
}

/** sortTraitKeys の highestKey・lowestKey は画面と同じく pickHighestTrait・pickLowestTrait で決める */
function sorted(
  values: TraitScores,
  order: "score" | "diff" | "def",
  averages: TraitScores | null = null,
): readonly TraitKey[] {
  return sortTraitKeys({
    values,
    averages,
    order,
    highestKey: pickHighestTrait(values).key,
    lowestKey: pickLowestTrait(values).key,
  });
}

describe("M7-result-04 rankRisks（リスクの並びと段階。11-4 §2.10）", () => {
  it("表示値の大きい順。同じ値はマスタの順（不祥事 52.5・苦情 25・メンタル面 30・不注意 57.5・退職時 40・コミュニケーション 32.5・モチベーション 25）", () => {
    const risks: RiskScores = {
      misconduct: 52.5,
      complaint: 25,
      mental_distress: 30,
      careless_mistake: 57.5,
      resignation_trouble: 40,
      communication_issue: 32.5,
      low_motivation: 25,
    };
    expect(rankRisks(risks)).toEqual([
      { key: "careless_mistake", display: 58, level: 3 }, // 不注意（58・注意）
      { key: "misconduct", display: 53, level: 3 }, // 不祥事（53・注意）
      { key: "resignation_trouble", display: 40, level: 3 }, // 退職時（40・注意）
      { key: "communication_issue", display: 33, level: 2 }, // コミュニケーション（33・やや低い）
      { key: "mental_distress", display: 30, level: 2 }, // メンタル面（30・やや低い）
      { key: "complaint", display: 25, level: 2 }, // 苦情（25・やや低い）
      { key: "low_motivation", display: 25, level: 2 }, // モチベーション（25・やや低い）
    ]);
  });

  it("負の値は表示値 0（低い）、100 を超える値は 100（高い）。すべて同じ値ならマスタの順", () => {
    const ranked = rankRisks({
      misconduct: 90,
      complaint: -40,
      mental_distress: 120,
      careless_mistake: 19.5,
      resignation_trouble: 0,
      communication_issue: 0,
      low_motivation: 0,
    });
    expect(ranked.map((r) => [r.key, r.display, r.level])).toEqual([
      ["mental_distress", 100, 4],
      ["misconduct", 90, 4],
      ["careless_mistake", 20, 2],
      ["complaint", 0, 1],
      ["resignation_trouble", 0, 1],
      ["communication_issue", 0, 1],
      ["low_motivation", 0, 1],
    ]);
    const same = rankRisks({
      misconduct: 30,
      complaint: 30,
      mental_distress: 30,
      careless_mistake: 30,
      resignation_trouble: 30,
      communication_issue: 30,
      low_motivation: 30,
    });
    expect(same.map((r) => r.key)).toEqual([
      "misconduct",
      "complaint",
      "mental_distress",
      "careless_mistake",
      "resignation_trouble",
      "communication_issue",
      "low_motivation",
    ]);
    expect(Object.isFrozen(same)).toBe(true);
  });
});

describe("M7-result-06 sortTraitKeys（16の特性の並び替え。11-4 §2.8.6）", () => {
  const others = TRAIT_KEYS.filter(
    (k) => !["cooperativeness", "leadership", "adaptability"].includes(k),
  );

  it("点数の高い順: 協力性 25・リーダーシップ 25・ほか 15 → 協力性（いちばん高い）、リーダーシップ、15 の 13 項目を項目順、最後に適応力（いちばん低い）", () => {
    const values = traitsOf(15, { cooperativeness: 25, leadership: 25 });
    expect(pickHighestTrait(values).key).toBe("cooperativeness");
    expect(pickLowestTrait(values).key).toBe("adaptability");
    expect(others).toHaveLength(13);
    expect(sorted(values, "score")).toEqual([
      "cooperativeness",
      "leadership",
      ...others,
      "adaptability",
    ]);
  });

  it("点数の高い順: 同じ値の中で、いちばん高い特性は先頭、いちばん低い特性は項目順で前でも最後", () => {
    const values = traitsOf(15, { communication: 25, leadership: 25, creativity: 5, humility: 5 });
    expect(
      sortTraitKeys({
        values,
        averages: null,
        order: "score",
        highestKey: "leadership",
        lowestKey: "humility",
      }),
    ).toEqual([
      "leadership",
      "communication",
      ...TRAIT_KEYS.filter(
        (k) => !["communication", "leadership", "creativity", "humility"].includes(k),
      ),
      "creativity",
      "humility",
    ]);
  });

  it("16 項目が同じ値 → 項目順（いちばん高い = いちばん低い = 協力性が先頭）", () => {
    const values = traitsOf(15);
    expect(pickHighestTrait(values).key).toBe("cooperativeness");
    expect(pickLowestTrait(values).key).toBe("cooperativeness");
    expect(sorted(values, "score")).toEqual([...TRAIT_KEYS]);
  });

  it("平均との差: 本人 − 平均（丸めない）の大きい順。同じ差は項目順", () => {
    const values = traitsOf(15, { emotionality: 15.25 });
    const averages = traitsOf(15, {
      humility: 10, // +5
      creativity: 10, // +5
      communication: 12, // +3
      emotionality: 15.2, // +0.05（丸めない差で 0 より上）
      activeness: 20, // −5
      deliberateness: 16, // −1
    });
    expect(sorted(values, "diff", averages)).toEqual([
      "humility",
      "creativity",
      "communication",
      "emotionality",
      ...TRAIT_KEYS.filter(
        (k) =>
          ![
            "humility",
            "creativity",
            "communication",
            "emotionality",
            "activeness",
            "deliberateness",
          ].includes(k),
      ),
      "deliberateness",
      "activeness",
    ]);
  });

  it("平均との差: 3 人の平均（合計 ÷ 3。丸めない）で数学的に同じ差になる 2 項目は、浮動小数の誤差があっても項目順（協力性 本人 5・平均 21.5 ÷ 3、適応力 本人 6・平均 24.5 ÷ 3。どちらも −2.1666…）", () => {
    const values = traitsOf(15, { cooperativeness: 5, adaptability: 6 });
    // 比較 API の平均と同じく、合計してから人数で割る（03 §7.3。lib/scoring/compare.ts の averageRecord）
    const averageOf = (scores: readonly number[]) =>
      scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const averages = traitsOf(15, {
      cooperativeness: averageOf([7, 7, 7.5]),
      adaptability: averageOf([8, 8, 8.5]),
    });
    // 浮動小数では 2 つの差が同じにならない（−2.166666666666667 と −2.166666666666666）
    expect(values.cooperativeness - averages.cooperativeness).not.toBe(
      values.adaptability - averages.adaptability,
    );
    expect(sorted(values, "diff", averages)).toEqual([
      ...TRAIT_KEYS.filter((k) => !["cooperativeness", "adaptability"].includes(k)),
      "cooperativeness",
      "adaptability",
    ]);
  });

  it("averages が null の「平均との差」と「項目順」→ 項目順（項目順は averages があっても項目順）", () => {
    const values = traitsOf(15, { cooperativeness: 25, leadership: 25 });
    expect(sorted(values, "diff", null)).toEqual([...TRAIT_KEYS]);
    expect(sorted(values, "def")).toEqual([...TRAIT_KEYS]);
    expect(sorted(values, "def", traitsOf(10, { communication: 0 }))).toEqual([...TRAIT_KEYS]);
  });

  it("TRAIT_KEYS を並べ替えず、凍結した新しい配列を返す", () => {
    const result = sorted(traitsOf(15, { communication: 30 }), "score");
    expect(result[0]).toBe("communication");
    expect(TRAIT_KEYS[0]).toBe("cooperativeness");
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("M7-result-07 fitLean（組織との相性の一言。11-4 §2.11）", () => {
  const lean = (subject: number, average: number) =>
    fitLean(subject, average, "個人優先型", "組織優先型");

  it.each([
    [60, 50, "組織より「組織優先型」寄り"],
    [44, 50, "組織より「個人優先型」寄り"],
    [55, 50, "組織とほぼ同じ"],
    [45, 50, "組織とほぼ同じ"],
    [-7, -2, "組織とほぼ同じ"], // 0 と 0 に収めて比べる
    [120, 100, "組織とほぼ同じ"], // 100 と 100
    [-7, 10, "組織より「個人優先型」寄り"], // 0 と 10
    [55.5, 50, "組織より「組織優先型」寄り"],
  ])("fitLean(%f, %f) → %s", (subject, average, expected) => {
    expect(lean(subject, average)).toBe(expected);
  });
});

describe("M7-result-12 小さい関数（11-4 §2.7.1・§2.7.2・§2.9・§2.11・§2.13.1・§2.6・§2.4）", () => {
  it("aptitudeOfHeading: <…> の中。<> が無ければ末尾の「。」と「に適性があります」を除く", () => {
    expect(aptitudeOfHeading("<人を活躍させる仕事>に適性があります")).toBe("人を活躍させる仕事");
    expect(aptitudeOfHeading("営業に適性があります。")).toBe("営業");
    expect(aptitudeOfHeading("営業に適性があります")).toBe("営業");
    // 付録C §1 の 16 タイプの見出しは、どれも <…> の中が取り出せる
    for (const key of APTITUDE_TYPE_KEYS) {
      const aptitude = aptitudeOfHeading(TYPE_TEXTS[key].aptitudeHeading);
      expect(aptitude, key).not.toBe("");
      expect(aptitude, key).not.toMatch(/[<>]|に適性があります/);
    }
  });

  it("senseShortName: 優位感覚の「（」より前（視覚・聴覚・言語感覚・体感覚）", () => {
    expect(senseShortName(DEVELOPMENT_GUIDES.environment_receptive.items.dominant_sense)).toBe(
      "視覚",
    );
    expect(senseShortName(DEVELOPMENT_GUIDES.inquiry_logical.items.dominant_sense)).toBe("聴覚");
    expect(senseShortName(DEVELOPMENT_GUIDES.sensory_open.items.dominant_sense)).toBe("言語感覚");
    expect(senseShortName(DEVELOPMENT_GUIDES.self_actualizing.items.dominant_sense)).toBe("体感覚");
    expect(senseShortName("視覚（Visual）")).toBe("視覚");
    expect(senseShortName("視覚")).toBe("視覚");
  });

  it("positionLines: 改行で分け、各行の先頭の「・」を除く", () => {
    expect(positionLines("・A\n・B")).toEqual(["A", "B"]);
    expect(positionLines("A\n・・B")).toEqual(["A", "・B"]);
    expect(positionLines(POSITION_DEFINITIONS.cooperative_leader.description)).toEqual([
      "責任者とスタッフの橋渡し役として活躍出来る方が多い",
      "周りと協調性を保ちながらバランスを取って集団をリードするタイプ",
      "幹部候補として活躍が期待出来る",
    ]);
  });

  it("detailHeading: 最初の「及び」を「・」に", () => {
    expect(detailHeading("情緒及び精神面")).toBe("情緒・精神面");
    expect(detailHeading("対人関係")).toBe("対人関係");
  });

  it("noComparisonText: 未選択・失敗・読み込み中・0 人の文言（§2.6）", () => {
    expect(noComparisonText("none", null)).toBe("右上で比較組織を選ぶと表示されます");
    expect(noComparisonText("error", "組織全体")).toBe("右上で比較組織を選ぶと表示されます");
    expect(noComparisonText("loading", "組織全体")).toBe("データを読み込んでいます");
    expect(noComparisonText("empty", formatScopeLabel({ kind: "team", teamCode: "A" }))).toBe(
      "「Aチーム」には比べられる回答がありません",
    );
    expect(noComparisonText("empty", formatScopeLabel({ kind: "organization" }))).toBe(
      "「組織全体」には比べられる回答がありません",
    );
  });

  it("受験日は Asia/Tokyo の暦日 yyyy/m/d（11-2 の formatYmd）", () => {
    expect(formatYmd("2026-04-04T15:30:00Z")).toBe("2026/4/5");
  });

  it("接し方のタブの既定はドライビング", () => {
    expect(DEFAULT_VIEWER_STYLE).toBe("driving");
  });
});
