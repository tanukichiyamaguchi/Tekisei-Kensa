// 項目詳細の最高・最低尺度（03 §8.3）。同点時は TRAIT_KEYS（レーダー軸順）で先の尺度（D3-11）。
import { TRAIT_KEYS } from "@/lib/scoring/types";
import type { TraitKey, TraitScores } from "@/lib/scoring/types";

export interface TraitHighlight {
  readonly key: TraitKey;
  readonly value: number;
}

function pick(
  traits: TraitScores,
  better: (candidate: number, best: number) => boolean,
): TraitHighlight {
  let best: TraitKey = TRAIT_KEYS[0];
  for (const key of TRAIT_KEYS) if (better(traits[key], traits[best])) best = key;
  return Object.freeze({ key: best, value: traits[best] });
}

export function pickHighestTrait(traits: TraitScores): TraitHighlight {
  return pick(traits, (candidate, best) => candidate > best);
}

export function pickLowestTrait(traits: TraitScores): TraitHighlight {
  return pick(traits, (candidate, best) => candidate < best);
}

/** 一覧ポップアップ用: 値の降順、同点は TRAIT_KEYS 順（安定ソート） */
export function sortTraitsForList(traits: TraitScores): readonly TraitHighlight[] {
  return Object.freeze(
    TRAIT_KEYS.map((key, index) => ({ key, value: traits[key], index }))
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .map(({ key, value }) => Object.freeze({ key, value })),
  );
}
