// 付録C §9 16の特性の説明（11-4 §3.3）。結果詳細の 16の特性で項目を押したときに出す 2 行
import raw from "../data/texts/trait-descriptions.json";
import type { TraitDescriptionTexts } from "./types";
import { asKey, asString, itemsOf, toRecord } from "./validate";
import { TRAIT_KEYS, type TraitKey } from "@/lib/scoring/types";

/** 16 キーがそろい、空の文が無いことを読み込み時に確かめる */
export const TRAIT_DESCRIPTIONS: Readonly<Record<TraitKey, TraitDescriptionTexts>> = toRecord(
  itemsOf(raw, "trait_descriptions").map((item, i) => {
    const where = `trait_descriptions[${i}]`;
    const key = asKey(item.key, TRAIT_KEYS, `${where}.key`);
    const texts: TraitDescriptionTexts = Object.freeze({
      key,
      description: asString(item.description, `${where}.description`),
      highLow: asString(item.highLow, `${where}.highLow`),
    });
    return [key, texts] as const;
  }),
  TRAIT_KEYS,
  "trait_descriptions",
);
