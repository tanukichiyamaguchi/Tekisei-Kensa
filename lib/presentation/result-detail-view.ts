// 結果詳細の表示用データ（11-4 §3.5 の result-detail-view.ts）。Server Component（結果詳細のページと印刷用ページ）が
// ResultDetailDto から組み立てて Client の部品に渡す純関数。比較に依存しない値だけを持つ（比較の値と組織内のポジションは、部品が
// ComparisonDto から comparison-view.ts を通して描く）。文言マスタの全体をブラウザに送らないよう、本人のタイプ・特性の文と、
// 資質の第一候補・第二候補の育成方法の文、本人のソーシャルスタイルの文（STYLE_TEXTS）と、本人のスタイルの列のタイプ別の接し方 4 つ
// （STYLE_INTERACTIONS の [見ている人][本人]。接し方のタブで切り替える分）だけを入れ、ほかのタイプ・資質・スタイルの文は入れない。
// 個人情報は氏名だけ（受検者 ID・チーム・区分・過去の受講経験を入れない。11-4 §2.21）。Client の部品はこのファイルから型だけを
// import する（マスタをブラウザのバンドルに入れない）
import { APTITUDE_RADAR_AXES, SOCIAL_STYLE_RADAR_AXES } from "./chart-series";
import type { RiskLevel } from "./colors";
import { formatYmd } from "./format-datetime";
import {
  aptitudeOfHeading,
  detailHeading,
  howToTitle,
  rankRisks,
  senseShortName,
  splitHowTo,
  splitStyleBody,
  type HowToParts,
  type StyleBodyParts,
} from "./result-detail-rules";
import {
  DETAIL_CATEGORY_ICONS,
  LEARN_ITEM_GROUPS,
  RISK_RESULT_LABELS,
  STYLE_QUADRANTS,
  TRAIT_ICONS,
  type LearnItemGroup,
  type ResultIconName,
} from "./result-detail-texts";
import { resolveTraitDetails } from "./result-texts";
import { pickHighestTrait, pickLowestTrait } from "./trait-highlights";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import { getOccupationLabel } from "@/lib/masters/occupations";
import {
  DEVELOPMENT_GUIDES,
  STYLE_INTERACTIONS,
  STYLE_TEXTS,
  TRAIT_DESCRIPTIONS,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
  type DevelopmentGuideItemKey,
  type SocialStyleTexts,
  type TraitDetailCategoryKey,
} from "@/lib/masters/texts";
import {
  TRAIT_KEYS,
  type AptitudeKey,
  type AptitudeTypeKey,
  type CompatibilityKey,
  type RiskKey,
  type ScoreResult,
  type SocialStyleKey,
  type TraitKey,
} from "@/lib/scoring/types";
import type { ResultDetailDto } from "@/lib/services/dto/result";

