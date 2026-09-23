// 付録C §4 育成方法（06 §4.1）。見出しには表示名（APTITUDE_DEFINITIONS[].label）を使い、内部名は出さない
import raw from "../data/texts/development-guides.json";
import {
  DEVELOPMENT_GUIDE_ITEM_KEYS,
  type DevelopmentGuide,
  type DevelopmentGuideItemDefinition,
  type DevelopmentGuideItemKey,
} from "./types";
import { asArray, asKey, asObject, asString, fail, itemsOf, single, toRecord } from "./validate";
import { APTITUDE_KEYS, type AptitudeKey } from "@/lib/scoring/types";

const guides = itemsOf(raw, "development_guides").map((item, i) => {
  const where = `development_guides[${i}]`;
  const key = asKey(item.aptitudeKey, APTITUDE_KEYS, `${where}.aptitudeKey`);
  const entries = asArray(item.items, `${where}.items`).map((v, j) => {
    const entry = asObject(v, `${where}.items[${j}]`);
    const itemKey = asKey(entry.key, DEVELOPMENT_GUIDE_ITEM_KEYS, `${where}.items[${j}].key`);
    if (itemKey !== DEVELOPMENT_GUIDE_ITEM_KEYS[j])
      fail(`${where}.items`, "項目の並び順が想定外です");
    return {
      key: itemKey,
      label: asString(entry.label, `${where}.items[${j}].label`),
      text: asString(entry.text, `${where}.items[${j}].text`),
    };
  });
  return { key, entries };
});

/** 14 項目の定義（付録C §4 の記載順）。項目名は 4 型で同一であることを確かめる（08 §7.4） */
export const DEVELOPMENT_GUIDE_ITEMS: readonly DevelopmentGuideItemDefinition[] = Object.freeze(
  DEVELOPMENT_GUIDE_ITEM_KEYS.map((key, i) =>
    Object.freeze({
      key,
      label: single(
        guides.map((g) => g.entries[i]?.label),
        `development_guides の ${key} の項目名（4 型で同一であること）`,
      ) as string,
      sortOrder: i + 1,
    }),
  ),
);

export const DEVELOPMENT_GUIDES: Readonly<Record<AptitudeKey, DevelopmentGuide>> = toRecord(
  guides.map(({ key, entries }) => {
    const items = toRecord(
      entries.map((e) => [e.key, e.text] as const),
      DEVELOPMENT_GUIDE_ITEM_KEYS,
      `development_guides.${key}`,
    ) as Readonly<Record<DevelopmentGuideItemKey, string>>;
    return [key, Object.freeze({ key, items })] as const;
  }),
  APTITUDE_KEYS,
  "development_guides",
);
