// プロンプトの版とレジストリ（07 §2.2、11-6 §3.7.2）。起動時検証（01 §4.3、lib/utils/env.ts）が AI_PROMPT_VERSION の存在確認に使う
import { AiProviderError } from "@/lib/ai/errors";
import type { AiAnalysisKind } from "@/lib/ai/kinds";

import { RECRUITMENT_V1 } from "./recruitment-v1";
import { RECRUITMENT_V2 } from "./recruitment-v2";
import type { PromptDefinition } from "./types";

export type { PromptDefinition } from "./types";

export const PROMPT_VERSIONS = ["recruitment-v1", "recruitment-v2"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];

/** 版 → 定義。キー集合は PROMPT_VERSIONS と型で一致させる */
export const PROMPT_REGISTRY: Readonly<Record<PromptVersion, PromptDefinition>> = {
  "recruitment-v1": RECRUITMENT_V1,
  "recruitment-v2": RECRUITMENT_V2,
};

export function isKnownPromptVersion(value: string): value is PromptVersion {
  return (PROMPT_VERSIONS as readonly string[]).includes(value);
}

/** 未知の版は AiProviderError("config_error")（起動時検証をすり抜けた場合の最後の防御） */
export function getPromptDefinition(version: string): PromptDefinition {
  if (!isKnownPromptVersion(version)) {
    throw new AiProviderError("config_error", `unknown prompt version: ${version}`);
  }
  return PROMPT_REGISTRY[version];
}

/**
 * 種類の版（11-6 §3.7.2）。登録されていない版と、種類の違う版は AiProviderError("config_error")（例外の文は版と種類の名前だけ）。
 * 登録されている版は今は採用向けだけ（育成・定着の training-v1 は PR-7.10、経年比較の longitudinal-v1 は PR-7.11b が足す）
 */
export function getPromptDefinitionForKind(
  kind: AiAnalysisKind,
  version: string,
): PromptDefinition {
  const prompt = getPromptDefinition(version);
  if (prompt.analysisKind !== kind) {
    throw new AiProviderError("config_error", `prompt version ${version} is not for ${kind}`);
  }
  return prompt;
}
