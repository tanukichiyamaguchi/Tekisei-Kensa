// プロンプトの版（07 §2.2）。起動時検証（01 §4.3）が AI_PROMPT_VERSION の存在確認に使う。
// M5 で PROMPT_REGISTRY（版 → PromptDefinition）を本ファイルに追加し、そのキー集合をこの配列と一致させる。
export const PROMPT_VERSIONS = ["recruitment-v1"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];

export function isKnownPromptVersion(value: string): value is PromptVersion {
  return (PROMPT_VERSIONS as readonly string[]).includes(value);
}
