// 付録C §2 特性詳細（06 §4.1）。表示順はカテゴリの sortOrder → カテゴリ内の sortOrder（付録C の記載順。06 D06-13）
import raw from "../data/texts/trait-details.json";
import {
  TRAIT_DETAIL_CATEGORY_KEYS,
  type TraitDetailCategoryDefinition,
  type TraitDetailSentence,
} from "./types";
import { asArray, asKey, asNumber, asObject, asString, fail, itemsOf } from "./validate";
import { APTITUDE_TYPE_KEYS } from "@/lib/scoring/types";

export const TRAIT_DETAIL_CATEGORIES: readonly TraitDetailCategoryDefinition[] = Object.freeze(
  asArray(asObject(raw, "trait_details").categories, "trait_details.categories").map((v, i) => {
    const item = asObject(v, `trait_details.categories[${i}]`);
    const key = asKey(item.key, TRAIT_DETAIL_CATEGORY_KEYS, `trait_details.categories[${i}].key`);
    if (key !== TRAIT_DETAIL_CATEGORY_KEYS[i])
      fail("trait_details.categories", "並び順が想定外です");
    return Object.freeze({
      key,
      label: asString(item.label, `trait_details.categories[${i}].label`),
      sortOrder: asNumber(item.sortOrder, `trait_details.categories[${i}].sortOrder`),
    });
  }),
);
if (TRAIT_DETAIL_CATEGORIES.length !== TRAIT_DETAIL_CATEGORY_KEYS.length) {
  fail("trait_details.categories", "カテゴリが 5 件ではありません");
}

export const TRAIT_DETAIL_SENTENCES: readonly TraitDetailSentence[] = Object.freeze(
  itemsOf(raw, "trait_details").map((item, i) => {
    const where = `trait_details[${i}]`;
    return Object.freeze({
      category: asKey(item.category, TRAIT_DETAIL_CATEGORY_KEYS, `${where}.category`),
      sortOrder: asNumber(item.sortOrder, `${where}.sortOrder`),
      text: asString(item.text, `${where}.text`),
      appliesTo: Object.freeze(
        asArray(item.appliesTo, `${where}.appliesTo`).map((t, j) =>
          asKey(t, APTITUDE_TYPE_KEYS, `${where}.appliesTo[${j}]`),
        ),
      ),
    });
  }),
);
