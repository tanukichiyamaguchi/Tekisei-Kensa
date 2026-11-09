// 付録C §8 組織内分類（06 §4.1、11-3 §3.9）
import raw from "../data/texts/classifications.json";
import type { ClassificationAxes, ClassificationCharacterText, ClassificationTexts } from "./types";
import {
  asArray,
  asKey,
  asNumber,
  asObject,
  asString,
  fail,
  itemsOf,
  single,
  toRecord,
} from "./validate";
import { APTITUDE_TYPE_KEYS, SOCIAL_STYLE_KEYS, type SocialStyleKey } from "@/lib/scoring/types";

const items = itemsOf(raw, "classifications");

/** 分類の中の列・行（0 か 1） */
function asCell(value: unknown, where: string): 0 | 1 {
  const cell = asNumber(value, where);
  if (cell !== 0 && cell !== 1) fail(where, `0 か 1 ではありません: ${cell}`);
  return cell;
}

export const CLASSIFICATION_TEXTS: Readonly<Record<SocialStyleKey, ClassificationTexts>> = toRecord(
  items.map((item, i) => {
    const where = `classifications[${i}]`;
    const key = asKey(item.socialStyleKey, SOCIAL_STYLE_KEYS, `${where}.socialStyleKey`);
    const axis = asObject(item.axisPosition, `${where}.axisPosition`);
    const characterOrder = Object.freeze(
      asArray(item.characterOrder, `${where}.characterOrder`).map((t, j) =>
        asKey(t, APTITUDE_TYPE_KEYS, `${where}.characterOrder[${j}]`),
      ),
    );
    const characters: readonly ClassificationCharacterText[] = Object.freeze(
      asArray(item.characters, `${where}.characters`).map((v, j) => {
        const c = asObject(v, `${where}.characters[${j}]`);
        return Object.freeze({
          aptitudeType: asKey(
            c.aptitudeType,
            APTITUDE_TYPE_KEYS,
            `${where}.characters[${j}].aptitudeType`,
          ),
          column: asCell(c.column, `${where}.characters[${j}].column`),
          row: asCell(c.row, `${where}.characters[${j}].row`),
          positionDescription: asString(
            c.positionDescription,
            `${where}.characters[${j}].positionDescription`,
          ),
        });
      }),
    );
    if (characters.map((c) => c.aptitudeType).join("|") !== characterOrder.join("|")) {
      fail(`${where}.characters`, "タイプの並びが characterOrder と一致しません");
    }
    return [
      key,
      Object.freeze({
        key,
        description: asString(item.description, `${where}.description`),
        emotionAxis: asKey(axis.emotion, ["suppress", "express"], `${where}.axisPosition.emotion`),
        assertionAxis: asKey(
          axis.assertion,
          ["listen", "assert"],
          `${where}.axisPosition.assertion`,
        ),
        characterOrder,
        characters,
      }),
    ] as const;
  }),
  SOCIAL_STYLE_KEYS,
  "classifications",
);

const axes = asObject(asObject(raw, "classifications").axes, "classifications.axes");
const emotion = asObject(axes.emotion, "classifications.axes.emotion");
const assertion = asObject(axes.assertion, "classifications.axes.assertion");

/** 縦軸・横軸の表示名（付録C §8 冒頭） */
export const CLASSIFICATION_AXES: ClassificationAxes = Object.freeze({
  emotion: Object.freeze({
    suppress: asString(emotion.suppress, "axes.emotion.suppress"),
    express: asString(emotion.express, "axes.emotion.express"),
  }),
  assertion: Object.freeze({
    listen: asString(assertion.listen, "axes.assertion.listen"),
    assert: asString(assertion.assert, "axes.assertion.assert"),
  }),
});

/** 該当者 0 名のときの文言（付録C §8 末尾「この分類の回答者はまだいません。」。11-3 §3.9） */
export const CLASSIFICATION_EMPTY_MESSAGE: string = single(
  items.map((item, i) => asString(item.emptyMessage, `classifications[${i}].emptyMessage`)),
  "classifications.emptyMessage",
);
