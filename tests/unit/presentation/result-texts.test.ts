// U-04（08 §3.2）: resolveResultTexts の代表ケース、populationNote（X-11）、formatPopulationLabel、toPositionView
import { describe, expect, it } from "vitest";

import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import {
  formatPopulationLabel,
  formatScopeLabel,
  populationNote,
  toPositionView,
} from "@/lib/presentation/comparison-view";
import { resolveResultTexts, resolveTraitDetails } from "@/lib/presentation/result-texts";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ScoreResult } from "@/lib/scoring/types";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

describe("resolveTraitDetails（付録C §2 のコンダクタータイプの表示例）", () => {
  it("該当する文だけをカテゴリ順・定義順に並べる", () => {
    expect(resolveTraitDetails("conductor")).toEqual([
      {
        category: "interpersonal",
        label: "対人関係",
        sentences: [
          "人の面倒をよく見ることができ、自主的に行動することができる。",
          "指導者的立場をとるよりも人の意見を素直に聞こうとする意識が強い。",
          "外向的であるが目立つことを好まず、初対面では大人しく見られがちである。",
        ],
      },
      {
        category: "behavior",
        label: "行動特性",
        sentences: ["決断力がありじっくり考えるより行動を優先する。臨機応変で好奇心が強い。"],
      },
      {
        category: "emotion",
        label: "情緒及び精神面",
        sentences: [
          "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
          "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
        ],
      },
      {
        category: "work",
        label: "業務対応",
        sentences: [
          "目標達成に対する意識が高い。責任感が強く負けず嫌い。積極的で根性あり。",
          "自信を持っており仕事の処理も早い。体を動かすことが好きである。",
        ],
      },
      {
        category: "environment",
        label: "環境適応",
        sentences: [
          "集団内でのバランス感覚に優れ、周りを考えながら自己の主張ができる。",
          "自己実現への達成意欲が高く粘り強い。集団依存せず個としての行動ができる。",
          "環境に順応しやすく、組織を重視し現実主義。客観的かつ冷静な判断ができる。",
          "現状肯定的・妥協的に物事を考え、周りを意識して意思決定することが多い。",
        ],
      },
    ]);
  });
});

describe("resolveResultTexts", () => {
  const cyclic = scoreAnswers(cyclicAnswers());

  it("タイプ・キャラクター名・最高/最低の尺度・育成方法・スタイルを結果から引く", () => {
    const texts = resolveResultTexts(cyclic);
    expect(texts.type.key).toBe(cyclic.aptitudeType);
    expect(texts.characterName).not.toBe("");
    // P-01: 最高 rule_compliance、最低 humility
    expect(texts.highest.highlight.key).toBe("rule_compliance");
    expect(texts.highest.label).toBe("規則遵守力");
    expect(texts.highest.positive).toBe("決まりを守る、集団行動を好む");
    expect(texts.highest.negative).toBe("細かいマニュアルが必要、自分で判断出来ない");
    expect(texts.lowest.highlight.key).toBe("humility");
    expect(texts.lowest.label).toBe("謙虚さ");
    expect(texts.lowest.positive).toBe("自信家、積極的");
    expect(texts.lowest.negative).toBe("発言が強気、態度が大きい");
    expect(texts.allTraitsEqual).toBe(false);
    expect(texts.developmentFirst.key).toBe(cyclic.aptitudeFirst);
    expect(texts.developmentSecond.key).toBe(cyclic.aptitudeSecond);
    expect(texts.style.key).toBe(cyclic.socialStyle);
  });

  it("タイプ別の対処法は 4 見出しを付録C §5 の表の行順で出し、対象者のスタイルの列を使う", () => {
    const result: ScoreResult = { ...cyclic, socialStyle: "amiable" };
    const texts = resolveResultTexts(result);
    expect(texts.styleInteractions.map((s) => s.heading)).toEqual([
      "ドライビングなあなたは",
      "エクスプレッシブなあなたは",
      "エミアブルなあなたは",
      "アナリティカルなあなたは",
    ]);
    expect(texts.styleInteractions[0]!.text.startsWith("穏やかに対話する事を好むエミアブル")).toBe(
      true,
    );
  });

  it("育成方法の見出しは表示名（内部名は出さない）", () => {
    const result: ScoreResult = {
      ...cyclic,
      aptitudeFirst: "sensory_open",
      aptitudeSecond: "inquiry_logical",
    };
    const texts = resolveResultTexts(result);
    expect(texts.developmentFirst.label).toBe("直感型");
    expect(texts.developmentSecond.label).toBe("専門追求型");
    expect(texts.developmentFirst.guide.items.characteristics).not.toBe("");
  });

  it("全尺度同点なら allTraitsEqual = true（06 D06-12）で、最高・最低が同じ尺度", () => {
    const texts = resolveResultTexts(scoreAnswers(uniformAnswers(3)));
    expect(texts.allTraitsEqual).toBe(true);
    expect(texts.highest.highlight.key).toBe(texts.lowest.highlight.key);
  });
});

describe("comparison-view", () => {
  it("X-11 populationNote", () => {
    expect(populationNote(1, true)).toBe(ADMIN_TEXTS.populationSubjectOnly); // T-11
    expect(populationNote(1, false)).toBe(ADMIN_TEXTS.populationSingleOther); // T-27
    expect(populationNote(2, false)).toBe(ADMIN_TEXTS.subjectNotInPopulation); // T-28
    expect(populationNote(2, true)).toBeNull();
    expect(populationNote(0, false)).toBeNull();
    expect(ADMIN_TEXTS.populationSubjectOnly).toBe(
      "比較対象は本人のみのため、合致度・偏差値は参考値です",
    );
  });

  it("formatScopeLabel・formatPopulationLabel", () => {
    expect(formatScopeLabel({ kind: "organization" })).toBe("組織全体");
    expect(formatScopeLabel({ kind: "team", teamCode: "A" })).toBe("Aチーム");
    expect(formatPopulationLabel({ kind: "organization" }, 12)).toBe("比較対象: 組織全体（12 名）");
    expect(formatPopulationLabel({ kind: "team", teamCode: "A" }, 3)).toBe(
      "比較対象: Aチーム（3 名）",
    );
  });

  it("toPositionView は説明文を行に分け、画像パスは識別子そのもの", () => {
    const view = toPositionView({ position: "cooperative_leader" });
    expect(view.label).toBe("協調性を重視するリーダータイプ");
    expect(view.descriptionLines).toEqual([
      "・院長先生とスタッフの橋渡し役として活躍出来る方が多い",
      "・周りと協調性を保ちながらバランスを取って集団をリードするタイプ",
      "・幹部候補として活躍が期待出来る",
    ]);
    expect(view.imagePath).toBe("/images/positions/cooperative_leader.svg");
  });
});
