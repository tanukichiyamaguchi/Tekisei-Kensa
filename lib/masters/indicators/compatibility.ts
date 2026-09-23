import raw from "../data/compatibility.json";
import type { CompatibilityDefinition } from "../types";
import { parseCompatibilityDefinitions } from "../validate";

/** 相性 5 軸の定義（付録B §3）。COMPATIBILITY_KEYS 順 */
export const COMPATIBILITY_DEFINITIONS: readonly CompatibilityDefinition[] =
  parseCompatibilityDefinitions(raw);
