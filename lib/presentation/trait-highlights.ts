// 項目詳細の最高・最低尺度（03 §8.3）。同点時は TRAIT_KEYS（レーダー軸順）で先の尺度（D3-11）。結果詳細の概要のいちばん高い・低い特性と、
// 16の特性の一覧の札に使う（11-4 §2.7.5・§2.8.5）。項目一覧のポップアップの並べ替え（sortTraitsForList）は PR-7.8a で消した（2 つの
// ポップアップは 16 行を項目順。11-4 §2.15）
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
