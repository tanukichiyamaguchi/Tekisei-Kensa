// 付録C §5 末尾の表「タイプ別の対処法」（06 §4.1）: STYLE_INTERACTIONS[閲覧者][対象者]
import raw from "../data/texts/style-interactions.json";
import { asKey, asString, itemsOf, single, toRecord } from "./validate";
import { SOCIAL_STYLE_KEYS, type SocialStyleKey } from "@/lib/scoring/types";

const rows = itemsOf(raw, "style_interactions").map((item, i) => {
  const where = `style_interactions[${i}]`;
  return {
    viewer: asKey(item.viewer, SOCIAL_STYLE_KEYS, `${where}.viewer`),
    target: asKey(item.target, SOCIAL_STYLE_KEYS, `${where}.target`),
    viewerHeading: asString(item.viewerHeading, `${where}.viewerHeading`),
    text: asString(item.text, `${where}.text`),
  };
});

export const STYLE_INTERACTIONS: Readonly<
  Record<SocialStyleKey, Readonly<Record<SocialStyleKey, string>>>
> = toRecord(
  SOCIAL_STYLE_KEYS.map(
    (viewer) =>
      [
        viewer,
        toRecord(
          rows.filter((r) => r.viewer === viewer).map((r) => [r.target, r.text] as const),
          SOCIAL_STYLE_KEYS,
          `style_interactions.${viewer}`,
        ),
      ] as const,
  ),
  SOCIAL_STYLE_KEYS,
  "style_interactions",
);

/** 「ドライビングなあなたは」など（閲覧者ごとの見出し） */
export const STYLE_VIEWER_HEADINGS: Readonly<Record<SocialStyleKey, string>> = toRecord(
  SOCIAL_STYLE_KEYS.map(
    (viewer) =>
      [
        viewer,
        single(
          rows.filter((r) => r.viewer === viewer).map((r) => r.viewerHeading),
          `style_interactions.${viewer}.viewerHeading`,
        ),
      ] as const,
  ),
  SOCIAL_STYLE_KEYS,
  "style_interactions.viewerHeading",
);
