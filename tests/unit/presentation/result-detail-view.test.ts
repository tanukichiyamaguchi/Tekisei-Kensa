// M7-result-14 buildResultDetailView（11-4 §3.5・§5.1）。受験情報の 1 行・タイプ・タグ・16の特性・特性の詳細・リスク・組織との相性と、
// 育て方（learn）・接し方（style）。見本の DTO は合成の回答の採点結果（scoreAnswers）にコンダクタータイプを当てたもので、氏名などは
// 架空。育て方・接し方の見本は、E2E（M7-result-30・31）のコンダクタータイプの見本と同じ資質とソーシャルスタイルの値（第一候補 柔軟型・
// 第二候補 直感型・エミアブル）を当てたもの。組み立てた値に氏名以外の個人情報と、本人以外のタイプの TYPE_TEXTS、本人以外のスタイルの
// STYLE_TEXTS、本人のスタイル以外の列の STYLE_INTERACTIONS、候補以外の資質の DEVELOPMENT_GUIDES の文が入らないこと（文言マスタの全体を
// ブラウザに送らない。11-4 §2.21）も確かめる。旧の resolveResultTexts の観点（タイプ別の接し方の順と対象者の列、育成方法の見出しは
// 表示名で内部名を出さない）もここで確かめる（11-4 §5.5）
import { describe, expect, it } from "vitest";

import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import {
  DEVELOPMENT_GUIDE_ITEM_KEYS,
  DEVELOPMENT_GUIDES,
  STYLE_INTERACTIONS,
  STYLE_TEXTS,
  TRAIT_DESCRIPTIONS,
  TRAIT_DETAIL_SENTENCES,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
  type DevelopmentGuideItemKey,
  type SocialStyleTexts,
} from "@/lib/masters/texts";
import { splitHowTo, splitStyleBody } from "@/lib/presentation/result-detail-rules";
import {
  RISK_RESULT_LABELS,
  STYLE_QUADRANTS,
  TRAIT_ICONS,
} from "@/lib/presentation/result-detail-texts";
import {
  buildResultDetailView,
  howToCardsOf,
  learnGroupsOf,
} from "@/lib/presentation/result-detail-view";
import { scoreAnswers } from "@/lib/scoring/score";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type AptitudeKey,
  type ScoreResult,
  type SocialStyleKey,
} from "@/lib/scoring/types";
import type { ResultDetailDto } from "@/lib/services/dto/result";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

/** 合成の回答（Q(q) = ((q − 1) mod 5) + 1）の採点結果にコンダクタータイプを当てたもの */
const CONDUCTOR: ScoreResult = { ...scoreAnswers(cyclicAnswers()), aptitudeType: "conductor" };

/**
 * 育て方・接し方の見本: CONDUCTOR に、E2E のコンダクタータイプの見本（M7-result-30・31）と同じ資質とソーシャルスタイルの値を当てたもの。
 * 資質は 柔軟型 45・直感型 37.5・専門追求型 2.5・目標達成型 0 で第一候補 柔軟型・第二候補 直感型、スタイルは エミアブル 8.5・
 * エクスプレッシブ 6・ドライビング 4.75・アナリティカル 0.75 でエミアブル
 */
const LEARN_STYLE: ScoreResult = {
  ...CONDUCTOR,
  aptitudes: {
    sensory_open: 37.5,
    environment_receptive: 45,
    self_actualizing: 0,
    inquiry_logical: 2.5,
  },
  aptitudeFirst: "environment_receptive",
  aptitudeSecond: "sensory_open",
  socialStyles: { driving: 4.75, expressive: 6, analytical: 0.75, amiable: 8.5 },
  socialStyle: "amiable",
};

function dtoOf(
  overrides: {
    readonly occupationCode?: number;
    readonly submittedAt?: string;
    readonly scores?: ScoreResult;
  } = {},
): ResultDetailDto {
  const scores = overrides.scores ?? CONDUCTOR;
  return {
    resultId: "Res01",
    respondent: {
      respondentId: "Rsp01",
      name: "テストテスト 01",
      occupationCode: overrides.occupationCode ?? 10,
      kind: "executive",
      diagnosisExperience: "experienced",
      teamCode: "Q",
      isExcluded: true,
    },
    submittedAt: overrides.submittedAt ?? "2026-04-04T15:30:00Z",
    scoringVersion: scores.scoringVersion,
    scores,
    aiAnalysis: { status: "not_generated", startedAt: null, error: null, latest: null },
  };
}

/** 組み立てた値の文字をすべて取り出す（入れ子の配列・オブジェクトを含む） */
function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(stringsOf);
  return [];
}

