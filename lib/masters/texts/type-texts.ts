// 付録C §1 適性タイプ別文言（06 §4.1）
import raw from "../data/texts/type-texts.json";
import type { AptitudeTypeTexts } from "./types";
import { asKey, asString, itemsOf, toRecord } from "./validate";
import { APTITUDE_TYPE_KEYS, type AptitudeTypeKey } from "@/lib/scoring/types";

export const TYPE_TEXTS: Readonly<Record<AptitudeTypeKey, AptitudeTypeTexts>> = toRecord(
  itemsOf(raw, "type_texts").map((item, i) => {
    const where = `type_texts[${i}]`;
    const key = asKey(item.key, APTITUDE_TYPE_KEYS, `${where}.key`);
    const texts: AptitudeTypeTexts = Object.freeze({
      key,
      aptitudeHeading: asString(item.aptitudeHeading, `${where}.aptitudeHeading`),
      characteristics: asString(item.characteristics, `${where}.characteristics`),
      suitableJobs: asString(item.suitableJobs, `${where}.suitableJobs`),
      advice: asString(item.advice, `${where}.advice`),
    });
    return [key, texts] as const;
  }),
  APTITUDE_TYPE_KEYS,
  "type_texts",
);
