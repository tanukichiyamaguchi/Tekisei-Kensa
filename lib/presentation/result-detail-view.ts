// 結果詳細の表示用データ（11-4 §3.5 の result-detail-view.ts。PR-7.8a の分）。Server Component（結果詳細のページと印刷用ページ）が
// ResultDetailDto から組み立てて Client の部品に渡す純関数。比較に依存しない値だけを持つ（比較の値と組織内のポジションは、部品が
// ComparisonDto から comparison-view.ts を通して描く）。文言マスタの全体をブラウザに送らないよう、本人のタイプ・特性・資質の文だけを
// 入れ、ほかのタイプの TYPE_TEXTS とソーシャルスタイルの文（STYLE_TEXTS）は入れない。個人情報は氏名だけ（受検者 ID・チーム・区分・
// 過去の受講経験を入れない。11-4 §2.21）。育て方・接し方（learn・style）は PR-7.8b が足す
import type { RiskLevel } from "./colors";
import { formatYmd } from "./format-datetime";
import { aptitudeOfHeading, detailHeading, rankRisks, senseShortName } from "./result-detail-rules";
import {
  DETAIL_CATEGORY_ICONS,
  RISK_RESULT_LABELS,
  TRAIT_ICONS,
  type ResultIconName,
} from "./result-detail-texts";
import { pickHighestTrait, pickLowestTrait } from "./trait-highlights";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import { getOccupationLabel } from "@/lib/masters/occupations";
import {
  DEVELOPMENT_GUIDES,
  TRAIT_DESCRIPTIONS,
  TRAIT_DETAIL_CATEGORIES,
  TRAIT_DETAIL_CATEGORY_KEYS,
  TRAIT_DETAIL_SENTENCES,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
  type TraitDetailCategoryKey,
} from "@/lib/masters/texts";
import {
  TRAIT_KEYS,
  type AptitudeTypeKey,
  type CompatibilityKey,
  type RiskKey,
  type TraitKey,
} from "@/lib/scoring/types";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export interface ResultDetailView {
  readonly resultId: string;
  readonly name: string; // 見出しと目次の氏名の欄だけに出す
  /** 受験情報の 1 行（§2.4）。空の値の項目は出さない */
  readonly meta: {
    readonly examDate: string; // 受験日（Asia/Tokyo の yyyy/m/d）
    readonly occupationLabel: string; // 職業の表示名（未知のコードは ""）
    readonly typeShort: string; // タイプの短縮名（コンダクター）
    readonly reliabilityRaw: number; // 丸める前の信頼係数（判定も丸める前の値。§2.4）
  };
  /** タイプ（概要のタイプのカード §2.7.1 と人物像 §2.12） */
  readonly type: {
    readonly key: AptitudeTypeKey;
    readonly label: string; // コンダクタータイプ
    readonly characterName: string; // アカリ
    readonly imagePath: string; // /images/types/{key}.svg（K-05）
    readonly aptitude: string; // 適性（aptitudeHeading の <…> の中）
    readonly characteristics: string; // 特徴
    readonly suitableJobs: string; // 適性職種
    readonly advice: string; // 本人へのアドバイス（空なら囲みを出さない）
  };
  /** 概要のタイプのカードのタグ 3 つの値（§2.7.1） */
  readonly tags: {
    readonly style: string; // 接し方: ソーシャルスタイルのカタカナ名
    readonly learn: string; // 育て方: 資質の第一候補の表示名
    readonly sense: string; // 優位感覚: 第一候補の優位感覚の短い名前
  };
  /** 項目順の 16 件（§2.8・§2.15） */
  readonly traits: ReadonlyArray<{
    readonly key: TraitKey;
    readonly label: string;
    readonly value: number; // 丸めない
    readonly icon: ResultIconName;
    readonly description: string; // 項目の説明の 1 行目（優劣性は K-33）
    readonly highLow: string; // 2 行目
    readonly highPositive: string;
    readonly highNegative: string;
    readonly lowPositive: string;
    readonly lowNegative: string;
  }>;
  readonly highestKey: TraitKey; // いちばん高い特性（同点は項目順で先）
  readonly lowestKey: TraitKey; // いちばん低い特性
  readonly reliability: number; // 丸める前（概要のカードは表示値で判定する。§2.7.4）
  /** リスク 7 項目（§2.10 の並び。label は RISK_RESULT_LABELS） */
  readonly risks: ReadonlyArray<{
    readonly key: RiskKey;
    readonly label: string;
    readonly display: number;
    readonly level: RiskLevel;
  }>;
  /** 組織との相性の 5 軸（マスタの順。§2.11）。value は本人の値（負の値を含む。印の位置は clampForSlider） */
  readonly fit: ReadonlyArray<{
    readonly key: CompatibilityKey;
    readonly label: string;
    readonly left: string;
    readonly right: string;
    readonly value: number;
  }>;
  /** 特性の詳細の 5 枚（§2.9 の順。本人のタイプに当たる文が 0 件のカテゴリも含める） */
  readonly details: ReadonlyArray<{
    readonly category: TraitDetailCategoryKey;
    readonly heading: string; // 情緒・精神面 など
    readonly icon: ResultIconName;
    readonly sentences: readonly string[];
  }>;
}

