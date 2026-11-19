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
import type { AiAnalysisInput, AiInputByKind, TrainingAiInput } from "@/lib/ai/types";
import { TRAINING_CONTEXT_KEYS, trainingContextLabel } from "@/lib/masters/training-context";

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

/** 採用向けの差し込み（40 個。氏名・職種・信頼係数・適性タイプと、16 尺度・4 スタイル・4 資質・5 相性・7 リスク） */
function scoreEntries(input: AiAnalysisInput): [string, string][] {
  const { result } = input;
  return [
    ["name", input.respondentName.trim()],
    ["occupation", input.occupationLabel],
    ["reliability", formatReliabilityForAi(result.reliability)],
    ["aptitudeType", formatAptitudeTypeForAi(result.aptitudeType)],
    ...entriesOf("trait", result.traits, formatTraitForAi),
    ...entriesOf("socialStyle", result.socialStyles, formatSocialStyleForAi),
    ...entriesOf("aptitude", result.aptitudes, formatAptitudeForAi),
    ...entriesOf("compatibility", result.compatibility, formatCompatibilityForAi),
    ...entriesOf("risk", result.risks, formatRiskForAi),
  ];
}

/**
 * 種類のプレースホルダ名 → 埋め込む文字列（07 §2.3、11-6 §2.7.5）。採用向けは 40 個。育成・定着は、採用向けと同じ値に 8 項目の
 * 表示名（context.tenure〜context.concern。lib/masters/training-context.ts）を足した 48 個。経年比較（{{prompt}}）は PR-7.11b
 * （それまでは config_error）
 */
export function placeholderValues<K extends AiAnalysisKind>(
  kind: K,
  input: AiInputByKind[K],
): ReadonlyMap<string, string> {
  switch (kind) {
    case "recruitment":
      // kind が recruitment なので入力は採用向けの形（型の引数 K は比較では絞られない）
      return new Map(scoreEntries(input as AiAnalysisInput));
    case "training": {
      // kind が training なので入力は育成・定着の形（8 項目のコードを持つ）
      const { context } = input as TrainingAiInput;
      return new Map([
        ...scoreEntries(input as TrainingAiInput),
        ...TRAINING_CONTEXT_KEYS.map((key): [string, string] => [
          `context.${key}`,
          trainingContextLabel(key, context[key]),
        ]),
      ]);
    }
    default:
      throw new AiProviderError("config_error", `no placeholders for ${kind}`);
  }
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
 * config_error）。採用向けと育成・定着を組み立てる。経年比較は config_error（{{prompt}} の差し込みは PR-7.11b が足す）
 */
export function buildMessages<K extends AiAnalysisKind>(
  kind: K,
  input: AiInputByKind[K],
  promptVersion: string,
): BuiltMessages {
  const prompt = getPromptDefinitionForKind(kind, promptVersion);
  if (kind === "longitudinal") {
    throw new AiProviderError("config_error", `no prompt builder for ${kind}`);
  }
  return {
    system: prompt.system,
    user: fillTemplate(prompt.userTemplate, placeholderValues(kind, input)),
  };
}
