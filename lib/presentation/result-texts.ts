// 結果詳細の比較に依存しない文言の出し分け（06 §4.3・§4.4）。lib/masters と trait-highlights だけに依存する純関数
import { pickHighestTrait, pickLowestTrait, type TraitHighlight } from "./trait-highlights";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import {
  DEVELOPMENT_GUIDES,
  STYLE_INTERACTIONS,
  STYLE_TEXTS,
  STYLE_VIEWER_HEADINGS,
  TRAIT_DETAIL_CATEGORIES,
  TRAIT_DETAIL_SENTENCES,
  TRAIT_HIGHLIGHT_TEXTS,
  TYPE_TEXTS,
  type AptitudeTypeTexts,
  type DevelopmentGuide,
  type SocialStyleTexts,
  type TraitDetailCategoryKey,
} from "@/lib/masters/texts";
import {
  TRAIT_KEYS,
  type AptitudeKey,
  type AptitudeTypeKey,
  type ScoreResult,
  type SocialStyleKey,
  type TraitKey,
} from "@/lib/scoring/types";

export interface TraitDetailGroup {
  readonly category: TraitDetailCategoryKey;
  readonly label: string;
  readonly sentences: readonly string[]; // 該当文のみ、定義順
}

export interface TraitHighlightView {
  readonly highlight: TraitHighlight;
  readonly label: string;
  readonly positive: string;
  readonly negative: string;
}

export interface DevelopmentView {
  readonly key: AptitudeKey;
  readonly label: string; // 表示名（直感型など）。内部名は出さない（06 §4.3）
  readonly guide: DevelopmentGuide;
}

export interface ResultTexts {
  readonly type: AptitudeTypeTexts;
  readonly characterName: string; // カタカナ（結果詳細）
  readonly traitDetails: readonly TraitDetailGroup[]; // 該当 0 件のカテゴリは含めない
  readonly highest: TraitHighlightView;
  readonly lowest: TraitHighlightView;
  readonly allTraitsEqual: boolean; // 注記の表示（06 D06-12）
  readonly developmentFirst: DevelopmentView;
  readonly developmentSecond: DevelopmentView;
  readonly style: SocialStyleTexts;
  readonly styleInteractions: ReadonlyArray<{
    readonly viewer: SocialStyleKey;
    readonly heading: string;
    readonly text: string;
  }>;
}

const TRAIT_LABELS = new Map(TRAIT_DEFINITIONS.map((t) => [t.key, t.label]));
const APTITUDE_LABELS = new Map(APTITUDE_DEFINITIONS.map((a) => [a.key, a.label]));
const CHARACTER_NAMES = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.key, t.characterName]));
/** 付録C §5 末尾の表の行順（ドライビング・エクスプレッシブ・エミアブル・アナリティカル）。chartOrder と同じ並び */
const VIEWER_ORDER: readonly SocialStyleKey[] = [...SOCIAL_STYLE_DEFINITIONS]
  .sort((a, b) => a.chartOrder - b.chartOrder)
  .map((s) => s.key);

export function traitLabel(key: TraitKey): string {
  return TRAIT_LABELS.get(key) ?? key;
}

/** 特性詳細: appliesTo に該当する文をカテゴリ順・定義順に並べる。該当 0 件のカテゴリは含めない */
export function resolveTraitDetails(aptitudeType: AptitudeTypeKey): readonly TraitDetailGroup[] {
  return Object.freeze(
    [...TRAIT_DETAIL_CATEGORIES]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({
        category: category.key,
        label: category.label,
        sentences: Object.freeze(
          TRAIT_DETAIL_SENTENCES.filter(
            (s) => s.category === category.key && s.appliesTo.includes(aptitudeType),
          )
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => s.text),
        ),
      }))
      .filter((group) => group.sentences.length > 0)
      .map((group) => Object.freeze(group)),
  );
}

function highlightView(highlight: TraitHighlight, side: "high" | "low"): TraitHighlightView {
  const texts = TRAIT_HIGHLIGHT_TEXTS[highlight.key];
  return Object.freeze({
    highlight,
    label: traitLabel(highlight.key),
    positive: side === "high" ? texts.highPositive : texts.lowPositive,
    negative: side === "high" ? texts.highNegative : texts.lowNegative,
  });
}

function developmentView(key: AptitudeKey): DevelopmentView {
  return Object.freeze({
    key,
    label: APTITUDE_LABELS.get(key) ?? key,
    guide: DEVELOPMENT_GUIDES[key],
  });
}

/** 比較に依存しない文言をすべて解決する（06 §4.4）。純関数 */
export function resolveResultTexts(result: ScoreResult): ResultTexts {
  const first = result.traits[TRAIT_KEYS[0]];
  return Object.freeze({
    type: TYPE_TEXTS[result.aptitudeType],
    characterName: CHARACTER_NAMES.get(result.aptitudeType) ?? "",
    traitDetails: resolveTraitDetails(result.aptitudeType),
    highest: highlightView(pickHighestTrait(result.traits), "high"),
    lowest: highlightView(pickLowestTrait(result.traits), "low"),
    allTraitsEqual: TRAIT_KEYS.every((k) => result.traits[k] === first),
    developmentFirst: developmentView(result.aptitudeFirst),
    developmentSecond: developmentView(result.aptitudeSecond),
    style: STYLE_TEXTS[result.socialStyle],
    // 閲覧者 4 スタイルの見出しをすべて表示する（06 §4.3）
    styleInteractions: Object.freeze(
      VIEWER_ORDER.map((viewer) =>
        Object.freeze({
          viewer,
          heading: STYLE_VIEWER_HEADINGS[viewer],
          text: STYLE_INTERACTIONS[viewer][result.socialStyle],
        }),
      ),
    ),
  });
}
