// AI 解説の生成の要求の失敗の分け方と、生成中の読み直しの間隔（11-6 §2.3.4・§2.3.5・§3.7.10）。Client 部品から切り出した純関数

/** 読み直しの間隔と上限（11-6 §2.3.5。上限は 04 D04-34 の滞留判定と同じ 10 分） */
export const AI_POLL_INTERVAL_MS = 3000;
export const AI_POLL_MAX_MS = 10 * 60 * 1000;

/** 生成の要求（POST …/ai-analysis/{kind}）の失敗をどう扱うか（11-6 §2.3.4・§2.3.5） */
export type AiPostFailureAction =
  | { readonly kind: "poll" } // 409 AI_ALREADY_GENERATING → 生成中の表示で読み直す
  | { readonly kind: "failed"; readonly reason: string | null } // 502 → 失敗の枠
  | { readonly kind: "notFound"; readonly message: string } // 404 → 通知とボタンを押せなくする
  | { readonly kind: "check" } // 通信の失敗・ゲートウェイの失敗 → GET で状態を確かめる
  | { readonly kind: "error"; readonly message: string }; // 409 AI_NOT_APPLICABLE・503 AI_KIND_DISABLED・その他 → 通知（状態は変えない）

export function classifyAiPostFailure(error: {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}): AiPostFailureAction {
  if (error.status === 409 && error.code === "AI_ALREADY_GENERATING") return { kind: "poll" };
  if (error.status === 502 && error.code === "AI_GENERATION_FAILED") {
    const reason = error.details.reason;
    return { kind: "failed", reason: typeof reason === "string" ? reason : null };
  }
  if (error.status === 404) return { kind: "notFound", message: error.message };
  // 責任者の受験（409 AI_NOT_APPLICABLE）と有効でない種類（503 AI_KIND_DISABLED）は、応答の文を通知に出す（5xx の確かめより前に分ける）
  if (
    (error.status === 409 && error.code === "AI_NOT_APPLICABLE") ||
    (error.status === 503 && error.code === "AI_KIND_DISABLED")
  ) {
    return { kind: "error", message: error.message };
  }
  // ブラウザの通信断（status 0）と、関数の打ち切り（504 など）を含む 5xx は、サーバ側の状態が分からないため GET で確認する
  if (error.status === 0 || error.status >= 500) return { kind: "check" };
  return { kind: "error", message: error.message };
}

/** 読み直しの上限（10 分）に達したか。達しても generating のままなら T-29 を出す */
export function pollingExpired(elapsedMs: number): boolean {
  return elapsedMs >= AI_POLL_MAX_MS;
}
