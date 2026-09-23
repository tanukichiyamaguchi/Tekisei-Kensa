// Preview の Deployment Protection を印刷用ページの取得だけ通過させるヘッダー（07 §9.13、D07-23）。
// 本番など変数が無い環境では空のヘッダー集合を返す
import { type ServerEnv, serverEnv } from "@/lib/utils/env";

export function protectionBypassHeaders(
  env: Pick<ServerEnv, "VERCEL_AUTOMATION_BYPASS_SECRET"> = serverEnv(),
): Record<string, string> {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}