describe("M7-result-14 buildResultDetailView（受験情報・タイプ・16の特性・特性の詳細・リスク・相性）", () => {
  const view = buildResultDetailView(dtoOf());

  it("受験情報の 1 行: 受験日は Asia/Tokyo の暦日、職業はコード 10 が「責任者」、タイプは短縮名、信頼係数は丸める前", () => {
    expect(view.resultId).toBe("Res01");
    expect(view.name).toBe("テストテスト 01");
    expect(view.meta).toEqual({
      examDate: "2026/4/5",
      occupationLabel: "責任者",
      typeShort: "コンダクター",
      reliabilityRaw: CONDUCTOR.reliability,
    });
    expect(view.reliability).toBe(78.685); // 丸める前（概要のカードは表示値で判定する）
  });

  it("職業: 旧コード 9 は「その他」、未知のコードは空（受験情報の 1 行に項目を出さない）", () => {
    expect(buildResultDetailView(dtoOf({ occupationCode: 9 })).meta.occupationLabel).toBe("その他");
    expect(buildResultDetailView(dtoOf({ occupationCode: 1 })).meta.occupationLabel).toBe(
      "アイリスト",
    );
    expect(buildResultDetailView(dtoOf({ occupationCode: 99 })).meta.occupationLabel).toBe("");
  });

  it("タイプ: 名前・キャラクター名・絵の道筋・適性（<…> の中）と人物像の文（付録C §1）", () => {
    expect(view.type).toEqual({
      key: "conductor",
      label: "コンダクタータイプ",
      characterName: "アカリ",
      imagePath: "/images/types/conductor.svg",
      aptitude: "人を活躍させる仕事",
      characteristics: TYPE_TEXTS.conductor.characteristics,
      suitableJobs: TYPE_TEXTS.conductor.suitableJobs,
      advice: TYPE_TEXTS.conductor.advice,
    });
  });

  it("タグ 3 つ: 接し方は本人のソーシャルスタイルのカタカナ名、育て方は資質の第一候補、優位感覚は第一候補の短い名前", () => {
    expect([CONDUCTOR.socialStyle, CONDUCTOR.aptitudeFirst]).toEqual([
      "driving",
      "self_actualizing",
    ]);
    expect(view.tags).toEqual({ style: "ドライビング", learn: "目標達成型", sense: "体感覚" });
    const other = buildResultDetailView(
      dtoOf({
        scores: { ...CONDUCTOR, socialStyle: "amiable", aptitudeFirst: "environment_receptive" },
      }),
    );
    expect(other.tags).toEqual({ style: "エミアブル", learn: "柔軟型", sense: "視覚" });
  });

  it("16の特性: 項目順の 16 件が、アイコンの名前・説明（優劣性は K-33 の 2 文）・高い／低い場合の文を持つ", () => {
    expect(view.traits.map((t) => t.key)).toEqual([...TRAIT_KEYS]);
    expect(view.traits.map((t) => t.label)).toEqual([
      "協力性",
      "適応力",
      "優劣性",
      "謙虚さ",
      "反省力",
      "規則遵守力",
      "こだわり",
      "感情の豊かさ",
      "敏感さ",
      "自己肯定感",
      "革新的思考",
      "行動力",
      "前向きさ",
      "リーダーシップ",
      "発想力",
      "コミュニケーション力",
    ]);
    for (const t of view.traits) {
      expect(t, t.key).toEqual({
        key: t.key,
        label: t.label,
        value: CONDUCTOR.traits[t.key],
        icon: TRAIT_ICONS[t.key],
        description: TRAIT_DESCRIPTIONS[t.key].description,
        highLow: TRAIT_DESCRIPTIONS[t.key].highLow,
        highPositive: TRAIT_HIGHLIGHT_TEXTS[t.key].highPositive,
        highNegative: TRAIT_HIGHLIGHT_TEXTS[t.key].highNegative,
        lowPositive: TRAIT_HIGHLIGHT_TEXTS[t.key].lowPositive,
        lowNegative: TRAIT_HIGHLIGHT_TEXTS[t.key].lowNegative,
      });
    }
    const deliberateness = view.traits.find((t) => t.key === "deliberateness")!;
    expect([deliberateness.icon, deliberateness.description, deliberateness.highLow]).toEqual([
      "trend",
      "物事を決める前に、どれだけじっくり考えるかを表します。",
      "高いと冷静で思慮深く、低いと判断が早い反面、早とちりしやすくなります。",
    ]);
    // 合成の回答: いちばん高いのは規則遵守力 18.5、いちばん低いのは謙虚さ 13（同点は項目順で先）
    expect([view.highestKey, view.lowestKey]).toEqual(["rule_compliance", "humility"]);
    const equal = buildResultDetailView(dtoOf({ scores: scoreAnswers(uniformAnswers(3)) }));
    expect([equal.highestKey, equal.lowestKey]).toEqual(["cooperativeness", "cooperativeness"]);
  });

  it("特性の詳細: 5 枚が 対人関係・行動特性・業務対応・環境適応・情緒・精神面 の順で、本人のタイプの文だけを持つ", () => {
    expect(view.details.map((d) => [d.category, d.heading, d.icon])).toEqual([
      ["interpersonal", "対人関係", "users"],
      ["behavior", "行動特性", "zap"],
      ["work", "業務対応", "brief"],
      ["environment", "環境適応", "globe"],
      ["emotion", "情緒・精神面", "heart"],
    ]);
    // コンダクタータイプは 5 カテゴリとも文があり、文のマスタで本人のタイプに当たる文をカテゴリの中の定義順に並べたもの
    expect(view.details.map((d) => d.sentences)).toEqual(
      view.details.map((d) =>
        TRAIT_DETAIL_SENTENCES.filter(
          (s) => s.category === d.category && s.appliesTo.includes("conductor"),
        )
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => s.text),
      ),
    );
    expect(view.details.every((d) => d.sentences.length > 0)).toBe(true);
    expect(view.details[4]!.sentences).toEqual([
      "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
      "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
    ]);
  });

  it("特性の詳細: 16 タイプとも 5 枚を出す（文が 0 件のカテゴリも見出しだけのカードとして含める）", () => {
    for (const aptitudeType of APTITUDE_TYPE_KEYS) {
      const details = buildResultDetailView(
        dtoOf({ scores: { ...CONDUCTOR, aptitudeType } }),
      ).details;
      expect(
        details.map((d) => d.heading),
        aptitudeType,
      ).toEqual(["対人関係", "行動特性", "業務対応", "環境適応", "情緒・精神面"]);
    }
  });

  it("リスク: 表示値の大きい順（同じ値はマスタの順）で、表示名は §2.10 の名前", () => {
    // 合成の回答: 不祥事 27.5・苦情 47.5・メンタル面 30・不注意 57.5・退職時 42.5・コミュニケーション 52.5・モチベーション 42.5
    expect(view.risks).toEqual([
      { key: "careless_mistake", label: "不注意からミスが発生する", display: 58, level: 3 },
      {
        key: "communication_issue",
        label: "コミュニケーションが原因で業務に支障がでる",
        display: 53,
        level: 3,
      },
      { key: "complaint", label: "苦情を強く主張する", display: 48, level: 3 },
      { key: "resignation_trouble", label: "退職時におけるトラブル発生", display: 43, level: 3 },
      {
        key: "low_motivation",
        label: "モチベーションの不足により就業辞退に繋がる",
        display: 43,
        level: 3,
      },
      { key: "mental_distress", label: "メンタル面の不服が起こる", display: 30, level: 2 },
      { key: "misconduct", label: "不祥事が発生する", display: 28, level: 2 },
    ]);
    expect(view.risks.every((r) => r.label === RISK_RESULT_LABELS[r.key])).toBe(true);
  });

  it("組織との相性: 5 軸がマスタの順で、左右の言葉と本人の値（負の値のまま）を持つ", () => {
    expect(view.fit).toEqual([
      {
        key: "adaptive_environment",
        label: "適応する環境",
        left: "個人優先型",
        right: "組織優先型",
        value: -3,
      },
      {
        key: "adaptive_work",
        label: "適応する業務",
        left: "変化の少ない業務",
        right: "変化の多い業務",
        value: 0,
      },
      { key: "thinking_tendency", label: "思考の傾向", left: "主観的", right: "客観的", value: 11 },
      { key: "decision_making", label: "意思決定", left: "依存的", right: "主体的", value: -13 },
      {
        key: "stress_tolerance",
        label: "ストレス耐性",
        left: "ストレスを感じやすい",
        right: "ストレスを感じにくい",
        value: -7,
      },
    ]);
  });

  it("氏名以外の個人情報（受検者 ID・チーム・区分・過去の受講経験・除外）を持たない", () => {
    const json = JSON.stringify(view);
    for (const key of ["respondentId", "teamCode", "diagnosisExperience", "isExcluded"]) {
      expect(json, key).not.toContain(`"${key}"`);
    }
    // 項目の名前 kind は、接し方の〇〇派（本文の小さい行と 4 区分の表。11-4 §3.5）だけ。受検者の区分の値は持たない
    expect(
      [...json.matchAll(/"kind":"([^"]*)"/g)].every((m) => m[1]!.endsWith("派")),
      "kind",
    ).toBe(true);
    expect(json).not.toContain("Rsp01");
    expect(json).not.toContain("executive");
    expect(json).not.toContain("experienced");
    expect(stringsOf(view)).toContain("テストテスト 01");
    expect(Object.keys(view).sort()).toEqual(
      [
        "details",
        "fit",
        "highestKey",
        "learn",
        "lowestKey",
        "meta",
        "name",
        "reliability",
        "resultId",
        "risks",
        "style",
        "tags",
        "traits",
        "type",
      ].sort(),
    );
  });

  it("組み立てた値は凍結され、JSON にできる（Server Component から Client に渡す）", () => {
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.traits)).toBe(true);
    expect(Object.isFrozen(view.traits[0])).toBe(true);
    expect(Object.isFrozen(view.details[0]!.sentences)).toBe(true);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});

