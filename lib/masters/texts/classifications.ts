// 付録C §8 組織内分類（06 §4.1）
import raw from "../data/texts/classifications.json";
import type { ClassificationAxes, ClassificationTexts } from "./types";
import { asArray, asKey, asObject, asString, itemsOf, single, toRecord } from "./validate";
import { APTITUDE_TYPE_KEYS, SOCIAL_STYLE_KEYS, type SocialStyleKey } from "@/lib/scoring/types";

const items = itemsOf(raw, "classifications");

export const CLASSIFICATION_TEXTS: Readonly<Record<SocialStyleKey, ClassificationTexts>> = toRecord(
  items.map((item, i) => {
    const where = `classifications[${i}]`;
    const key = asKey(item.socialStyleKey, SOCIAL_STYLE_KEYS, `${where}.socialStyleKey`);
    const axis = asObject(item.axisPosition, `${where}.axisPosition`);
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
        characterOrder: Object.freeze(
          asArray(item.characterOrder, `${where}.characterOrder`).map((t, j) =>
            asKey(t, APTITUDE_TYPE_KEYS, `${where}.characterOrder[${j}]`),
          ),
        ),
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

/** 該当者 0 名のときの文言（付録C §8 末尾「本タイプの回答者はいません。」。06 T-07） */
export const CLASSIFICATION_EMPTY_MESSAGE: string = single(
  items.map((item, i) => asString(item.emptyMessage, `classifications[${i}].emptyMessage`)),
  "classifications.emptyMessage",
);