/** 育て方の候補 1 つ（§2.13。資質の第一候補と第二候補。第二候補も同じ育成方法のマスタの文。K-32 ⑨） */
export interface LearnCandidateView {
  readonly key: AptitudeKey;
  readonly label: string; // 資質の表示名（柔軟型など。内部名は出さない）
  readonly imagePath: string; // /images/aptitudes/{key}.svg（K-05）
  readonly sense: string; // 優位感覚の全文（視覚（Visual））
  readonly senseShort: string; // 優位感覚の短い名前（視覚）
  readonly approach: string; // 本タイプへのアプローチ（「このタイプへの関わり方」の囲み）
  /** 12 項目（§2.13.3 の区切りと順）。文の無い項目と、項目が 1 つも無い区切りは含めない */
  readonly groups: ReadonlyArray<{
    readonly title: LearnItemGroup["title"];
    readonly items: ReadonlyArray<{
      readonly key: DevelopmentGuideItemKey;
      readonly label: string;
      readonly icon: ResultIconName;
      readonly text: string; // マスタの文のまま（改行を含む。行頭の空白は CSS で出さない）
    }>;
  }>;
}

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
  /** 育て方（§2.13） */
  readonly learn: {
    readonly first: LearnCandidateView; // 資質の第一候補（scores.aptitudeFirst）
    readonly second: LearnCandidateView; // 資質の第二候補（scores.aptitudeSecond。第二候補を出したときだけ描く）
    /** 小さいレーダーと資質の割合の値（APTITUDE_RADAR_AXES の順 = 軸の順。値は丸めない。割合の行の並べ替えは部品） */
    readonly aptitudes: ReadonlyArray<{
      readonly key: AptitudeKey;
      readonly label: string;
      readonly value: number;
    }>;
  };
  /** 接し方（§2.14）。本人のソーシャルスタイル（scores.socialStyle）の文 */
  readonly style: {
    readonly key: SocialStyleKey;
    readonly typeName: string; // スタイル名（エミアブルタイプ）
    readonly katakana: string; // カタカナ名（エミアブル）
    readonly greatPersonName: string; // 偉人名
    readonly imagePath: string; // /images/styles/{key}.svg（K-05）
    readonly body: StyleBodyParts; // 本文の振り分け（splitStyleBody）
    /** 4 区分の表（STYLE_QUADRANTS の順。value は scores.socialStyles の値を丸めず負のまま） */
    readonly quad: ReadonlyArray<{
      readonly key: SocialStyleKey;
      readonly name: string; // アナリティカル など
      readonly kind: string; // 思考派 など
      readonly align: "left" | "right";
      readonly value: number;
    }>;
    /** 小さいレーダー（SOCIAL_STYLE_RADAR_AXES の順 = 軸の順。値は丸めず負のまま。0 の位置に描くのは部品） */
    readonly radar: ReadonlyArray<{
      readonly key: SocialStyleKey;
      readonly label: string;
      readonly value: number;
    }>;
    /** 関わり方のコツ（見分け方・褒め方・効果的な対応・声かけ例の順。文の無いカードは含めない） */
    readonly howTo: ReadonlyArray<{ readonly title: string; readonly parts: HowToParts }>;
    /** タイプ別の接し方のタブ（SOCIAL_STYLE_RADAR_AXES の順。text は STYLE_INTERACTIONS[viewer][本人のスタイル]） */
    readonly interactions: ReadonlyArray<{
      readonly viewer: SocialStyleKey;
      readonly label: string; // タブの名前（見ている人のスタイルのカタカナ名）
      readonly text: string;
    }>;
  };
}

const APTITUDE_TYPES = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.key, t]));
const APTITUDE_LABELS = new Map(APTITUDE_DEFINITIONS.map((a) => [a.key, a.label]));
const STYLE_KATAKANA = new Map(SOCIAL_STYLE_DEFINITIONS.map((s) => [s.key, s.labelKatakana]));
const TRAIT_LABELS = new Map(TRAIT_DEFINITIONS.map((t) => [t.key, t.label]));

/** 職業の表示名（§2.4。コード 10 は「責任者」、旧コード 9 は「その他」）。未知のコードは "" にして、受験情報の項目を出さない */
function occupationLabelOf(code: number): string {
  try {
    return getOccupationLabel(code);
  } catch (error) {
    if (error instanceof RangeError) return "";
    throw error;
  }
}

/** 特性の詳細（§2.9）: resolveTraitDetails の 5 カテゴリ（本人のタイプが「表示するタイプ」に入る文を、カテゴリの中の定義順に並べる） */
function detailsOf(aptitudeType: AptitudeTypeKey): ResultDetailView["details"] {
  return Object.freeze(
    resolveTraitDetails(aptitudeType).map((group) =>
      Object.freeze({
        category: group.category,
        heading: detailHeading(group.label),
        icon: DETAIL_CATEGORY_ICONS[group.category],
        sentences: group.sentences,
      }),
    ),
  );
}

/**
 * 育て方の 12 項目（§2.13.3）: LEARN_ITEM_GROUPS の区切りと順に、文（前後の空白を除いて空）の無い項目を除き、項目が 1 つも無い区切りを
 * 除く。items は育成方法のマスタの 1 資質分（DEVELOPMENT_GUIDES[資質].items）
 */
