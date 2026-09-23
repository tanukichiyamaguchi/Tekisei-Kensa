import raw from "../data/risks.json";
import type { RiskDefinition } from "../types";
import { parseRiskDefinitions } from "../validate";

/** リスク 7 項目の定義（付録B §5）。RISK_KEYS 順 */
export const RISK_DEFINITIONS: readonly RiskDefinition[] = parseRiskDefinitions(raw);
