// プロンプトの版とレジストリ（07 §2.2）。起動時検証（01 §4.3、lib/utils/env.ts）が AI_PROMPT_VERSION の存在確認に使う
import { AiProviderError } from "@/lib/ai/errors";

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
