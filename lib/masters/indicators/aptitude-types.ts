import raw from "../data/aptitude-types.json";
import type { AptitudeTypeDefinition } from "../types";
import { parseAptitudeTypeDefinitions } from "../validate";

/** 適性タイプ 16 種の定義（付録B §6）。APTITUDE_TYPE_KEYS 順 = 同点時の優先順 */
export const APTITUDE_TYPE_DEFINITIONS: readonly AptitudeTypeDefinition[] =
  parseAptitudeTypeDefinitions(raw);