export function learnGroupsOf(
  items: Readonly<Record<DevelopmentGuideItemKey, string>>,
): LearnCandidateView["groups"] {
  return Object.freeze(
    LEARN_ITEM_GROUPS.map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => items[item.key].trim() !== "")
        .map((item) =>
          Object.freeze({
            key: item.key,
            label: item.label,
            icon: item.icon,
            text: items[item.key],
          }),
        ),
    }))
      .filter((group) => group.items.length > 0)
      .map((group) => Object.freeze({ title: group.title, items: Object.freeze(group.items) })),
  );
}

/** 育て方の候補 1 つ（§2.13.1・§2.13.4）。第一候補と第二候補で同じ作り（第二候補の「話し方」も入れ替えない。K-32 ⑨） */
function learnCandidateOf(key: AptitudeKey): LearnCandidateView {
  const items = DEVELOPMENT_GUIDES[key].items;
  return Object.freeze({
    key,
    label: APTITUDE_LABELS.get(key) ?? "",
    imagePath: `/images/aptitudes/${key}.svg`,
    sense: items.dominant_sense,
    senseShort: senseShortName(items.dominant_sense),
    approach: items.approach,
    groups: learnGroupsOf(items),
  });
}

/** 関わり方のコツの 4 枚（§2.14.3）: [マスタの見出し, 文] の順（見分け方・褒め方・効果的な対応・声かけ例） */
const HOW_TO_CARDS = [
  ["identifyHeading", "identify"],
  ["praiseHeading", "praise"],
  ["responseHeading", "response"],
  ["phrasesHeading", "phrases"],
] as const;

/**
 * 関わり方のコツ（§2.14.3）: 見分け方・褒め方・効果的な対応・声かけ例の順に、題（howToTitle）と中身の振り分け（splitHowTo。声かけ例の
 * カードだけ「・」の行を吹き出しにする）。文（前後の空白を除いて空）の無いカードは含めない。texts はソーシャルスタイル別文言の 1 スタイル分
 */
export function howToCardsOf(texts: SocialStyleTexts): ResultDetailView["style"]["howTo"] {
  return Object.freeze(
    HOW_TO_CARDS.filter(([, field]) => texts[field].trim() !== "").map(([heading, field]) =>
      Object.freeze({
        title: howToTitle(texts[heading]),
        parts: splitHowTo(texts[field], field === "phrases"),
      }),
    ),
  );
}

/** 接し方（§2.14）: 本人のスタイルの文と 4 区分の表・小さいレーダーの値、本人のスタイルの列のタイプ別の接し方 4 つ */
function styleOf(scores: ScoreResult): ResultDetailView["style"] {
  const key = scores.socialStyle;
  const texts = STYLE_TEXTS[key];
  return Object.freeze({
    key,
    typeName: texts.typeName,
    katakana: STYLE_KATAKANA.get(key) ?? "",
    greatPersonName: texts.greatPersonName,
    imagePath: `/images/styles/${key}.svg`,
    body: splitStyleBody(texts.body),
    quad: Object.freeze(
      STYLE_QUADRANTS.map((q) =>
        Object.freeze({
          key: q.key,
          name: q.name,
          kind: q.kind,
          align: q.align,
          value: scores.socialStyles[q.key],
        }),
      ),
    ),
    radar: Object.freeze(
      SOCIAL_STYLE_RADAR_AXES.map((axis) =>
        Object.freeze({ key: axis.key, label: axis.label, value: scores.socialStyles[axis.key] }),
      ),
    ),
    howTo: howToCardsOf(texts),
    interactions: Object.freeze(
      SOCIAL_STYLE_RADAR_AXES.map((axis) =>
        Object.freeze({
          viewer: axis.key,
          label: axis.label,
          text: STYLE_INTERACTIONS[axis.key][key],
        }),
      ),
    ),
  });
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
    learn: Object.freeze({
      first: learnCandidateOf(scores.aptitudeFirst),
      second: learnCandidateOf(scores.aptitudeSecond),
      aptitudes: Object.freeze(
        APTITUDE_RADAR_AXES.map((axis) =>
          Object.freeze({ key: axis.key, label: axis.label, value: scores.aptitudes[axis.key] }),
        ),
      ),
    }),
    style: styleOf(scores),
  });
}
