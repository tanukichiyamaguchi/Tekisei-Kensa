// 付録C §6 立ち位置（06 §4.1、00 §3.5 PositionDefinition）。閾値は再定義せず 03 の POSITION_RULES から導く（06 X-06）
import raw from "../data/texts/positions.json";
import type { PositionDefinition } from "../types";
import { asArray, asKey, asString, itemsOf, toRecord } from "./validate";
import { POSITION_RULES } from "@/lib/scoring/compare";
import { POSITION_KEYS, type PositionKey } from "@/lib/scoring/types";

const texts = new Map(
  itemsOf(raw, "positions").map((item, i) => {
    const where = `positions[${i}]`;
    const key = asKey(item.positionKey, POSITION_KEYS, `${where}.positionKey`);
    const lines = asArray(item.descriptionLines, `${where}.descriptionLines`).map((l, j) =>
      asString(l, `${where}.descriptionLines[${j}]`),
    );
    return [key, { label: asString(item.label, `${where}.label`), lines }] as const;
  }),
);

/** POSITION_RULES は偏差値の高い順。maxDeviation（未満）は 1 つ上の段階の下限 */
export const POSITION_DEFINITIONS: Readonly<Record<PositionKey, PositionDefinition>> = toRecord(
  POSITION_RULES.map((rule, i) => {
    const text = texts.get(rule.key);
    return [
      rule.key,
      Object.freeze({
        key: rule.key,
        minDeviation: rule.minDeviation,
        maxDeviation: i === 0 ? null : (POSITION_RULES[i - 1]?.minDeviation ?? null),
        label: text?.label ?? "",
        description: text?.lines.join("\n") ?? "",
      }),
    ] as const;
  }),
  POSITION_KEYS,
  "positions",
);
for (const key of POSITION_KEYS)
  asString(POSITION_DEFINITIONS[key].label, `positions.${key}.label`);
