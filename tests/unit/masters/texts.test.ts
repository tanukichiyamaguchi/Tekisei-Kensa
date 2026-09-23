// 文言マスタの不変条件 X-01〜X-07（06 §10.6、08 §7.4・§7.7）と生成スクリプトの失敗条件
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { build, GenerationError } from "../../../scripts/generate-texts";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import {
  CLASSIFICATION_AXES,
  CLASSIFICATION_EMPTY_MESSAGE,
  CLASSIFICATION_TEXTS,
  DEVELOPMENT_GUIDE_ITEM_KEYS,
  DEVELOPMENT_GUIDE_ITEMS,
  DEVELOPMENT_GUIDES,
  POSITION_DEFINITIONS,
  STYLE_INTERACTIONS,
  STYLE_TEXTS,
  STYLE_VIEWER_HEADINGS,
  TRAIT_DETAIL_CATEGORIES,
  TRAIT_DETAIL_CATEGORY_KEYS,
  TRAIT_DETAIL_SENTENCES,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
} from "@/lib/masters/texts";
import { resolveTraitDetails } from "@/lib/presentation/result-texts";
import { POSITION_RULES } from "@/lib/scoring/compare";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  POSITION_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const C = read("docs/付録C_表示文言マスタ.md");

function expectNonEmptyStrings(value: object) {
  for (const [field, text] of Object.entries(value)) {
    if (typeof text === "string") expect(text.trim(), field).not.toBe("");
  }
}

describe("X-01 全キーを持ち、各文字列が空でない", () => {
  it("TYPE_TEXTS（16 タイプ）", () => {
    expect(Object.keys(TYPE_TEXTS).sort()).toEqual([...APTITUDE_TYPE_KEYS].sort());
    for (const key of APTITUDE_TYPE_KEYS) {
      expect(TYPE_TEXTS[key].key).toBe(key);
      expectNonEmptyStrings(TYPE_TEXTS[key]);
    }
    expect(TYPE_TEXTS.attendant.aptitudeHeading).toBe("<人と接する機会の多い仕事>に適性があります");
  });

  it("TRAIT_HIGHLIGHT_TEXTS（16 尺度）", () => {
    expect(Object.keys(TRAIT_HIGHLIGHT_TEXTS).sort()).toEqual([...TRAIT_KEYS].sort());
    for (const key of TRAIT_KEYS) expectNonEmptyStrings(TRAIT_HIGHLIGHT_TEXTS[key]);
    expect(TRAIT_HIGHLIGHT_TEXTS.cooperativeness.highPositive).toBe("好印象、性善説、リベラリスト");
    expect(TRAIT_HIGHLIGHT_TEXTS.communication.lowNegative).toBe("地味、人嫌い");
  });

  it("DEVELOPMENT_GUIDES（4 型）", () => {
    expect(Object.keys(DEVELOPMENT_GUIDES).sort()).toEqual([...APTITUDE_KEYS].sort());
    for (const key of APTITUDE_KEYS) expectNonEmptyStrings(DEVELOPMENT_GUIDES[key].items);
  });

  it("STYLE_TEXTS（4 分類 × 12 項目）", () => {
    expect(Object.keys(STYLE_TEXTS).sort()).toEqual([...SOCIAL_STYLE_KEYS].sort());
    for (const key of SOCIAL_STYLE_KEYS) {
      expect(Object.keys(STYLE_TEXTS[key])).toHaveLength(13);
      expectNonEmptyStrings(STYLE_TEXTS[key]);
    }
    expect(STYLE_TEXTS.driving.typeName).toBe("ドライビングタイプ");
    expect(STYLE_TEXTS.driving.greatPersonName).toBe("ナポレオン");
  });

  it("CLASSIFICATION_TEXTS・CLASSIFICATION_AXES・0 名の文言", () => {
    expect(Object.keys(CLASSIFICATION_TEXTS).sort()).toEqual([...SOCIAL_STYLE_KEYS].sort());
    for (const key of SOCIAL_STYLE_KEYS) expectNonEmptyStrings(CLASSIFICATION_TEXTS[key]);
    expect(CLASSIFICATION_AXES).toEqual({
      emotion: { suppress: "感情表現を抑える", express: "感情を表す" },
      assertion: { listen: "意見を聞く", assert: "意見を主張する" },
    });
    expect(CLASSIFICATION_EMPTY_MESSAGE).toBe("本タイプの回答者はいません。");
    // 付録C §8 の位置（分析型 = 感情を抑える × 意見を聞く など）
    expect(
      SOCIAL_STYLE_KEYS.map((k) => [
        k,
        CLASSIFICATION_TEXTS[k].emotionAxis,
        CLASSIFICATION_TEXTS[k].assertionAxis,
      ]),
    ).toEqual([
      ["driving", "suppress", "assert"],
      ["expressive", "express", "assert"],
      ["analytical", "suppress", "listen"],
      ["amiable", "express", "listen"],
    ]);
    // 説明文は分類ごとに英名で始まる
    for (const key of SOCIAL_STYLE_KEYS) {
      expect(CLASSIFICATION_TEXTS[key].description.toLowerCase().startsWith(key)).toBe(true);
    }
  });

  it("POSITION_DEFINITIONS（5 段階）。説明文は改行区切りでタグを含まない", () => {
    expect(Object.keys(POSITION_DEFINITIONS).sort()).toEqual([...POSITION_KEYS].sort());
    for (const key of POSITION_KEYS) {
      const def = POSITION_DEFINITIONS[key];
      expectNonEmptyStrings(def);
      const lines = def.description.split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(def.description).not.toMatch(/<[^>]+>/);
    }
    expect(POSITION_DEFINITIONS.strong_leader.label).toBe("個が強いリーダータイプ");
    expect(POSITION_DEFINITIONS.unfit.label).toBe("アンフィットネス");
  });
});

