// 付録C §5 ソーシャルスタイル別文言（06 §4.1）
import raw from "../data/texts/style-texts.json";
import type { SocialStyleTexts } from "./types";
import { asKey, asString, itemsOf, toRecord } from "./validate";
import { SOCIAL_STYLE_KEYS, type SocialStyleKey } from "@/lib/scoring/types";

const FIELDS = [
  "typeName",
  "greatPersonName",
  "body",
  "interactionHeading",
  "identifyHeading",
  "identify",
  "praiseHeading",
  "praise",
  "responseHeading",
  "response",
  "phrasesHeading",
  "phrases",
] as const satisfies ReadonlyArray<Exclude<keyof SocialStyleTexts, "key">>;

export const STYLE_TEXTS: Readonly<Record<SocialStyleKey, SocialStyleTexts>> = toRecord(
  itemsOf(raw, "style_texts").map((item, i) => {
    const where = `style_texts[${i}]`;
    const key = asKey(item.socialStyleKey, SOCIAL_STYLE_KEYS, `${where}.socialStyleKey`);
    const fields = Object.fromEntries(
      FIELDS.map((f) => [f, asString(item[f], `${where}.${f}`)]),
    ) as Record<(typeof FIELDS)[number], string>;
    return [key, Object.freeze({ key, ...fields })] as const;
  }),
  SOCIAL_STYLE_KEYS,
  "style_texts",
);
