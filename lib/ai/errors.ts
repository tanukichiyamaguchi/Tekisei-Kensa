// AI 連携の失敗理由と例外（07 §4.6）。reason の文字列は results.aiGenerationError と 502 の details.reason に載る
export const AI_FAILURE_REASONS = [
  "provider_error", // 5xx / 529 overloaded / 接続エラー（再試行で回復し得る）
  "rate_limited", // 429
  "invalid_request", // 400 / 404 / 422（モデル名の誤り、パラメータ不備。設定の問題）
  "auth_error", // 401 / 403 / 402（API キー・権限・課金）
  "timeout", // タイムアウト・AbortSignal
  "invalid_json", // スキーマ検証失敗（07 §3.4）
  "truncated", // stop_reason = max_tokens
  "refusal", // stop_reason = refusal
  "config_error", // プロンプト版・provider 名の不整合
] as const;
export type AiFailureReason = (typeof AI_FAILURE_REASONS)[number];

export function isAiFailureReason(value: unknown): value is AiFailureReason {
  return typeof value === "string" && (AI_FAILURE_REASONS as readonly string[]).includes(value);
}

/**
 * provider が投げる唯一の例外。message には個人情報（氏名・生テキスト）を含めない（07 §4.8）
 */
export class AiProviderError extends Error {
  override readonly name = "AiProviderError";

  constructor(
    readonly reason: AiFailureReason,
    message: string,
    readonly requestId: string | null = null,
    readonly retryable: boolean = false,
  ) {
    super(message);
  }
}
