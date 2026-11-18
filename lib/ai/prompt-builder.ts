// プロンプトの組み立て（07 §2.1、§2.3、11-6 §3.7.3）。純関数（同じ入力で同じ文字列。日時・乱数を含めない。07 §4.4 のキャッシュのため）
import { AiProviderError } from "@/lib/ai/errors";
import {
  formatAptitudeForAi,
  formatAptitudeTypeForAi,
  formatCompatibilityForAi,
  formatReliabilityForAi,
  formatRiskForAi,
  formatSocialStyleForAi,
  formatTraitForAi,
} from "@/lib/ai/input";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { getPromptDefinitionForKind } from "@/lib/ai/prompts";
import type { AiAnalysisInput, AiInputByKind } from "@/lib/ai/types";

export interface BuiltMessages {
  readonly system: string; // PromptDefinition.system
  readonly user: string; // テンプレートに値を埋めたもの
}

const PLACEHOLDER = /\{\{([A-Za-z_.]+)\}\}/g;

function entriesOf<K extends string>(
  prefix: string,
  scores: Readonly<Record<K, number>>,
  format: (value: number) => string,
): [string, string][] {
  return (Object.entries(scores) as [K, number][]).map(([key, value]) => [
    `${prefix}.${key}`,
    format(value),
  ]);
}

/** プレースホルダ名 → 埋め込む文字列 */
export function placeholderValues(input: AiAnalysisInput): ReadonlyMap<string, string> {
  const { result } = input;
  return new Map<string, string>([
    ["name", input.respondentName.trim()],
    ["occupation", input.occupationLabel],
    ["reliability", formatReliabilityForAi(result.reliability)],
    ["aptitudeType", formatAptitudeTypeForAi(result.aptitudeType)],
    ...entriesOf("trait", result.traits, formatTraitForAi),
    ...entriesOf("socialStyle", result.socialStyles, formatSocialStyleForAi),
    ...entriesOf("aptitude", result.aptitudes, formatAptitudeForAi),
    ...entriesOf("compatibility", result.compatibility, formatCompatibilityForAi),
    ...entriesOf("risk", result.risks, formatRiskForAi),
  ]);
}

/** テンプレートの {{…}} を置換する。1 回の走査で置換するため、値に {{ が含まれても再展開しない */
export function fillTemplate(template: string, values: ReadonlyMap<string, string>): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values.get(name);
    if (value === undefined) {
      throw new AiProviderError("config_error", `unknown placeholder: ${name}`);
    }
    return value;
  });
}

/**
 * 種類の版の system と user（11-6 §3.7.3）。版は getPromptDefinitionForKind で引く（登録されていない版・種類の違う版は
 * config_error）。PR-7.9 は採用向けだけで、ほかの種類は config_error（育成・定着の 8 項目の差し込みは PR-7.10、経年比較の
 * {{prompt}} は PR-7.11b が足す）
 */
export function buildMessages<K extends AiAnalysisKind>(
  kind: K,
  input: AiInputByKind[K],
  promptVersion: string,
): BuiltMessages {
  const prompt = getPromptDefinitionForKind(kind, promptVersion);
  if (kind !== "recruitment") {
    throw new AiProviderError("config_error", `no prompt builder for ${kind}`);
  }
  return {
    system: prompt.system,
    // kind が recruitment なので入力は採用向けの形（型の引数 K は比較では絞られない）
    user: fillTemplate(prompt.userTemplate, placeholderValues(input as AiAnalysisInput)),
  };
}