describe("X-02 TRAIT_DETAIL_SENTENCES", () => {
  it("appliesTo が空でなく重複がなく 16 タイプの要素のみ。カテゴリごとの sortOrder が 1 からの連番", () => {
    for (const s of TRAIT_DETAIL_SENTENCES) {
      expect(s.appliesTo.length).toBeGreaterThan(0);
      expect(new Set(s.appliesTo).size).toBe(s.appliesTo.length);
      for (const t of s.appliesTo) expect(APTITUDE_TYPE_KEYS).toContain(t);
    }
    for (const category of TRAIT_DETAIL_CATEGORY_KEYS) {
      const orders = TRAIT_DETAIL_SENTENCES.filter((s) => s.category === category).map(
        (s) => s.sortOrder,
      );
      expect(orders).toEqual(orders.map((_, i) => i + 1));
    }
    expect(TRAIT_DETAIL_SENTENCES).toHaveLength(45);
  });

  it("カテゴリは付録C §2 の記載順（06 D06-13）", () => {
    expect(TRAIT_DETAIL_CATEGORIES.map((c) => c.label)).toEqual([
      "対人関係",
      "行動特性",
      "情緒及び精神面",
      "業務対応",
      "環境適応",
    ]);
  });
});

describe("X-03 DEVELOPMENT_GUIDES", () => {
  it("4 型すべてが 14 項目を持ち、項目名は付録C §4 の順", () => {
    for (const key of APTITUDE_KEYS) {
      expect(Object.keys(DEVELOPMENT_GUIDES[key].items)).toEqual([...DEVELOPMENT_GUIDE_ITEM_KEYS]);
    }
    expect(DEVELOPMENT_GUIDE_ITEMS.map((i) => i.label)).toEqual([
      "特徴",
      "本タイプへのアプローチ",
      "思考",
      "優位感覚",
      "周りからの印象",
      "感情",
      "性格",
      "最優先対象",
      "聞き方",
      "行動",
      "話し方",
      "学習スタイル",
      "他タイプとの相性",
      "対人関係",
    ]);
  });

  it("見出しの表示名は 00 §1.4 の label（内部名は使わない）", () => {
    expect(APTITUDE_DEFINITIONS.map((a) => a.label).sort()).toEqual(
      ["直感型", "柔軟型", "目標達成型", "専門追求型"].sort(),
    );
  });
});

describe("X-04 STYLE_INTERACTIONS", () => {
  it("4 × 4 = 16 件すべて非空、STYLE_VIEWER_HEADINGS が 4 件", () => {
    for (const viewer of SOCIAL_STYLE_KEYS) {
      for (const target of SOCIAL_STYLE_KEYS) {
        expect(STYLE_INTERACTIONS[viewer][target].trim()).not.toBe("");
      }
    }
    expect(STYLE_VIEWER_HEADINGS).toEqual({
      driving: "ドライビングなあなたは",
      expressive: "エクスプレッシブなあなたは",
      analytical: "アナリティカルなあなたは",
      amiable: "エミアブルなあなたは",
    });
    expect(STYLE_INTERACTIONS.expressive.expressive.startsWith("相性が合えば")).toBe(true);
    expect(STYLE_INTERACTIONS.analytical.amiable.startsWith("感情も意見も表に出さない")).toBe(true);
  });
});

describe("X-05 CLASSIFICATION_TEXTS の characterOrder", () => {
  it("和集合が 16 タイプと一致し、各タイプの所属分類が APTITUDE_TYPE_DEFINITIONS と一致する", () => {
    const all = SOCIAL_STYLE_KEYS.flatMap((k) => CLASSIFICATION_TEXTS[k].characterOrder);
    expect([...all].sort()).toEqual([...APTITUDE_TYPE_KEYS].sort());
    for (const style of SOCIAL_STYLE_KEYS) {
      for (const type of CLASSIFICATION_TEXTS[style].characterOrder) {
        expect(APTITUDE_TYPE_DEFINITIONS.find((t) => t.key === type)?.socialStyle).toBe(style);
      }
    }
    expect(CLASSIFICATION_TEXTS.analytical.characterOrder).toEqual([
      "scientist",
      "professional",
      "creator",
      "artist",
    ]);
  });
});