/** 値の中のオブジェクトと配列がすべて凍結されていること（Server Component から Client に渡す値を書き換えない） */
function expectDeepFrozen(value: unknown, path: string): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value), path).toBe(true);
  for (const [key, child] of Object.entries(value)) expectDeepFrozen(child, `${path}.${key}`);
}

/** 育て方の候補の「話し方」の文 */
function speakingOf(candidate: {
  readonly groups: ReadonlyArray<{
    readonly items: ReadonlyArray<{ readonly key: string; readonly text: string }>;
  }>;
}): string | undefined {
  return candidate.groups.flatMap((g) => g.items).find((item) => item.key === "speaking")?.text;
}

describe("M7-result-14 buildResultDetailView（育て方・接し方。11-4 §2.13・§2.14）", () => {
  const view = buildResultDetailView(dtoOf({ scores: LEARN_STYLE }));

  it("育て方の第一候補: 柔軟型の表示名・絵の道筋・優位感覚の全文と短い名前・本タイプへのアプローチ", () => {
    expect(view.learn.first).toMatchObject({
      key: "environment_receptive",
      label: "柔軟型",
      imagePath: "/images/aptitudes/environment_receptive.svg",
      sense: "視覚（Visual）",
      senseShort: "視覚",
      approach: DEVELOPMENT_GUIDES.environment_receptive.items.approach,
    });
  });

  it("育て方の 12 項目: 2 つの区切り（教え方・話し方 4 項目・人となり 8 項目）の順・名前・アイコンと、第一候補のマスタの文", () => {
    expect(
      view.learn.first.groups.map((g) => [g.title, g.items.map((i) => [i.key, i.label, i.icon])]),
    ).toEqual([
      [
        "教え方・話し方",
        [
          ["learning_style", "学習スタイル", "book"],
          ["listening", "聞き方", "ear"],
          ["speaking", "話し方", "chat"],
          ["compatibility", "他タイプとの相性", "users"],
        ],
      ],
      [
        "人となり",
        [
          ["characteristics", "特徴", "spark"],
          ["thinking", "思考", "bulb"],
          ["personality", "性格", "heart"],
          ["emotion", "感情", "smile"],
          ["behavior", "行動", "zap"],
          ["interpersonal", "対人関係", "users"],
          ["top_priority", "最優先対象", "target"],
          ["impression", "周りからの印象", "smile"],
        ],
      ],
    ]);
    const items = view.learn.first.groups.flatMap((g) => g.items);
    for (const item of items) {
      expect(item.text, item.key).toBe(DEVELOPMENT_GUIDES.environment_receptive.items[item.key]);
    }
    // 優位感覚（左のカードの札）と本タイプへのアプローチ（囲み）は 12 項目に入れない
    expect(items.map((item) => item.key)).not.toContain("dominant_sense");
    expect(items.map((item) => item.key)).not.toContain("approach");
  });

  it("育て方の第二候補: 直感型。「話し方」は直感型のマスタの文（K-32 ⑨。参照元の入れ替わった文ではない）", () => {
    const second = view.learn.second;
    expect(second).toMatchObject({
      key: "sensory_open",
      label: "直感型",
      imagePath: "/images/aptitudes/sensory_open.svg",
      sense: "言語感覚（Auditory Digital）",
      senseShort: "言語感覚",
      approach: DEVELOPMENT_GUIDES.sensory_open.items.approach,
    });
    expect(speakingOf(second)).toBe(DEVELOPMENT_GUIDES.sensory_open.items.speaking);
    expect(speakingOf(second)).toBe(
      "自分の存在を強くアピールし、会話の中心にいることを好む。感情を素直に表現し、論理よりも直感に基づいた話し方をする。",
    );
    // 参照元が第二候補の直感型に出す文（目標達成型の話し方）は入らない（11-4 §2.13.4）
    expect(DEVELOPMENT_GUIDES.self_actualizing.items.speaking).toBe(
      "自分の意見や考えを率直に述べるスタイル。簡潔かつ明確な表現で、相手に強い印象を与える。",
    );
    expect(stringsOf(view)).not.toContain(DEVELOPMENT_GUIDES.self_actualizing.items.speaking);
    // 第二候補も同じ 2 つの区切りと 12 項目。改行と行頭の空白を含む文もマスタのまま
    expect(second.groups.map((g) => [g.title, g.items.length])).toEqual([
      ["教え方・話し方", 4],
      ["人となり", 8],
    ]);
    const compatibility = second.groups[0]!.items[3]!;
    expect(compatibility.text).toBe(DEVELOPMENT_GUIDES.sensory_open.items.compatibility);
    expect(compatibility.text).toContain("\n 「柔軟型」");
  });

  it("第一候補が目標達成型・第二候補が直感型（参照元で「話し方」が入れ替わる組）でも、それぞれの資質のマスタの文", () => {
    const swapped = buildResultDetailView(
      dtoOf({
        scores: {
          ...LEARN_STYLE,
          aptitudeFirst: "self_actualizing",
          aptitudeSecond: "sensory_open",
        },
      }),
    );
    expect(speakingOf(swapped.learn.first)).toBe(
      DEVELOPMENT_GUIDES.self_actualizing.items.speaking,
    );
    expect(speakingOf(swapped.learn.second)).toBe(DEVELOPMENT_GUIDES.sensory_open.items.speaking);
  });

  it("learnGroupsOf: 文の無い項目（空・空白だけ）を含めず、項目が 1 つも無い区切りは含めない。文はマスタのまま（前後の空白も除かない）", () => {
    const base = DEVELOPMENT_GUIDES.environment_receptive.items;
    const items: Readonly<Record<DevelopmentGuideItemKey, string>> = {
      ...base,
      learning_style: " 学び方の文\n 2 行目",
      listening: "",
      speaking: " \n\u3000",
      characteristics: "",
      thinking: "",
      personality: "",
      emotion: "",
      behavior: "",
      interpersonal: "",
      top_priority: "",
      impression: "",
    };
    expect(learnGroupsOf(items)).toEqual([
      {
        title: "教え方・話し方",
        items: [
          {
            key: "learning_style",
            label: "学習スタイル",
            icon: "book",
            text: " 学び方の文\n 2 行目",
          },
          {
            key: "compatibility",
            label: "他タイプとの相性",
            icon: "users",
            text: base.compatibility,
          },
        ],
      },
    ]);
    const allEmpty = Object.fromEntries(
      DEVELOPMENT_GUIDE_ITEM_KEYS.map((key) => [key, ""]),
    ) as Record<DevelopmentGuideItemKey, string>;
    expect(learnGroupsOf(allEmpty)).toEqual([]);
    expectDeepFrozen(learnGroupsOf(items), "groups");
  });

  it("資質 4 つは小さいレーダーの軸の順（直感型・柔軟型・目標達成型・専門追求型）で、値は丸めない", () => {
    expect(view.learn.aptitudes).toEqual([
      { key: "sensory_open", label: "直感型", value: 37.5 },
      { key: "environment_receptive", label: "柔軟型", value: 45 },
      { key: "self_actualizing", label: "目標達成型", value: 0 },
      { key: "inquiry_logical", label: "専門追求型", value: 2.5 },
    ]);
    // 合成の回答の資質（直感型 13.75 など）も丸めない（小数第 1 位の表示にするのは割合を求めるとき。aptitudeShares）
    expect(buildResultDetailView(dtoOf()).learn.aptitudes.map((a) => a.value)).toEqual([
      13.75, 7.5, 22.5, 12.5,
    ]);
  });

  it("育成方法の名前は資質の表示名で、内部名（感性開放型など）を出さない（旧の resolveResultTexts の観点）", () => {
    const json = JSON.stringify(view);
    for (const d of APTITUDE_DEFINITIONS) {
      expect(json, d.key).not.toContain(d.internalName);
    }
    expect([view.learn.first.label, view.learn.second.label]).toEqual(["柔軟型", "直感型"]);
  });

  it("接し方: スタイル名・カタカナ名・偉人名・絵の道筋と、本文の振り分け（splitStyleBody と同じ）", () => {
    expect(view.style).toMatchObject({
      key: "amiable",
      typeName: "エミアブルタイプ",
      katakana: "エミアブル",
      greatPersonName: "マザー・テレサ",
      imagePath: "/images/styles/amiable.svg",
    });
    expect(view.style.body).toEqual(splitStyleBody(STYLE_TEXTS.amiable.body));
    expect(view.style.body).toMatchObject({
      assertion: "自己主張：弱／感情表出：強",
      kind: "協調派",
      catchCopy: "周りの力になりたい。頼られると嬉しい",
    });
  });

  it("4 区分の表: アナリティカル・ドライビング・エミアブル・エクスプレッシブの順（右の列は右揃え）で、値は丸めない", () => {
    expect(view.style.quad).toEqual([
      { key: "analytical", name: "アナリティカル", kind: "思考派", align: "left", value: 0.75 },
      { key: "driving", name: "ドライビング", kind: "行動派", align: "right", value: 4.75 },
      { key: "amiable", name: "エミアブル", kind: "協調派", align: "left", value: 8.5 },
      { key: "expressive", name: "エクスプレッシブ", kind: "感覚派", align: "right", value: 6 },
    ]);
    expect(
      view.style.quad.map((q) => ({ key: q.key, name: q.name, kind: q.kind, align: q.align })),
    ).toEqual(STYLE_QUADRANTS);
  });

  it("接し方の小さいレーダー: ドライビング・エクスプレッシブ・エミアブル・アナリティカルの順（軸の順）で、値は丸めない", () => {
    expect(view.style.radar).toEqual([
      { key: "driving", label: "ドライビング", value: 4.75 },
      { key: "expressive", label: "エクスプレッシブ", value: 6 },
      { key: "amiable", label: "エミアブル", value: 8.5 },
      { key: "analytical", label: "アナリティカル", value: 0.75 },
    ]);
  });

  it("負の値（−1.5）は 4 区分の表とレーダーの値に負のまま持つ（表に小数第 1 位で出すのと、レーダーで 0 の位置に描くのは部品）", () => {
    const negative = buildResultDetailView(
      dtoOf({
        scores: {
          ...LEARN_STYLE,
          socialStyles: { ...LEARN_STYLE.socialStyles, analytical: -1.5 },
        },
      }),
    );
    expect(negative.style.quad[0]).toEqual({
      key: "analytical",
      name: "アナリティカル",
      kind: "思考派",
      align: "left",
      value: -1.5,
    });
    expect(negative.style.radar[3]).toEqual({
      key: "analytical",
      label: "アナリティカル",
      value: -1.5,
    });
  });

  it("関わり方のコツ: 見分け方・褒め方・効果的な対応・声かけ例の 4 枚で、中身は splitHowTo（声かけ例のカードだけ吹き出し）", () => {
    expect(view.style.howTo.map((card) => card.title)).toEqual([
      "見分け方",
      "褒め方",
      "効果的な対応",
      "声かけ例",
    ]);
    expect(view.style.howTo.map((card) => card.parts)).toEqual([
      splitHowTo(STYLE_TEXTS.amiable.identify, false),
      splitHowTo(STYLE_TEXTS.amiable.praise, false),
      splitHowTo(STYLE_TEXTS.amiable.response, false),
      splitHowTo(STYLE_TEXTS.amiable.phrases, true),
    ]);
    // エミアブルの褒め方は帯（×）1 行・帯（○）1 行、声かけ例は吹き出し 2
    const [, praise, , phrases] = view.style.howTo;
    expect([praise!.parts.ng.length, praise!.parts.ok.length, phrases!.parts.says.length]).toEqual([
      1, 1, 2,
    ]);
  });

  it("howToCardsOf: 文の無いカード（空・空白だけ）は含めない", () => {
    const texts: SocialStyleTexts = { ...STYLE_TEXTS.amiable, praise: "", phrases: " \n " };
    expect(howToCardsOf(texts).map((card) => card.title)).toEqual(["見分け方", "効果的な対応"]);
    expectDeepFrozen(howToCardsOf(texts), "howTo");
  });

  it("タイプ別の接し方のタブ: 見ている人のスタイルを ドライビング・エクスプレッシブ・エミアブル・アナリティカルの順に、文は本人のスタイルの列（旧の resolveResultTexts の観点）", () => {
    const viewers: readonly SocialStyleKey[] = ["driving", "expressive", "amiable", "analytical"];
    expect(view.style.interactions).toEqual(
      viewers.map((viewer, i) => ({
        viewer,
        label: ["ドライビング", "エクスプレッシブ", "エミアブル", "アナリティカル"][i],
        text: STYLE_INTERACTIONS[viewer].amiable,
      })),
    );
    // 既定のタブ（ドライビング）の文は、ドライビングの人から見たエミアブルへの接し方
    expect(view.style.interactions[0]!.text.startsWith("穏やかに話したいエミアブル")).toBe(true);
  });

  it("4 資質 × 4 スタイルのどの組でも組み立てられ（第一候補と第二候補は別の資質）、すべて凍結され、JSON で往復できる", () => {
    let count = 0;
    for (const first of APTITUDE_KEYS) {
      for (const second of APTITUDE_KEYS.filter((key: AptitudeKey) => key !== first)) {
        for (const socialStyle of SOCIAL_STYLE_KEYS) {
          const where = `${first}/${second}/${socialStyle}`;
          const v = buildResultDetailView(
            dtoOf({
              scores: { ...LEARN_STYLE, aptitudeFirst: first, aptitudeSecond: second, socialStyle },
            }),
          );
          expect([v.learn.first.key, v.learn.second.key, v.style.key], where).toEqual([
            first,
            second,
            socialStyle,
          ]);
          expect(
            [v.learn.first, v.learn.second].map((c) => c.groups.map((g) => g.items.length)),
            where,
          ).toEqual([
            [4, 8],
            [4, 8],
          ]);
          expect(v.style.typeName, where).toBe(STYLE_TEXTS[socialStyle].typeName);
          expect(
            v.style.howTo.map((card) => card.title),
            where,
          ).toEqual(["見分け方", "褒め方", "効果的な対応", "声かけ例"]);
          expect(
            v.style.interactions.map((i) => i.text),
            where,
          ).toEqual(v.style.interactions.map((i) => STYLE_INTERACTIONS[i.viewer][socialStyle]));
          expectDeepFrozen(v, where);
          expect(JSON.parse(JSON.stringify(v)), where).toEqual(v);
          count += 1;
        }
      }
    }
    expect(count).toBe(4 * 3 * 4);
  });
});

