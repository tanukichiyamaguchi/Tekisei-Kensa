// M7-result-14 buildResultDetailView（11-4 §3.5・§5.1。PR-7.8a の分: 受験情報の 1 行・タイプ・タグ・16の特性・特性の詳細・リスク・
// 組織との相性）。見本の DTO は合成の回答の採点結果（scoreAnswers）にコンダクタータイプを当てたもので、氏名などは架空。
// 組み立てた値に氏名以外の個人情報と、本人以外のタイプの TYPE_TEXTS・ソーシャルスタイルの STYLE_TEXTS の文が入らないこと
// （文言マスタの全体をブラウザに送らない。11-4 §2.21）も確かめる。育て方・接し方（learn・style）は PR-7.8b
import { describe, expect, it } from "vitest";

import {
  STYLE_TEXTS,
  TRAIT_DESCRIPTIONS,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
} from "@/lib/masters/texts";
import { RISK_RESULT_LABELS, TRAIT_ICONS } from "@/lib/presentation/result-detail-texts";
import { buildResultDetailView } from "@/lib/presentation/result-detail-view";
import { resolveTraitDetails } from "@/lib/presentation/result-texts";
import { scoreAnswers } from "@/lib/scoring/score";
import {
  APTITUDE_TYPE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type ScoreResult,
} from "@/lib/scoring/types";
import type { ResultDetailDto } from "@/lib/services/dto/result";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

/** 合成の回答（Q(q) = ((q − 1) mod 5) + 1）の採点結果にコンダクタータイプを当てたもの */
const CONDUCTOR: ScoreResult = { ...scoreAnswers(cyclicAnswers()), aptitudeType: "conductor" };

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

describe("M7-result-14 buildResultDetailView（PR-7.8a の分）", () => {
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
    // コンダクタータイプは 5 カテゴリとも文があり、今の resolveTraitDetails と同じ文・同じ順
    expect(view.details.map((d) => d.sentences)).toEqual(
      resolveTraitDetails("conductor").map((g) => g.sentences),
    );
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
    for (const key of ["respondentId", "teamCode", "kind", "diagnosisExperience", "isExcluded"]) {
      expect(json, key).not.toContain(`"${key}"`);
    }
    expect(json).not.toContain("Rsp01");
    expect(json).not.toContain("executive");
    expect(json).not.toContain("experienced");
    expect(stringsOf(view)).toContain("テストテスト 01");
    expect(Object.keys(view).sort()).toEqual(
      [
        "details",
        "fit",
        "highestKey",
        "lowestKey",
        "meta",
        "name",
        "reliability",
        "resultId",
        "risks",
        "tags",
        "traits",
        "type",
      ].sort(),
    );
  });

  it("本人以外のタイプの TYPE_TEXTS の文と、STYLE_TEXTS の文が入っていない（文言マスタの全体をブラウザに送らない）", () => {
    const strings = stringsOf(view);
    const contains = (text: string) => strings.some((s) => s.includes(text));
    // 確かめ方の確認: 本人のタイプの文は入っている
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
    for (const style of SOCIAL_STYLE_KEYS) {
      for (const [field, text] of Object.entries(STYLE_TEXTS[style])) {
        if (field === "key") continue;
        expect(contains(text), `${style}.${field}`).toBe(false);
      }
    }
  });

  it("組み立てた値は凍結され、JSON にできる（Server Component から Client に渡す）", () => {
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.traits)).toBe(true);
    expect(Object.isFrozen(view.traits[0])).toBe(true);
    expect(Object.isFrozen(view.details[0]!.sentences)).toBe(true);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
