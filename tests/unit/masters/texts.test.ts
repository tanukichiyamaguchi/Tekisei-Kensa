// 文言マスタの不変条件 X-01〜X-07（06 §10.6、08 §7.4・§7.7）と、M7 の文言マスタ（11-3 M7-zaiseki-01・02、
// 11-4 M7-result-15・16）。生成スクリプトの失敗条件は generator.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
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
  TRAIT_DESCRIPTIONS,
  TRAIT_DETAIL_CATEGORIES,
  TRAIT_DETAIL_CATEGORY_KEYS,
  TRAIT_DETAIL_SENTENCES,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
  type SocialStyleTexts,
  type TraitDetailCategoryKey,
} from "@/lib/masters/texts";
import { resolveTraitDetails } from "@/lib/presentation/result-texts";
import { POSITION_RULES } from "@/lib/scoring/compare";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  POSITION_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type AptitudeTypeKey,
  type SocialStyleKey,
} from "@/lib/scoring/types";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const C = read("docs/付録C_表示文言マスタ.md");
const SPEC_ZAISEKI = read("docs/基本設計/11_参照元の更新/11-3_在籍・退職と組織内分類.md");
const SPEC_RESULT = read("docs/基本設計/11_参照元の更新/11-4_結果詳細.md");

/** start の位置から end の手前まで（仕様書の節・別表を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

const STYLE_BY_EN = new Map(SOCIAL_STYLE_DEFINITIONS.map((s) => [s.labelEn, s.key]));
const TYPE_BY_SHORT_LABEL = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.shortLabel, t.key]));

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
    for (const key of SOCIAL_STYLE_KEYS) {
      expectNonEmptyStrings(CLASSIFICATION_TEXTS[key]);
      for (const character of CLASSIFICATION_TEXTS[key].characters) {
        expectNonEmptyStrings(character);
      }
    }
    expect(CLASSIFICATION_AXES).toEqual({
      emotion: { suppress: "感情表現を抑える", express: "感情を表す" },
      assertion: { listen: "意見を聞く", assert: "意見を主張する" },
    });
    expect(CLASSIFICATION_EMPTY_MESSAGE).toBe("この分類の回答者はまだいません。");
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

  it("カテゴリは付録C §2 の記載順（11-4 §2.9）", () => {
    expect(TRAIT_DETAIL_CATEGORIES.map((c) => c.label)).toEqual([
      "対人関係",
      "行動特性",
      "業務対応",
      "環境適応",
      "情緒及び精神面",
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
    expect(STYLE_INTERACTIONS.expressive.expressive.startsWith("波長が合えば")).toBe(true);
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
      "artist",
      "creator",
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
  const section = C.slice(C.indexOf("## 2. "), C.indexOf("## 3. "));
  const expected = new Map<string, Array<{ label: string; text: string; types: string[] }>>();
  let category = "";
  for (const line of section.split("\n")) {
    if (line.startsWith("### ")) category = line.slice(4).trim();
    const m = /^\| (.+?) \| (.+?) \|$/.exec(line);
    if (!m || m[1] === "定型文" || m[1]!.startsWith("---")) continue;
    const types = m[2]!.split("、").map((s) => TYPE_BY_SHORT_LABEL.get(s.trim()) ?? `?${s}`);
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

describe("M7-zaiseki-01 付録C §1 のキャラクターの文言の修正（11-3 §2.21、K-32 ⑧）", () => {
  // 11-3 §2.21 の直した後の文（コントローラー、アーティストの順）
  const fixed = [
    ...between(SPEC_ZAISEKI, "### 2.21 ", "### 2.22 ").matchAll(
      /^ {4}```text\n {4}(.+)\n {4}```$/gm,
    ),
  ].map((m) => m[1]!);

  it("コントローラーの特徴は同じ文の繰り返しが無く、§2.21 の文と一致する", () => {
    expect(fixed).toHaveLength(2);
    const characteristics = TYPE_TEXTS.controller.characteristics;
    expect(characteristics.startsWith("組織のリーダー的役割を果たすことができます。")).toBe(true);
    expect(characteristics.split("組織のリーダー的役割を果たすことができます。")).toHaveLength(2);
    expect(characteristics).toBe(fixed[0]);
  });

  it("アーティストの特徴は「思われることもあります」で、付録C と type-texts.json に「思われこと」が無い", () => {
    expect(TYPE_TEXTS.artist.characteristics).toContain("思われることもあります");
    expect(TYPE_TEXTS.artist.characteristics).toBe(fixed[1]);
    expect(C).not.toContain("思われこと");
    expect(read("lib/masters/data/texts/type-texts.json")).not.toContain("思われこと");
  });
});

describe("M7-zaiseki-02 CLASSIFICATION_TEXTS（11-3 §3.9。06 X-05 の改め）", () => {
  it("characterOrder はマップの順（分類の中の 左上・右上・左下・右下）", () => {
    expect(
      Object.fromEntries(SOCIAL_STYLE_KEYS.map((k) => [k, CLASSIFICATION_TEXTS[k].characterOrder])),
    ).toEqual({
      analytical: ["scientist", "professional", "artist", "creator"],
      driving: ["reviewer", "pioneer", "controller", "actor"],
      amiable: ["specialist", "conductor", "follower", "generalist"],
      expressive: ["attendant", "promoter", "receptionist", "freelancer"],
    });
  });

  it("characters の column・row と位置の説明 16 件が 11-3 §3.9 の表と一致する", () => {
    // 11-3 §3.9 の位置の表を、生成スクリプトとは別の簡易な読み方で読む
    const CELLS: Readonly<Record<string, readonly [0 | 1, 0 | 1]>> = {
      左上: [0, 0],
      右上: [1, 0],
      左下: [0, 1],
      右下: [1, 1],
    };
    const table = between(
      between(SPEC_ZAISEKI, "### 3.9 ", "\n## 4. "),
      "キャラクターの位置と説明:",
      "分類の説明文:",
    );
    const expected = new Map<AptitudeTypeKey, { column: 0 | 1; row: 0 | 1; text: string }>();
    for (const m of table.matchAll(/^\| .+?（(.+?)） \| (左上|右上|左下|右下) \| (.+) \|$/gm)) {
      const [column, row] = CELLS[m[2]!]!;
      expected.set(TYPE_BY_SHORT_LABEL.get(m[1]!)!, { column, row, text: m[3]! });
    }
    expect(expected.size).toBe(16);

    const characters = SOCIAL_STYLE_KEYS.flatMap((k) => CLASSIFICATION_TEXTS[k].characters);
    expect(characters).toHaveLength(16);
    for (const c of characters) {
      const want = expected.get(c.aptitudeType)!;
      expect([c.column, c.row, c.positionDescription], c.aptitudeType).toEqual([
        want.column,
        want.row,
        want.text,
      ]);
    }
    for (const key of SOCIAL_STYLE_KEYS) {
      const { characters: list, characterOrder } = CLASSIFICATION_TEXTS[key];
      expect(list.map((c) => c.aptitudeType)).toEqual(characterOrder);
      expect(list.map((c) => [c.column, c.row])).toEqual([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]);
      expect(Object.isFrozen(list[0])).toBe(true);
    }
  });

  it("説明文はカタカナ名＋「タイプ」で始まり、0 人の文言は「この分類の回答者はまだいません。」", () => {
    for (const style of SOCIAL_STYLE_DEFINITIONS) {
      expect(
        CLASSIFICATION_TEXTS[style.key].description.startsWith(`${style.labelKatakana}タイプ`),
      ).toBe(true);
    }
    expect(CLASSIFICATION_EMPTY_MESSAGE).toBe("この分類の回答者はまだいません。");
  });
});

describe("M7-result-15 文言マスタ（11-4 §3.3）", () => {
  const sentencesOf = (type: AptitudeTypeKey, category: TraitDetailCategoryKey) =>
    TRAIT_DETAIL_SENTENCES.filter((s) => s.category === category && s.appliesTo.includes(type))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.text);

  it("TRAIT_DETAIL_CATEGORY_KEYS は 対人関係・行動特性・業務対応・環境適応・情緒及び精神面 の順", () => {
    expect(TRAIT_DETAIL_CATEGORY_KEYS).toEqual([
      "interpersonal",
      "behavior",
      "work",
      "environment",
      "emotion",
    ]);
    expect(TRAIT_DETAIL_CATEGORIES.map((c) => c.key)).toEqual([...TRAIT_DETAIL_CATEGORY_KEYS]);
  });

  it("「楽観的で開放的。…」は行動特性（プロモーターの行動特性 3 文・情緒及び精神面 3 文）", () => {
    expect(sentencesOf("promoter", "behavior")).toEqual([
      "気さくな性質で人と打ち解けるのが早い。即断即決するため後悔も多い。",
      "決断力がありじっくり考えるより行動を優先する。臨機応変で好奇心が強い。",
      "楽観的で開放的。些細な事を気にせず明るいほうに考えることが多い。",
    ]);
    expect(sentencesOf("promoter", "emotion")).toEqual([
      "開放的で明るい方に考え、頭の切り替えが早いため悩みが継続しにくい。",
      "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
      "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
    ]);
  });

  it("TRAIT_DESCRIPTIONS が 16 キーそろい、空の文が無い", () => {
    expect(Object.keys(TRAIT_DESCRIPTIONS).sort()).toEqual([...TRAIT_KEYS].sort());
    for (const key of TRAIT_KEYS) {
      expect(TRAIT_DESCRIPTIONS[key].key).toBe(key);
      expectNonEmptyStrings(TRAIT_DESCRIPTIONS[key]);
    }
    expect(Object.isFrozen(TRAIT_DESCRIPTIONS)).toBe(true);
  });

  it("STYLE_TEXTS が 11-4 別表A と一致する", () => {
    // 別表A を、生成スクリプトとは別の簡易な読み方で読む（見出しの順に 12 項目）
    const FIELD_BY_LABEL: Readonly<Record<string, Exclude<keyof SocialStyleTexts, "key">>> = {
      タイプ名: "typeName",
      "偉人名（イラスト）": "greatPersonName",
      本文: "body",
      対処法見出し: "interactionHeading",
      "見分け方（見出し）": "identifyHeading",
      見分け方: "identify",
      "褒め方（見出し）": "praiseHeading",
      褒め方: "praise",
      "効果的な対応（見出し）": "responseHeading",
      効果的な対応: "response",
      "声かけ例（見出し）": "phrasesHeading",
      声かけ例: "phrases",
    };
    const appendixA = between(SPEC_RESULT, "## 別表A ", "## 別表B ");
    const styles = appendixA.split(/^### /m).slice(1);
    expect(styles).toHaveLength(4);
    for (const block of styles) {
      const en = /^.+タイプ（(.+)）$/m.exec(block)![1]!;
      const key = STYLE_BY_EN.get(en)!;
      const blocks = [...block.matchAll(/^\*\*(.+)\*\*\n\n```\n([\s\S]*?)\n```$/gm)];
      expect(blocks.map((b) => b[1])).toEqual(Object.keys(FIELD_BY_LABEL));
      const want = Object.fromEntries(blocks.map((b) => [FIELD_BY_LABEL[b[1]!], b[2]]));
      expect(STYLE_TEXTS[key]).toEqual({ key, ...want });
    }
  });

  it("STYLE_INTERACTIONS が 11-4 別表B と一致する", () => {
    const rows = between(SPEC_RESULT, "## 別表B ", "## 別表C ")
      .split("\n")
      .filter((l) => l.startsWith("| "))
      .map((l) => l.slice(2, -2).split(" | "));
    const [header, ...body] = rows;
    const targets = header!.slice(1).map((en) => STYLE_BY_EN.get(en)!);
    const viewerByHeading = new Map(
      SOCIAL_STYLE_DEFINITIONS.map((s) => [`${s.labelKatakana}なあなたは`, s.key]),
    );
    expect(body).toHaveLength(4);
    const want: Partial<Record<SocialStyleKey, Partial<Record<SocialStyleKey, string>>>> = {};
    for (const [heading, ...texts] of body) {
      const viewer = viewerByHeading.get(heading!)!;
      want[viewer] = Object.fromEntries(targets.map((t, i) => [t, texts[i]]));
    }
    expect(STYLE_INTERACTIONS).toEqual(want);
  });
});

describe("M7-result-16 表示の文言の検査（文言マスタ: 11-4 別表A〜C）", () => {
  it("別表A・B・C の文（STYLE_TEXTS・STYLE_INTERACTIONS・TRAIT_DESCRIPTIONS）に K-19 で置き換える語が無い", () => {
    const texts = [
      ...SOCIAL_STYLE_KEYS.flatMap((k) => Object.values(STYLE_TEXTS[k])),
      ...SOCIAL_STYLE_KEYS.flatMap((viewer) => Object.values(STYLE_INTERACTIONS[viewer])),
      ...TRAIT_KEYS.flatMap((k) => [
        TRAIT_DESCRIPTIONS[k].description,
        TRAIT_DESCRIPTIONS[k].highLow,
      ]),
    ];
    expect(texts).toHaveLength(4 * 13 + 16 + 32);
    for (const word of ["院長", "医院", "クリニック", "歯科", "患者"]) {
      expect(
        texts.filter((t) => t.includes(word)),
        word,
      ).toEqual([]);
    }
  });

  it("適応力の高い場合のネガティブは「個性が弱い、主体性がない」（K-32 ⑩）", () => {
    expect(TRAIT_HIGHLIGHT_TEXTS.adaptability.highNegative).toBe("個性が弱い、主体性がない");
  });

  it("優劣性の説明は K-33 の 2 文", () => {
    expect(TRAIT_DESCRIPTIONS.deliberateness).toEqual({
      key: "deliberateness",
      description: "物事を決める前に、どれだけじっくり考えるかを表します。",
      highLow: "高いと冷静で思慮深く、低いと判断が早い反面、早とちりしやすくなります。",
    });
  });
});
