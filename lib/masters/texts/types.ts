// 文言マスタの型（06 §4.2）。本文は付録C から scripts/generate-texts.ts が生成した lib/masters/data/texts/*.json にある
import type {
  AptitudeKey,
  AptitudeTypeKey,
  PositionKey,
  SocialStyleKey,
  TraitKey,
} from "@/lib/scoring/types";

/** 付録C §1: 適性タイプ別の文言（キャラクター名は AptitudeTypeDefinition が持つ） */
export interface AptitudeTypeTexts {
  readonly key: AptitudeTypeKey;
  readonly aptitudeHeading: string; // 「<人と接する機会の多い仕事>に適性があります」
  readonly characteristics: string; // 特徴
  readonly suitableJobs: string; // 適性職種
  readonly advice: string; // アドバイス
}

/** 付録C §2: 特性詳細のカテゴリ（表示順は付録C §2 の記載順。06 D06-13） */
export const TRAIT_DETAIL_CATEGORY_KEYS = [
  "interpersonal",
  "behavior",
  "emotion",
  "work",
  "environment",
] as const;
export type TraitDetailCategoryKey = (typeof TRAIT_DETAIL_CATEGORY_KEYS)[number];
export interface TraitDetailCategoryDefinition {
  readonly key: TraitDetailCategoryKey;
  readonly label: string; // 対人関係 / 行動特性 / 情緒及び精神面 / 業務対応 / 環境適応
  readonly sortOrder: number;
}
export interface TraitDetailSentence {
  readonly category: TraitDetailCategoryKey;
  readonly sortOrder: number; // カテゴリ内の定義順（付録C §2 の表の行順）
  readonly text: string;
  readonly appliesTo: readonly AptitudeTypeKey[]; // 表示するタイプ
}

/** 付録C §3: 項目詳細（高い場合／低い場合のポジティブ・ネガティブ）。読点区切りの文字列をそのまま持つ */
export interface TraitHighlightTexts {
  readonly key: TraitKey;
  readonly highPositive: string;
  readonly highNegative: string;
  readonly lowPositive: string;
  readonly lowNegative: string;
}

/** 付録C §4: 育成方法 14 項目 */
export const DEVELOPMENT_GUIDE_ITEM_KEYS = [
  "characteristics",
  "approach",
  "thinking",
  "dominant_sense",
  "impression",
  "emotion",
  "personality",
  "top_priority",
  "listening",
  "behavior",
  "speaking",
  "learning_style",
  "compatibility",
  "interpersonal",
] as const;
export type DevelopmentGuideItemKey = (typeof DEVELOPMENT_GUIDE_ITEM_KEYS)[number];
export interface DevelopmentGuideItemDefinition {
  readonly key: DevelopmentGuideItemKey;
  readonly label: string; // 特徴 / 本タイプへのアプローチ / …
  readonly sortOrder: number; // 付録C §4 の記載順
}
export interface DevelopmentGuide {
  readonly key: AptitudeKey;
  readonly items: Readonly<Record<DevelopmentGuideItemKey, string>>;
}

/** 付録C §5: ソーシャルスタイル別文言 */
export interface SocialStyleTexts {
  readonly key: SocialStyleKey;
  readonly typeName: string; // ドライビングタイプ
  readonly greatPersonName: string; // ナポレオン
  readonly body: string; // 本文（改行を含む）
  readonly interactionHeading: string; // 対処法見出し
  readonly identifyHeading: string; // 見分け方（見出し）
  readonly identify: string;
  readonly praiseHeading: string;
  readonly praise: string;
  readonly responseHeading: string; // 効果的な対応（見出し）
  readonly response: string;
  readonly phrasesHeading: string; // 声かけ例（見出し）
  readonly phrases: string;
}

/** 付録C §8: 組織内分類 */
export interface ClassificationTexts {
  readonly key: SocialStyleKey;
  readonly description: string; // 分類の説明文
  readonly emotionAxis: "suppress" | "express"; // 感情を抑える / 感情を表す
  readonly assertionAxis: "listen" | "assert"; // 意見を聞く / 意見を主張する
  readonly characterOrder: readonly AptitudeTypeKey[]; // 付録C §8 の表のキャラクター順
}
export interface ClassificationAxes {
  readonly emotion: { readonly suppress: string; readonly express: string }; // 感情表現を抑える / 感情を表す
  readonly assertion: { readonly listen: string; readonly assert: string }; // 意見を聞く / 意見を主張する
}

/** 付録C §6 の生成物 1 件（positions.ts が 00 §3.5 の PositionDefinition に組み立てる） */
export interface PositionTexts {
  readonly key: PositionKey;
  readonly label: string;
  readonly descriptionLines: readonly string[];
}
