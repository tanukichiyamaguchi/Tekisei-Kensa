// プロンプトの組み立て（07 §2.1、§2.3）。純関数（同じ入力で同じ文字列。日時・乱数を含めない。07 §4.4 のキャッシュのため）
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
import { getPromptDefinition } from "@/lib/ai/prompts";
import type { AiAnalysisInput } from "@/lib/ai/types";

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

export function buildMessages(input: AiAnalysisInput, promptVersion: string): BuiltMessages {
  const prompt = getPromptDefinition(promptVersion);
  return {
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, placeholderValues(input)),
  };
}