const APTITUDE_TYPES = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.key, t]));
const APTITUDE_LABELS = new Map(APTITUDE_DEFINITIONS.map((a) => [a.key, a.label]));
const STYLE_KATAKANA = new Map(SOCIAL_STYLE_DEFINITIONS.map((s) => [s.key, s.labelKatakana]));
const TRAIT_LABELS = new Map(TRAIT_DEFINITIONS.map((t) => [t.key, t.label]));
const CATEGORY_LABELS = new Map(TRAIT_DETAIL_CATEGORIES.map((c) => [c.key, c.label]));

/** 職業の表示名（§2.4。コード 10 は「責任者」、旧コード 9 は「その他」）。未知のコードは "" にして、受験情報の項目を出さない */
function occupationLabelOf(code: number): string {
  try {
    return getOccupationLabel(code);
  } catch (error) {
    if (error instanceof RangeError) return "";
    throw error;
  }
}

/** 特性の詳細（§2.9）: カテゴリごとに、本人のタイプが「表示するタイプ」に入る文をカテゴリの中の定義順に並べる */
function detailsOf(aptitudeType: AptitudeTypeKey): ResultDetailView["details"] {
  return Object.freeze(
    TRAIT_DETAIL_CATEGORY_KEYS.map((category) =>
      Object.freeze({
        category,
        heading: detailHeading(CATEGORY_LABELS.get(category) ?? ""),
        icon: DETAIL_CATEGORY_ICONS[category],
        sentences: Object.freeze(
          TRAIT_DETAIL_SENTENCES.filter(
            (s) => s.category === category && s.appliesTo.includes(aptitudeType),
          )
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => s.text),
        ),
      }),
    ),
  );
}

/** ResultDetailDto から、比較に依存しない画面の値をすべて組み立てる（11-4 §3.5） */
export function buildResultDetailView(detail: ResultDetailDto): ResultDetailView {
  const { scores } = detail;
  const typeDefinition = APTITUDE_TYPES.get(scores.aptitudeType);
  const typeTexts = TYPE_TEXTS[scores.aptitudeType];
  return Object.freeze({
    resultId: detail.resultId,
    name: detail.respondent.name,
    meta: Object.freeze({
      examDate: formatYmd(detail.submittedAt),
      occupationLabel: occupationLabelOf(detail.respondent.occupationCode),
      typeShort: typeDefinition?.shortLabel ?? "",
      reliabilityRaw: scores.reliability,
    }),
    type: Object.freeze({
      key: scores.aptitudeType,
      label: typeDefinition?.label ?? "",
      characterName: typeDefinition?.characterName ?? "",
      imagePath: `/images/types/${scores.aptitudeType}.svg`,
      aptitude: aptitudeOfHeading(typeTexts.aptitudeHeading),
      characteristics: typeTexts.characteristics,
      suitableJobs: typeTexts.suitableJobs,
      advice: typeTexts.advice,
    }),
    tags: Object.freeze({
      style: STYLE_KATAKANA.get(scores.socialStyle) ?? "",
      learn: APTITUDE_LABELS.get(scores.aptitudeFirst) ?? "",
      sense: senseShortName(DEVELOPMENT_GUIDES[scores.aptitudeFirst].items.dominant_sense),
    }),
    traits: Object.freeze(
      TRAIT_KEYS.map((key) => {
        const description = TRAIT_DESCRIPTIONS[key];
        const highlight = TRAIT_HIGHLIGHT_TEXTS[key];
        return Object.freeze({
          key,
          label: TRAIT_LABELS.get(key) ?? key,
          value: scores.traits[key],
          icon: TRAIT_ICONS[key],
          description: description.description,
          highLow: description.highLow,
          highPositive: highlight.highPositive,
          highNegative: highlight.highNegative,
          lowPositive: highlight.lowPositive,
          lowNegative: highlight.lowNegative,
        });
      }),
    ),
    highestKey: pickHighestTrait(scores.traits).key,
    lowestKey: pickLowestTrait(scores.traits).key,
    reliability: scores.reliability,
    risks: Object.freeze(
      rankRisks(scores.risks).map((risk) =>
        Object.freeze({
          key: risk.key,
          label: RISK_RESULT_LABELS[risk.key],
          display: risk.display,
          level: risk.level,
        }),
      ),
    ),
    fit: Object.freeze(
      [...COMPATIBILITY_DEFINITIONS]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((d) =>
          Object.freeze({
            key: d.key,
            label: d.label,
            left: d.lowLabel,
            right: d.highLabel,
            value: scores.compatibility[d.key],
          }),
        ),
    ),
    details: detailsOf(scores.aptitudeType),
  });
}