describe("M7-result-14 文言マスタの全体をブラウザに送らない（11-4 §2.21）", () => {
  // 見本: タイプ コンダクター、資質の第一候補 柔軟型・第二候補 直感型、スタイル エミアブル
  const view = buildResultDetailView(dtoOf({ scores: LEARN_STYLE }));
  const strings = stringsOf(view);
  const contains = (text: string) => strings.some((s) => s.includes(text));
  const candidates: readonly AptitudeKey[] = ["environment_receptive", "sensory_open"];

  /** 文を行に分ける（前後の空白を除き、空の行は捨てる） */
  const linesOf = (text: string): string[] =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");

  /**
   * ソーシャルスタイル別文言の 1 スタイル分を、画面の値が持つ形の断片にする（本文は splitStyleBody、関わり方のコツは splitHowTo の
   * 中身。印と括弧を除いた形で持つので、元の行のままでは比べられない）。スタイル名・偉人名・見出しはそのまま
   */
  const stylePieces = (texts: SocialStyleTexts): string[] => {
    const body = splitStyleBody(texts.body);
    const howTo = (["identify", "praise", "response", "phrases"] as const).map((field) =>
      splitHowTo(texts[field], field === "phrases"),
    );
    return [
      texts.typeName,
      texts.greatPersonName,
      texts.interactionHeading,
      texts.identifyHeading,
      texts.praiseHeading,
      texts.responseHeading,
      texts.phrasesHeading,
      body.assertion,
      body.kind,
      body.catchCopy,
      ...body.paragraphs,
      ...howTo.flatMap((parts) => [
        ...parts.ng,
        ...parts.ok.map((ok) => ok.text),
        ...parts.bullets,
        ...parts.says,
        ...parts.paragraphs,
      ]),
    ].filter((piece) => piece !== "");
  };

  /**
   * 本人の分として画面の値に入ってよい文（本人のタイプ・スタイルの文、本人のスタイルの列の接し方 4 つ、2 つの候補の育成方法）と、
   * 画面の定数（4 区分の表の名前と〇〇派）。本人以外の文の断片のうち、これに含まれる短い断片（共通する語句）は比べない
   */
  const allowed = [
    ...Object.values(TYPE_TEXTS.conductor),
    ...Object.values(STYLE_TEXTS.amiable),
    ...SOCIAL_STYLE_KEYS.map((viewer) => STYLE_INTERACTIONS[viewer].amiable),
    ...candidates.flatMap((key) => Object.values(DEVELOPMENT_GUIDES[key].items)),
    ...STYLE_QUADRANTS.flatMap((q) => [q.name, q.kind]),
  ];
  const isCommon = (piece: string) => allowed.some((text) => text.includes(piece));

  /** 本人以外の文の断片のうち、画面の値に入っているもの（共通する短い断片を除く）。比べた数と除いた断片も返す */
  function leaked(pieces: readonly string[]) {
    const common = pieces.filter(isCommon);
    const checked = pieces.filter((piece) => !isCommon(piece));
    return { checked: checked.length, common, found: checked.filter(contains) };
  }

  it("確かめ方の確認: 本人のスタイルの文・本人の列の接し方・2 つの候補の育成方法の文は入っている", () => {
    const own = stylePieces(STYLE_TEXTS.amiable).filter(
      (piece) =>
        ![
          STYLE_TEXTS.amiable.interactionHeading,
          STYLE_TEXTS.amiable.identifyHeading,
          STYLE_TEXTS.amiable.praiseHeading,
          STYLE_TEXTS.amiable.responseHeading,
          STYLE_TEXTS.amiable.phrasesHeading,
        ].includes(piece),
    );
    expect(own.length).toBeGreaterThanOrEqual(15);
    expect(own.filter((piece) => !contains(piece))).toEqual([]);
    for (const viewer of SOCIAL_STYLE_KEYS) {
      expect(contains(STYLE_INTERACTIONS[viewer].amiable), viewer).toBe(true);
    }
    for (const key of candidates) {
      for (const [item, text] of Object.entries(DEVELOPMENT_GUIDES[key].items)) {
        expect(contains(text), `${key}.${item}`).toBe(true);
      }
    }
  });

  it("本人のスタイルの見出しの文（本タイプの対処法の見出し、関わり方のコツのマスタの見出し）は入れない（画面に出さない。題は howToTitle）", () => {
    const t = STYLE_TEXTS.amiable;
    for (const heading of [
      t.interactionHeading,
      t.identifyHeading,
      t.praiseHeading,
      t.responseHeading,
      t.phrasesHeading,
    ]) {
      expect(contains(heading), heading).toBe(false);
    }
  });

  it("本人以外の 3 スタイルの STYLE_TEXTS の文が入っていない", () => {
    for (const style of SOCIAL_STYLE_KEYS.filter((key) => key !== "amiable")) {
      const result = leaked(stylePieces(STYLE_TEXTS[style]));
      expect(result.found, style).toEqual([]);
      expect(result.checked, style).toBeGreaterThan(20);
      // 除いたのは画面の定数や本人の文と共通する短い語句だけ
      expect(
        result.common.every((piece) => piece.length <= 10),
        style,
      ).toBe(true);
    }
  });

  it("本人のスタイル以外の列の STYLE_INTERACTIONS の文（12 件）が入っていない", () => {
    const texts = SOCIAL_STYLE_KEYS.flatMap((viewer) =>
      SOCIAL_STYLE_KEYS.filter((target) => target !== "amiable").map(
        (target) => STYLE_INTERACTIONS[viewer][target],
      ),
    );
    expect(texts).toHaveLength(12);
    const result = leaked(texts.flatMap(linesOf));
    expect(result.found).toEqual([]);
    expect(result.checked).toBeGreaterThanOrEqual(12);
    expect(result.common.every((piece) => piece.length <= 10)).toBe(true);
  });

  it("候補以外の 2 資質の DEVELOPMENT_GUIDES の文が入っていない", () => {
    for (const key of APTITUDE_KEYS.filter((k) => !candidates.includes(k))) {
      const result = leaked(Object.values(DEVELOPMENT_GUIDES[key].items).flatMap(linesOf));
      expect(result.found, key).toEqual([]);
      expect(result.checked, key).toBeGreaterThanOrEqual(14);
      expect(
        result.common.every((piece) => piece.length <= 10),
        key,
      ).toBe(true);
    }
  });

  it("本人以外のタイプの TYPE_TEXTS の文が入っていない", () => {
    expect(contains(TYPE_TEXTS.conductor.characteristics)).toBe(true);
    for (const key of APTITUDE_TYPE_KEYS.filter((k) => k !== "conductor")) {
      const texts = TYPE_TEXTS[key];
      for (const text of [
        texts.aptitudeHeading,
        texts.characteristics,
        texts.suitableJobs,
        texts.advice,
      ]) {
        expect(contains(text), `${key}: ${text.slice(0, 20)}`).toBe(false);
      }
    }
  });
});
