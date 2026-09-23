import raw from "../data/social-styles.json";
import type { SocialStyleDefinition } from "../types";
import { parseSocialStyleDefinitions } from "../validate";

/** 4 分類の定義（sortOrder = 同点優先順、chartOrder = レーダー軸順）。SOCIAL_STYLE_KEYS 順（03 §4.4） */
export const SOCIAL_STYLE_DEFINITIONS: readonly SocialStyleDefinition[] =
  parseSocialStyleDefinitions(raw);
