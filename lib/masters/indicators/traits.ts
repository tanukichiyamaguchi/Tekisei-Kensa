import raw from "../data/traits.json";
import type { TraitDefinition } from "../types";
import { parseTraitDefinitions } from "../validate";

/** 16 尺度の定義（付録B §2）。TRAIT_KEYS 順 */
export const TRAIT_DEFINITIONS: readonly TraitDefinition[] = parseTraitDefinitions(raw);
