// 結果詳細の表示の規則（11-4 §3.5 の result-detail-rules.ts・§5.1）。M7-result-04 rankRisks（並びと段階。段階の境目と色は
// colors.test.ts）、M7-result-06 sortTraitKeys、M7-result-07 fitLean、M7-result-08 aptitudeShares（育て方の資質の割合）、
// M7-result-09 splitStyleBody（接し方の本文の振り分け）、M7-result-10 howToTitle・splitHowTo（関わり方のコツの題と振り分け）、
// M7-result-12 小さい関数（aptitudeOfHeading・senseShortName・positionLines・detailHeading・noComparisonText と、受験日の formatYmd）。
// 本文と関わり方のコツの見本は文言マスタの文（STYLE_TEXTS。11-4 別表A と一致することは tests/unit/masters/texts.test.ts）
import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_GUIDES,
  POSITION_DEFINITIONS,
  STYLE_TEXTS,
  TYPE_TEXTS,
} from "@/lib/masters/texts";
import { formatScopeLabel } from "@/lib/presentation/comparison-view";
import { formatYmd } from "@/lib/presentation/format-datetime";
import {
  aptitudeOfHeading,
  aptitudeShares,
  DEFAULT_VIEWER_STYLE,
  detailHeading,
  fitLean,
  howToTitle,
  noComparisonText,
  positionLines,
  rankRisks,
  senseShortName,
  sortTraitKeys,
  splitHowTo,
  splitStyleBody,
} from "@/lib/presentation/result-detail-rules";
import { pickHighestTrait, pickLowestTrait } from "@/lib/presentation/trait-highlights";
import {
  APTITUDE_TYPE_KEYS,
  SOCIAL_STYLE_KEYS,
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

describe("M7-result-08 aptitudeShares（育て方の資質の割合。11-4 §2.13.1）", () => {
  it.each([
    // 行ごとに丸めるので合計は 99
    [
      [122.5, 90, 60, 25],
      ["41%", "30%", "20%", "8%"],
    ],
    // 68.75 は小数第 1 位の表示 68.8 にしてから割る
    [
      [68.75, 0, 0, 0],
      ["100%", "0%", "0%", "0%"],
    ],
    // 合計が 0 なら小数第 1 位の表示のまま（「%」なし）
    [
      [0, 0, 0, 0],
      ["0", "0", "0", "0"],
    ],
    // E2E のコンダクタータイプの見本（柔軟型 45・直感型 37.5・専門追求型 2.5・目標達成型 0。M7-result-30）
    [
      [45, 37.5, 2.5, 0],
      ["53%", "44%", "3%", "0%"],
    ],
  ])("aptitudeShares(%j) → %j", (values, expected) => {
    expect(aptitudeShares(values)).toEqual(expected);
  });

  it("各値の小数第 1 位の表示 f の比で計算する（8.75・1.25 → f は 8.8・1.3 で 87%・13%。丸める前の値の比なら 88%）", () => {
    expect(aptitudeShares([8.75, 1.25, 0, 0])).toEqual(["87%", "13%", "0%", "0%"]);
  });

  it("式の順は §2.13.1 の書き方のまま f ÷ 合計 × 100（左から計算する。57.5 ÷ 100 × 100 は浮動小数で 57.49999… になり 57%）", () => {
    // 資質の点数（1.25 刻み）でも起こる。f × 100 ÷ 合計 の順なら 57.5 で 58% になるので、式の順を仕様の書き方に揃える
    expect((57.5 / 100) * 100).toBeLessThan(57.5);
    expect((57.5 * 100) / 100).toBe(57.5);
    expect(aptitudeShares([57.5, 15, 15, 12.5])).toEqual(["57%", "15%", "15%", "13%"]);
  });

  it("並べ替えず、渡した順のまま（並べるのは呼ぶ側）。凍結した新しい配列", () => {
    const values = [2.5, 45, 0, 37.5];
    const shares = aptitudeShares(values);
    expect(shares).toEqual(["3%", "53%", "0%", "44%"]);
    expect(values).toEqual([2.5, 45, 0, 37.5]);
    expect(Object.isFrozen(shares)).toBe(true);
  });
});

describe("M7-result-09 splitStyleBody（接し方の本文の振り分け。11-4 §2.14.2）", () => {
  it("別表A のドライビングの本文（半角の括弧の行）→ 自己主張の行・キャッチ・〇〇派と段落 3", () => {
    const parts = splitStyleBody(STYLE_TEXTS.driving.body);
    expect(STYLE_TEXTS.driving.body.startsWith("(自己主張：強／感情表出：弱)\n")).toBe(true);
    expect(parts.assertion).toBe("自己主張：強／感情表出：弱");
    expect(parts.catchCopy).toBe("自分で決めて、自分で動く。口出しは無用です");
    expect(parts.kind).toBe("現実派");
    expect(parts.paragraphs).toHaveLength(3);
    expect(parts.paragraphs[0]).toMatch(/^生まれながらのリーダー肌。/);
    expect(parts.paragraphs[2]).toMatch(/^意見がぶつかっても怯まず、/);
  });

  it("エクスプレッシブ（全角の括弧。自己主張の行とキャッチの間に空の行を挟む）→ 感覚派", () => {
    const parts = splitStyleBody(STYLE_TEXTS.expressive.body);
    expect(STYLE_TEXTS.expressive.body).toContain("（自己主張：強／感情表出：強）\n\n「");
    expect(parts).toMatchObject({
      assertion: "自己主張：強／感情表出：強",
      kind: "感覚派",
      catchCopy: "どうせやるなら、みんなで楽しもう！",
    });
    expect(parts.paragraphs).toHaveLength(3);
  });

  it("4 スタイルとも、自己主張の行・キャッチ・〇〇派がそろい、段落はそれ以外の行（空の行を除く）を本文の順に持つ", () => {
    const want = {
      driving: [
        "自己主張：強／感情表出：弱",
        "現実派",
        "自分で決めて、自分で動く。口出しは無用です",
        3,
      ],
      expressive: ["自己主張：強／感情表出：強", "感覚派", "どうせやるなら、みんなで楽しもう！", 3],
      analytical: ["自己主張：弱／感情表出：弱", "思考派", "手順を守って、確実に仕上げたい", 3],
      amiable: ["自己主張：弱／感情表出：強", "協調派", "周りの力になりたい。頼られると嬉しい", 2],
    } as const;
    for (const style of SOCIAL_STYLE_KEYS) {
      const parts = splitStyleBody(STYLE_TEXTS[style].body);
      const lines = STYLE_TEXTS[style].body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      expect(
        [parts.assertion, parts.kind, parts.catchCopy, parts.paragraphs.length],
        style,
      ).toEqual([...want[style]]);
      // 段落は、本文の 4 行目以降（自己主張の行・キャッチの行・〇〇派の行の後）をそのままの順で
      expect(parts.paragraphs, style).toEqual(lines.slice(3));
    }
  });

  it("半角・全角の括弧のどちらでも読む（開きと閉じが違う種類でもよい）", () => {
    expect(splitStyleBody("（自己主張：強)\n「A」タイプ\n(現実派）\n本文")).toEqual({
      assertion: "自己主張：強",
      kind: "現実派",
      catchCopy: "A",
      paragraphs: ["本文"],
    });
  });

  it("括弧の行もキャッチも無い本文 → 全行が段落（行の前後の空白を除き、空の行は捨てる）", () => {
    expect(splitStyleBody("  一つ目の段落。\n\n\u3000二つ目の段落。 \n")).toEqual({
      assertion: "",
      kind: "",
      catchCopy: "",
      paragraphs: ["一つ目の段落。", "二つ目の段落。"],
    });
    expect(splitStyleBody("")).toEqual({ assertion: "", kind: "", catchCopy: "", paragraphs: [] });
  });

  it("キャッチの行の後ろに空白と（〇〇派）が続くときは、それも〇〇派。後の〇〇派の行は段落", () => {
    expect(splitStyleBody("「やってみよう」タイプ （行動派）\n（現実派）")).toEqual({
      assertion: "",
      kind: "行動派",
      catchCopy: "やってみよう",
      paragraphs: ["（現実派）"],
    });
  });

  it("それぞれ最初の 1 行だけ: 2 つ目の自己主張の行・キャッチの行・〇〇派の行は段落", () => {
    const body = [
      "（自己主張：弱）",
      "「A」タイプ",
      "（思考派）",
      "（自己主張：強）",
      "「B」タイプ",
      "（感覚派）",
    ].join("\n");
    expect(splitStyleBody(body)).toEqual({
      assertion: "自己主張：弱",
      kind: "思考派",
      catchCopy: "A",
      paragraphs: ["（自己主張：強）", "「B」タイプ", "（感覚派）"],
    });
  });

  it("〇〇派は括弧の中が 1〜8 文字で「派」で終わる行（9 文字は段落）。自己主張で始まらない括弧の行も段落", () => {
    expect(splitStyleBody("（一二三四五六七派）").kind).toBe("一二三四五六七派");
    expect(splitStyleBody("（一二三四五六七八派）")).toMatchObject({
      kind: "",
      paragraphs: ["（一二三四五六七八派）"],
    });
    expect(splitStyleBody("（感情表出：強）")).toMatchObject({
      assertion: "",
      paragraphs: ["（感情表出：強）"],
    });
  });

  it("凍結した値を返す", () => {
    const parts = splitStyleBody(STYLE_TEXTS.amiable.body);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(Object.isFrozen(parts.paragraphs)).toBe(true);
  });
});

describe("M7-result-10 howToTitle・splitHowTo（関わり方のコツ。11-4 §2.14.3）", () => {
  it("4 スタイルの 4 つの見出し（別表A）→ 見分け方・褒め方・効果的な対応・声かけ例", () => {
    for (const style of SOCIAL_STYLE_KEYS) {
      const t = STYLE_TEXTS[style];
      expect(
        [t.identifyHeading, t.praiseHeading, t.responseHeading, t.phrasesHeading].map(howToTitle),
        style,
      ).toEqual(["見分け方", "褒め方", "効果的な対応", "声かけ例"]);
    }
    expect(STYLE_TEXTS.driving.praiseHeading).toBe("ドライビングタイプを褒めるなら……");
  });

  it.each([
    ["ドライビングタイプへの効果的な対応", "効果的な対応"], // 「への」まで
    ["エミアブルタイプの見分け方", "見分け方"], // 「の」まで
    ["アナリティカルタイプを褒めるなら……", "褒め方"], // 「を」まで、末尾の「……」を除き、「褒めるなら」→「褒め方」
    ["アナリティカルタイプを励ますなら……", "励ますなら"], // 「褒めるなら」でなければ末尾の「……」を除くだけ
    ["声かけ例", "声かけ例"], // 「タイプ」が無ければ先頭は除かない
  ])("howToTitle(%s) → %s", (heading, title) => {
    expect(howToTitle(heading)).toBe(title);
  });

  it("ドライビングの褒め方 → 帯（×）1 行・帯（○）1 行・段落 1", () => {
    const parts = splitHowTo(STYLE_TEXTS.driving.praise, false);
    expect(parts.ng).toEqual(["「すごいですね」「さすがです」"]);
    expect(parts.ok).toEqual([
      {
        mark: "○",
        text: "「Aさんの進め方を参考に、私も〇〇に取り組んでいます」「いつも勉強になります」",
      },
    ]);
    expect([parts.bullets, parts.says]).toEqual([[], []]);
    expect(parts.paragraphs).toHaveLength(1);
    expect(parts.paragraphs[0]).toMatch(/^褒められることが得意ではなく、/);
  });

  it("ドライビングの見分け方 → 箇条書き 3・段落 1。声かけ例（isPhrases）→ 吹き出し 2・段落 1", () => {
    const identify = splitHowTo(STYLE_TEXTS.driving.identify, false);
    expect(identify.bullets).toEqual([
      "早口で、きっぱりと言い切る",
      "自分の意見をはっきり主張する",
      "堂々としていて、人によっては「怖そう」と受け取られる",
    ]);
    expect([identify.ng, identify.ok, identify.says, identify.paragraphs.length]).toEqual([
      [],
      [],
      [],
      1,
    ]);
    const phrases = splitHowTo(STYLE_TEXTS.driving.phrases, true);
    expect(phrases.says).toEqual([
      "「〇〇について、教えてもらえませんか？」",
      "「〇〇さんのお考えを、ぜひ聞かせてください」",
    ]);
    expect([phrases.bullets, phrases.paragraphs.length]).toEqual([[], 1]);
  });

  it("4 スタイルの 4 枚とも、帯・箇条書き・吹き出し・段落のどれかに全行が入る（エクスプレッシブの褒め方は ○ と ◎）", () => {
    for (const style of SOCIAL_STYLE_KEYS) {
      for (const field of ["identify", "praise", "response", "phrases"] as const) {
        const text = STYLE_TEXTS[style][field];
        const parts = splitHowTo(text, field === "phrases");
        const lines = text.split("\n").filter((line) => line.trim() !== "");
        const count =
          parts.ng.length +
          parts.ok.length +
          parts.bullets.length +
          parts.says.length +
          parts.paragraphs.length;
        expect(count, `${style}.${field}`).toBe(lines.length);
        expect(field === "phrases" ? parts.bullets : parts.says, `${style}.${field}`).toEqual([]);
      }
    }
    expect(splitHowTo(STYLE_TEXTS.expressive.praise, false).ok.map((o) => o.mark)).toEqual([
      "○",
      "◎",
    ]);
  });

  it("「✕」（U+2715）は「×」と同じ帯、「◯」（U+25EF）・「◎」は「○」と同じ帯（記号を持つ）。記号の後ろの文は先頭の 1 文字を除いたもの", () => {
    const parts = splitHowTo(
      ["\u00D7A", "\u2715B", "\u25CBC", "\u25EFD", "\u25CEE", "・F", "G"].join("\n"),
      false,
    );
    expect(parts).toEqual({
      ng: ["A", "B"],
      ok: [
        { mark: "\u25CB", text: "C" },
        { mark: "\u25EF", text: "D" },
        { mark: "\u25CE", text: "E" },
      ],
      bullets: ["F"],
      says: [],
      paragraphs: ["G"],
    });
  });

  it("「・」（U+30FB）の行は、声かけ例のカード（isPhrases）なら吹き出し、ほかのカードなら箇条書き（「・」を除く）", () => {
    expect(splitHowTo("・A\n・B", true)).toMatchObject({ says: ["A", "B"], bullets: [] });
    expect(splitHowTo("・A\n・B", false)).toMatchObject({ says: [], bullets: ["A", "B"] });
  });

  it("行の前後の空白を除き、空の行は捨て、種類ごとに本文の順を保つ。凍結した値を返す", () => {
    const parts = splitHowTo("  段落 1  \n\n ×B \n段落 2\n×A", false);
    expect(parts.ng).toEqual(["B", "A"]);
    expect(parts.paragraphs).toEqual(["段落 1", "段落 2"]);
    expect(Object.isFrozen(parts)).toBe(true);
    for (const list of [parts.ng, parts.ok, parts.bullets, parts.says, parts.paragraphs]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
    expect(splitHowTo("", true)).toEqual({ ng: [], ok: [], bullets: [], says: [], paragraphs: [] });
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
