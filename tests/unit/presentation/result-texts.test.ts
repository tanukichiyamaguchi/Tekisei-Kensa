// U-04（08 §3.2）: resolveTraitDetails（特性の詳細の 5 カテゴリ）、formatPopulationLabel、toPositionView。populationNote（X-11）は
// PR-7.8a で消した（母集団の注記を出さない。K-39 Q-27）。resolveResultTexts は消し、その観点（タイプ別の接し方の順と対象者の列、
// 育成方法の名前は表示名）は buildResultDetailView の M7-result-14（result-detail-view.test.ts）に移した（11-4 §5.5）
import { describe, expect, it, vi } from "vitest";

import {
  formatPopulationLabel,
  formatScopeLabel,
  toPositionView,
} from "@/lib/presentation/comparison-view";
import type * as MasterTexts from "@/lib/masters/texts";
import { TRAIT_DETAIL_CATEGORY_KEYS } from "@/lib/masters/texts/types";
import { resolveTraitDetails } from "@/lib/presentation/result-texts";
import { APTITUDE_TYPE_KEYS } from "@/lib/scoring/types";

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
      {
        category: "emotion",
        label: "情緒及び精神面",
        sentences: [
          "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
          "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
        ],
      },
    ]);
  });

  it("5 カテゴリを常に返す: 16 タイプとも、カテゴリの順（対人関係・行動特性・業務対応・環境適応・情緒及び精神面）の 5 つ", () => {
    for (const type of APTITUDE_TYPE_KEYS) {
      const groups = resolveTraitDetails(type);
      expect(
        groups.map((g) => g.category),
        type,
      ).toEqual([...TRAIT_DETAIL_CATEGORY_KEYS]);
      expect(Object.isFrozen(groups), type).toBe(true);
    }
  });

  it("本人のタイプに当たる文が 0 件のカテゴリも、空の配列で返す（合成のマスタ: 業務対応の文を除く）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/masters/texts", async (importOriginal) => {
      const actual = await importOriginal<typeof MasterTexts>();
      return {
        ...actual,
        TRAIT_DETAIL_SENTENCES: actual.TRAIT_DETAIL_SENTENCES.filter((s) => s.category !== "work"),
      };
    });
    try {
      const { resolveTraitDetails: resolve } = await import("@/lib/presentation/result-texts");
      const groups = resolve("conductor");
      expect(groups.map((g) => g.category)).toEqual([...TRAIT_DETAIL_CATEGORY_KEYS]);
      expect(groups.find((g) => g.category === "work")).toEqual({
        category: "work",
        label: "業務対応",
        sentences: [],
      });
      expect(groups.find((g) => g.category === "interpersonal")?.sentences).toHaveLength(3);
    } finally {
      vi.doUnmock("@/lib/masters/texts");
      vi.resetModules();
    }
  });
});

describe("comparison-view", () => {
  it("formatScopeLabel・formatPopulationLabel", () => {
    expect(formatScopeLabel({ kind: "organization" })).toBe("組織全体");
    expect(formatScopeLabel({ kind: "team", teamCode: "A" })).toBe("Aチーム");
    expect(formatPopulationLabel({ kind: "organization" }, 12)).toBe("比較対象: 組織全体（12 名）");
    expect(formatPopulationLabel({ kind: "team", teamCode: "A" }, 3)).toBe(
      "比較対象: Aチーム（3 名）",
    );
  });

  it("toPositionView は説明文を行に分けて各行の先頭の「・」を除き（11-4 §2.7.2・§2.11）、画像パスは識別子そのもの", () => {
    const view = toPositionView({ position: "cooperative_leader" });
    expect(view.label).toBe("協調性を重視するリーダータイプ");
    expect(view.descriptionLines).toEqual([
      "責任者とスタッフの橋渡し役として活躍出来る方が多い",
      "周りと協調性を保ちながらバランスを取って集団をリードするタイプ",
      "幹部候補として活躍が期待出来る",
    ]);
    expect(view.imagePath).toBe("/images/positions/cooperative_leader.svg");
  });
});
