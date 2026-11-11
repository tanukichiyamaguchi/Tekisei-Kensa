// 結果詳細の特性の詳細の組み立て（06 §4.3・§4.4、11-4 §2.9・§3.5）。lib/masters だけに依存する純関数で、buildResultDetailView
// （result-detail-view.ts）が特性の詳細の 5 枚を作るときに使う。ほかの文言（タイプ・育成方法・ソーシャルスタイル・タイプ別の接し方）は
// buildResultDetailView がマスタから直接組み立てる（前回の resolveResultTexts は消した。11-4 §4.3）
import {
  TRAIT_DETAIL_CATEGORIES,
  TRAIT_DETAIL_SENTENCES,
  type TraitDetailCategoryKey,
} from "@/lib/masters/texts";
import type { AptitudeTypeKey } from "@/lib/scoring/types";

export interface TraitDetailGroup {
  readonly category: TraitDetailCategoryKey;
  readonly label: string;
  readonly sentences: readonly string[]; // 該当文のみ、定義順（該当 0 件のカテゴリは空の配列）
}

/**
 * 特性詳細: appliesTo に該当する文をカテゴリ順・定義順に並べる。5 カテゴリを常に返す（該当 0 件のカテゴリは sentences が空の配列。
 * 結果詳細の特性の詳細は 5 枚を出す。11-4 §2.9・§3.5）
 */
export function resolveTraitDetails(aptitudeType: AptitudeTypeKey): readonly TraitDetailGroup[] {
  return Object.freeze(
    [...TRAIT_DETAIL_CATEGORIES]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) =>
        Object.freeze({
          category: category.key,
          label: category.label,
          sentences: Object.freeze(
            TRAIT_DETAIL_SENTENCES.filter(
              (s) => s.category === category.key && s.appliesTo.includes(aptitudeType),
            )
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => s.text),
          ),
        }),
      ),
  );
}
