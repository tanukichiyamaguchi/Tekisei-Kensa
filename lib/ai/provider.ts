// provider のファクトリ（07 §5.2）。AI_PROVIDER に応じた実装を返し、プロセス内でキャッシュする
import { AiProviderError } from "@/lib/ai/errors";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createStubProvider } from "@/lib/ai/providers/stub";
import type { AiProvider } from "@/lib/ai/types";
import { serverEnv } from "@/lib/utils/env";

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const env = serverEnv();
  switch (env.AI_PROVIDER) {
    case "anthropic": {
      // 起動時検証は AI_PROVIDER=anthropic のとき ANTHROPIC_API_KEY の存在を保証するが、型は string | undefined のまま
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AiProviderError("config_error", "ANTHROPIC_API_KEY is not set");
      cached = createAnthropicProvider({ apiKey });
      break;
    }
    case "stub":
      cached = createStubProvider();
      break;
  }
  return cached;
}

/** テスト用: 差し替え（null で解除し、次の getAiProvider() で環境変数から作り直す） */
export function setAiProviderForTest(provider: AiProvider | null): void {
  cached = provider;
}
