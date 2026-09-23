// 受検者画面（ブラウザ）から受検者 API を呼ぶ口（05 §7.1）。型は 04 の定義を import type で参照し、独自に定義しない（D05-33）
import type {
  AnswersSavedDto,
  SessionCreatedDto,
  SessionProgressDto,
  SessionStartedDto,
  SessionSubmittedDto,
} from "@/lib/services/dto/respondent";
import type { ApiErrorCode } from "@/lib/services/errors";
import type { RegisterRespondentInput, SaveAnswersInput } from "@/lib/services/schemas/respondent";

export const RESPONDENT_API_TIMEOUT_MS = 30_000;

/** 非 2xx 応答（{ error: { code, message, details } }）と通信断・タイムアウト・オフライン */
export class RespondentApiError extends Error {
  override readonly name = "RespondentApiError";
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "NETWORK_ERROR" | "TIMEOUT" | "OFFLINE",
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface RequestOptions {
  readonly method: "GET" | "POST" | "PUT";
  readonly body?: unknown;
  /** テスト用 */
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function errorFrom(res: Response): Promise<RespondentApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 本文が JSON でない（ゲートウェイのエラーなど）
  }
  const error = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } })
    ?.error;
  const code = typeof error?.code === "string" ? (error.code as ApiErrorCode) : "INTERNAL_ERROR";
  const details =
    error?.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  return new RespondentApiError(
    res.status,
    code,
    typeof error?.message === "string" ? error.message : `HTTP ${res.status}`,
    details,
  );
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  if (isOffline()) throw new RespondentApiError(0, "OFFLINE", "offline");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? RESPONDENT_API_TIMEOUT_MS,
  );
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(path, {
      method: options.method,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      ...(options.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }),
    });
  } catch {
    throw controller.signal.aborted
      ? new RespondentApiError(0, "TIMEOUT", "timeout")
      : new RespondentApiError(0, "NETWORK_ERROR", "network error");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

const base = "/api/v1/respondent";
const sessionPath = (sessionId: string) => `${base}/sessions/${encodeURIComponent(sessionId)}`;

type Extra = Pick<RequestOptions, "fetchImpl" | "timeoutMs">;

export function createSession(
  input: RegisterRespondentInput,
  extra: Extra = {},
): Promise<SessionCreatedDto> {
  return request(`${base}/sessions`, { method: "POST", body: input, ...extra });
}

export function startSession(sessionId: string, extra: Extra = {}): Promise<SessionStartedDto> {
  return request(`${sessionPath(sessionId)}/start`, { method: "POST", ...extra });
}

export function getSession(sessionId: string, extra: Extra = {}): Promise<SessionProgressDto> {
  return request(sessionPath(sessionId), { method: "GET", ...extra });
}

export function saveAnswers(
  sessionId: string,
  input: SaveAnswersInput,
  extra: Extra = {},
): Promise<AnswersSavedDto> {
  return request(`${sessionPath(sessionId)}/answers`, { method: "PUT", body: input, ...extra });
}

export function submitSession(sessionId: string, extra: Extra = {}): Promise<SessionSubmittedDto> {
  return request(`${sessionPath(sessionId)}/submit`, { method: "POST", ...extra });
}

/** SessionProgressDto.answers（配列）→ 画面で引きやすい Map（04 §4.3） */
export function toAnswerMap(answers: SessionProgressDto["answers"]): ReadonlyMap<number, number> {
  return new Map(answers.map((a) => [a.questionNo, a.choiceCode]));
}
