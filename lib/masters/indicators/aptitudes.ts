import raw from "../data/aptitudes.json";
import type { AptitudeDefinition } from "../types";
import { parseAptitudeDefinitions } from "../validate";

/** 資質 4 型の定義（付録B §4）。APTITUDE_KEYS 順 = 同点時の優先順 */
export const APTITUDE_DEFINITIONS: readonly AptitudeDefinition[] = parseAptitudeDefinitions(raw);
