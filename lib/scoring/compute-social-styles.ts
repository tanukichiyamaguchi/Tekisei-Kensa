import { SOCIAL_STYLE_KEYS } from "./types";
import type { AptitudeTypeScores, SocialStyleKey, SocialStyleScores } from "./types";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";

/** ソーシャルスタイル 4 値（付録B §7、03 §5.7）: 所属 4 タイプの得点の最大値 ÷ 2。クランプしない */
export function computeSocialStyles(typeScores: AptitudeTypeScores): SocialStyleScores {
  const out = {} as Record<SocialStyleKey, number>;
  for (const style of SOCIAL_STYLE_KEYS) {
    const members = APTITUDE_TYPE_DEFINITIONS.filter((t) => t.socialStyle === style);
    out[style] = Math.max(...members.map((t) => typeScores[t.key])) / 2;
  }
  return Object.freeze(out);
}
