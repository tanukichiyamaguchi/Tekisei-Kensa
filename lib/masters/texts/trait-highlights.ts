// 付録C §3 項目詳細（06 §4.1）
import raw from "../data/texts/trait-highlights.json";
import type { TraitHighlightTexts } from "./types";
import { asKey, asString, itemsOf, toRecord } from "./validate";
import { TRAIT_KEYS, type TraitKey } from "@/lib/scoring/types";

export const TRAIT_HIGHLIGHT_TEXTS: Readonly<Record<TraitKey, TraitHighlightTexts>> = toRecord(
  itemsOf(raw, "trait_highlights").map((item, i) => {
    const where = `trait_highlights[${i}]`;
    const key = asKey(item.key, TRAIT_KEYS, `${where}.key`);
    const texts: TraitHighlightTexts = Object.freeze({
      key,
      highPositive: asString(item.highPositive, `${where}.highPositive`),
      highNegative: asString(item.highNegative, `${where}.highNegative`),
      lowPositive: asString(item.lowPositive, `${where}.lowPositive`),
      lowNegative: asString(item.lowNegative, `${where}.lowNegative`),
    });
    return [key, texts] as const;
  }),
  TRAIT_KEYS,
  "trait_highlights",
);