describe("X-06 POSITION_DEFINITIONS の閾値は 03 POSITION_RULES から導く", () => {
  it("minDeviation が POSITION_RULES と一致し、maxDeviation は 1 つ上の段階の下限", () => {
    POSITION_RULES.forEach((rule, i) => {
      const def = POSITION_DEFINITIONS[rule.key];
      expect(def.minDeviation).toBe(rule.minDeviation);
      expect(def.maxDeviation).toBe(i === 0 ? null : POSITION_RULES[i - 1]!.minDeviation);
    });
    expect(POSITION_DEFINITIONS.follower).toMatchObject({ minDeviation: 40, maxDeviation: 50 });
    expect(POSITION_DEFINITIONS.unfit).toMatchObject({ minDeviation: null, maxDeviation: 30 });
  });
});

describe("X-07 resolveTraitDetails が付録C §2 の表と一致（転記漏れの検出）", () => {
  // 付録C §2 を生成スクリプトとは別の簡易な読み方で読み、期待値を作る
  const shortLabelToKey = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.shortLabel, t.key]));
  const section = C.slice(C.indexOf("## 2. "), C.indexOf("## 3. "));
  const expected = new Map<string, Array<{ label: string; text: string; types: string[] }>>();
  let category = "";
  for (const line of section.split("\n")) {
    if (line.startsWith("### ")) category = line.slice(4).trim();
    const m = /^\| (.+?) \| (.+?) \|$/.exec(line);
    if (!m || m[1] === "定型文" || m[1]!.startsWith("---")) continue;
    const types = m[2]!.split("、").map((s) => shortLabelToKey.get(s.trim()) ?? `?${s}`);
    expected.set(category, [
      ...(expected.get(category) ?? []),
      { label: category, text: m[1]!, types },
    ]);
  }

  it.each(APTITUDE_TYPE_KEYS)("%s", (type) => {
    const want = [...expected.entries()]
      .map(([label, rows]) => ({
        label,
        sentences: rows.filter((r) => r.types.includes(type)).map((r) => r.text),
      }))
      .filter((g) => g.sentences.length > 0);
    expect(
      resolveTraitDetails(type).map((g) => ({ label: g.label, sentences: g.sentences })),
    ).toEqual(want);
  });
});

describe("generate-texts（08 §7.4）", () => {
  function replaceOnce(text: string, from: string, to: string): string {
    const index = text.indexOf(from);
    if (index < 0 || text.indexOf(from, index + 1) >= 0) throw new Error(`一意でない: ${from}`);
    return text.slice(0, index) + to + text.slice(index + from.length);
  }

  it("現在の付録C から生成でき、コミット済みの生成物と同じ項を持つ", () => {
    const g = build(C);
    const committed = JSON.parse(read("lib/masters/data/texts/type-texts.json")) as {
      items: unknown[];
    };
    expect(g.typeTexts).toEqual(committed.items);
    expect(g.traitDetails.sentences).toHaveLength(45);
    expect(g.styleInteractions).toHaveLength(16);
  });

  const broken: Array<[string, string, string]> = [
    ["特性詳細に未知のタイプ名", "| 主張せず他に依存する意識が強い。 | フォロワー、", "| 主張せず他に依存する意識が強い。 | フォロア、"],
    ["特性詳細で同じタイプが重複", "| 自分に厳しく他人には攻撃的。 | コントローラー、アクター、", "| 自分に厳しく他人には攻撃的。 | コントローラー、コントローラー、"],
    ["§1 の表のキャラクター名が 00 §1.6 と違う", "| アテンダントタイプ | Expressive | ハルカ |", "| アテンダントタイプ | Expressive | ハルコ |"],
    ["§1 の表の組織内分類が付録B と違う", "| フォロワータイプ | Amiable | ナオ |", "| フォロワータイプ | Driving | ナオ |"],
    ["§3 の尺度名が写像できない", "| 協力性 | 好印象", "| 協調性 | 好印象"],
    ["§4 の内部名が写像できない", "### 専門追求型（探求論理型）", "### 専門追求型（探求型）"],
    ["§4 の表示名が 00 §1.4 と違う", "| 環境受容型 | 柔軟型 |", "| 環境受容型 | 協調型 |"],
    ["§5 の見出しが未知", "**偉人名（イラスト）**\n\n```\nナポレオン", "**偉人（イラスト）**\n\n```\nナポレオン"],
    ["§6 の閾値が POSITION_RULES と違う", "| 60 以上 | 個が強いリーダータイプ |", "| 65 以上 | 個が強いリーダータイプ |"],
    ["§8 のひらがな名が 00 §1.6 と違う", "あいり（サイエンティスト）", "あいこ（サイエンティスト）"],
    ["§8 のキャラクターの所属分類が違う", "ひなた（パイオニア）、なつき（コントローラー）", "なお（フォロワー）、なつき（コントローラー）"],
  ]; // prettier-ignore

  it.each(broken)("%s → GenerationError", (_name, from, to) => {
    expect(() => build(replaceOnce(C, from, to))).toThrow(GenerationError);
  });
});
