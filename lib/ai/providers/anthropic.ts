// Anthropic（Claude API）provider（07 §4、§5.3、11-6 §2.9・§3.7.3）。構造化出力（output_config.format）で種類の JSON を強制する
// （07 D07-06）。出力の上限は種類ごと（AI_MAX_TOKENS。K-25）。採用向けと育成・定着を生成する（経年比較は版とスキーマが無く
// config_error。PR-7.11b が足す）
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { AiProviderError } from "@/lib/ai/errors";
import { AI_ANALYSIS_KINDS, AI_MAX_TOKENS, type AiAnalysisKind } from "@/lib/ai/kinds";
import { buildMessages } from "@/lib/ai/prompt-builder";
import { getPromptDefinitionForKind } from "@/lib/ai/prompts";
import { AI_OUTPUT_SCHEMAS, parseAiOutputText } from "@/lib/ai/schema";
import type {
  AiGenerateResult,
  AiInputByKind,
  AiOutputByKind,
  AiProvider,
  GenerateOptions,
} from "@/lib/ai/types";

export const ANTHROPIC_REQUEST_TIMEOUT_MS = 240_000; // 07 §4.2（04 D04-38）
export const ANTHROPIC_MAX_RETRIES = 1; // 07 §4.2、§4.5

/** 種類ごとの output_config.format（11-6 §3.7.3）。モジュールを読み込んだときに種類ごとに 1 回だけ作り、要求ごとに使い回す */
const OUTPUT_FORMATS = new Map(
  AI_ANALYSIS_KINDS.flatMap((kind) => {
    const schema = AI_OUTPUT_SCHEMAS[kind];
    return schema === undefined ? [] : [[kind, zodOutputFormat(schema)] as const];
  }),
);

export interface AnthropicProviderConfig {
  readonly apiKey: string;
  /** 単体テスト用（U-16）: SDK の fetch を差し替える */
  readonly fetch?: typeof fetch;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}

/** API が返したエラー本文の message（例: 「model: …」）。入力の本文は含まれないため、原因調査用にログへ出す（300 文字まで） */
function apiErrorMessage(error: InstanceType<typeof Anthropic.APIError>): string | null {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === "string" ? message.slice(0, 300) : null;
}

/**
 * SDK の例外を AiProviderError に変換する（07 §4.6 の表。具体的なものから順に instanceof で判定）。
 * メッセージには例外クラス名・HTTP ステータス・error.type と、API のエラー本文の message だけを載せる
 * （個人情報を連結しない。07 §4.8）
 */
export function toAiProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.APIError) {
    const requestId = error.requestID ?? null;
    const apiMessage = apiErrorMessage(error);
    const detail = `${error.constructor.name} status=${String(error.status)} type=${String(error.type)}${apiMessage ? ` message=${apiMessage}` : ""}`;
    const make = (reason: AiProviderError["reason"], retryable: boolean) =>
      new AiProviderError(reason, `anthropic: ${detail}`, requestId, retryable);

    if (error instanceof Anthropic.RateLimitError) return make("rate_limited", true);
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return make("auth_error", false);
    }
    if (
      error instanceof Anthropic.NotFoundError ||
      error instanceof Anthropic.BadRequestError ||
      error instanceof Anthropic.UnprocessableEntityError
    ) {
      return make("invalid_request", false);
    }
    if (error instanceof Anthropic.InternalServerError) return make("provider_error", true);
    if (error instanceof Anthropic.APIConnectionTimeoutError) return make("timeout", true);
    if (error instanceof Anthropic.APIConnectionError) {
      return make(/timed? ?out/i.test(error.message) ? "timeout" : "provider_error", true);
    }
    // AbortSignal による中断（SDK は APIUserAbortError に包む。APIError のサブクラスのため汎用の判定より前）
    if (error instanceof Anthropic.APIUserAbortError) return make("timeout", true);
    // 402 billing_error: TypeScript SDK に専用クラスが無いため status / type で判定。再試行で回復しない（07 §4.6）
    if (error.status === 402 || error.type === "billing_error") return make("auth_error", false);
    return make("provider_error", true);
  }
  if (isAbortError(error)) {
    return new AiProviderError("timeout", "anthropic: request aborted", null, true);
  }
  const name = error instanceof Error ? error.constructor.name : typeof error;
  return new AiProviderError("provider_error", `anthropic: unexpected ${name}`, null, false);
}

export function createAnthropicProvider(config: AnthropicProviderConfig): AiProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    name: "anthropic",
    async generate<K extends AiAnalysisKind>(
      kind: K,
      input: AiInputByKind[K],
      options: GenerateOptions,
    ): Promise<AiGenerateResult<K>> {
      if (options.signal.aborted) {
        throw new AiProviderError("timeout", "anthropic: request aborted", null, true);
      }
      // 種類の違う版・登録されていない版・スキーマの無い種類は、API を呼ばずに config_error（11-6 §3.7.3）
      const prompt = getPromptDefinitionForKind(kind, options.promptVersion);
      const format = OUTPUT_FORMATS.get(kind);
      if (format === undefined) {
        throw new AiProviderError("config_error", `anthropic: no output schema for ${kind}`);
      }
      const messages = buildMessages(kind, input, options.promptVersion);

      // messages.parse() は create() の後で応答本文を解析し、失敗すると stop_reason を見る前に例外を投げる（SDK 0.128 の実装）。
      // 07 §3.4 の判定順（refusal → max_tokens → スキーマ検証）を守るため、create() に同じ format を渡し、解析は自前で行う
      let response: Anthropic.Message & { readonly _request_id?: string | null };
      try {
        response = await client.messages.create(
          {
            model: options.model,
            max_tokens: AI_MAX_TOKENS[kind],
            // 思考内容は表示・保存しない（07 §4.2）
            thinking: { type: "adaptive", display: "omitted" },
            output_config: { effort: "high", format },
            system: [{ type: "text", text: messages.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: messages.user }],
          },
          {
            timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
            maxRetries: ANTHROPIC_MAX_RETRIES,
            signal: options.signal,
          },
        );
      } catch (error) {
        throw toAiProviderError(error);
      }

      const requestId = response._request_id ?? null;
      if (response.stop_reason === "refusal") {
        throw new AiProviderError("refusal", "anthropic: model refused", requestId, false);
      }
      if (response.stop_reason === "max_tokens") {
        throw new AiProviderError("truncated", "anthropic: max_tokens reached", requestId, false);
      }

      // 思考ブロック（type: "thinking"）は無視し、text ブロックだけを結合する（07 §5.3）
      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let output: AiOutputByKind[K];
      try {
        output = parseAiOutputText(kind, rawText);
      } catch (error) {
        const reason = error instanceof AiProviderError ? error.message : "invalid_json";
        throw new AiProviderError("invalid_json", `anthropic: ${reason}`, requestId, false);
      }

      return {
        output,
        rawText,
        model: response.model,
        promptVersion: prompt.version,
        analysisKind: kind,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
        stopReason: response.stop_reason,
        requestId,
      };
    },
  };
}
