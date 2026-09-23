// AI 解説セクションの画面状態の判定（06 §3.5.9）。Client 部品から切り出した純関数
import type { AiAnalysisDto } from "@/lib/services/dto/result";

/** ポーリング間隔と上限（06 §3.5.9。上限は 04 D04-34 の滞留判定と同じ 10 分） */
export const AI_POLL_INTERVAL_MS = 3000;
export const AI_POLL_MAX_MS = 10 * 60 * 1000;

export type AiAnalysisState = Omit<AiAnalysisDto, "resultId">;

/** POST の失敗をどう扱うか（06 §3.5.9「POST の応答・失敗ごとの扱い」） */
export type AiPostFailureAction =
  | { readonly kind: "poll" } // 409 AI_ALREADY_GENERATING → 生成中表示でポーリング
  | { readonly kind: "limit"; readonly message: string } // 429 → 文言を出しボタンを無効化
  | { readonly kind: "failed"; readonly reason: string | null } // 502 → failed 表示
  | { readonly kind: "notFound"; readonly message: string } // 404 → Toast とボタン無効化
  | { readonly kind: "check" } // 通信断・ゲートウェイの失敗 → GET で状態を確認
  | { readonly kind: "error"; readonly message: string }; // その他 → Toast

export function classifyAiPostFailure(error: {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}): AiPostFailureAction {
  if (error.status === 409 && error.code === "AI_ALREADY_GENERATING") return { kind: "poll" };
  if (error.status === 429 && error.code === "AI_DAILY_LIMIT_EXCEEDED") {
    return { kind: "limit", message: error.message };
  }
  if (error.status === 502 && error.code === "AI_GENERATION_FAILED") {
    const reason = error.details.reason;
    return { kind: "failed", reason: typeof reason === "string" ? reason : null };
  }
  if (error.status === 404) return { kind: "notFound", message: error.message };
  // ブラウザの通信断（status 0）と、関数の打ち切り（504 など）を含む 5xx は、サーバ側の状態が分からないため GET で確認する
  if (error.status === 0 || error.status >= 500) return { kind: "check" };
  return { kind: "error", message: error.message };
}

/** ポーリングの上限（10 分）に達したか。達しても generating のままなら T-29 を出す */
export function pollingExpired(elapsedMs: number): boolean {
  return elapsedMs >= AI_POLL_MAX_MS;
}
