// 管理画面（ブラウザ）から API を呼ぶ口（06 §10.4）。応答型は 04 §8.2 の Dto を import type で参照する。
// /api/v1/admin/** は adminFetch() を通し、401 はログイン画面へ、403（停止・未登録）は再読み込みで E-01 を描画させる
import type { ComparisonScope } from "@/lib/scoring/types";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import type {
  InviteAcceptedDto,
  InviteRotatedDto,
  MeUpdatedDto,
  PagedDto,
  RespondentUpdatedDto,
  UsageLogItemDto,
} from "@/lib/services/dto/admin";
import type { ComparisonDto } from "@/lib/services/dto/result";

/** 04 §2.4 のエラー応答。未知のコードも落とさないよう code は string で受ける */
export class AdminApiError extends Error {
  override readonly name = "AdminApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface AdminFetchOptions {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  /** false なら 401・403 の画面遷移を行わない（認証系 API。06 §10.4） */
  readonly handleSession?: boolean;
  /** テスト用 */
  readonly fetchImpl?: FetchLike;
  readonly navigate?: SessionNavigator;
}

/** 401・403 の画面遷移（テストで差し替える） */
export interface SessionNavigator {
  readonly toLogin: (next: string) => void;
  readonly reload: () => void;
}

const browserNavigator: SessionNavigator = {
  toLogin: (next) => window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`),
  reload: () => window.location.reload(),
};

function currentPath(): string {
  return typeof window === "undefined"
    ? "/admin"
    : window.location.pathname + window.location.search;
}

async function errorFrom(res: Response): Promise<AdminApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 本文が JSON でない（ゲートウェイのエラーなど）
  }
  const error = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } })
    ?.error;
  return new AdminApiError(
    res.status,
    typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
    typeof error?.message === "string" ? error.message : `HTTP ${res.status}`,
    error?.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {},
  );
}

export async function adminFetch<T>(path: string, options: AdminFetchOptions): Promise<T> {
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(path, {
      method: options.method,
      credentials: "same-origin",
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AdminApiError(0, "NETWORK_ERROR", ADMIN_TEXTS.networkError);
  }
  if (!res.ok) {
    const error = await errorFrom(res);
    if (options.handleSession !== false) {
      const navigate = options.navigate ?? browserNavigator;
      if (error.status === 401 && error.code === "UNAUTHENTICATED") navigate.toLogin(currentPath());
      if (
        error.status === 403 &&
        (error.code === "ADMIN_SUSPENDED" || error.code === "ADMIN_NOT_REGISTERED")
      ) {
        navigate.reload();
      }
    }
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const admin = "/api/v1/admin";

// ---- 認証系（/api/v1 の外。403 → E-01 の変換は行わない）

/** POST /auth/invite（04 §6.3）。パスワードは送らない（06 D06-30） */
export function acceptInvite(input: {
  readonly inviteToken: string;
  readonly name: string;
  readonly email: string;
}): Promise<InviteAcceptedDto> {
  return adminFetch("/auth/invite", { method: "POST", body: input, handleSession: false });
}

/** POST /api/v1/admin/me/login-events（04 §5.1）。失敗は呼び出し側が握りつぶす（06 §3.1） */
export function recordLoginEvent(): Promise<void> {
  return adminFetch(`${admin}/me/login-events`, { method: "POST", handleSession: false });
}

/** DELETE /auth/session（04 §6.2）。応答にかかわらず呼び出し側がログイン画面へ遷移する */
export async function logout(): Promise<void> {
  try {
    await adminFetch("/auth/session", { method: "DELETE", handleSession: false });
  } catch {
    // 失敗しても遷移する（Cookie が残っても次の検証で 401 になる）
  }
}

// ---- 結果詳細・比較

/** GET …/comparison（04 §5.5）。409 POPULATION_EMPTY は AdminApiError のまま投げる */
export function fetchComparison(
  resultId: string,
  scope: ComparisonScope,
  signal?: AbortSignal,
): Promise<ComparisonDto> {
  const query =
    scope.kind === "organization" ? "scope=organization" : `scope=team&teamCode=${scope.teamCode}`;
  return adminFetch(`${admin}/results/${encodeURIComponent(resultId)}/comparison?${query}`, {
    method: "GET",
    signal,
  });
}

// ---- 回答一覧

export function updateRespondent(
  respondentId: string,
  patch: { readonly teamCode?: string | null; readonly isExcluded?: boolean },
): Promise<RespondentUpdatedDto> {
  return adminFetch(`${admin}/respondents/${encodeURIComponent(respondentId)}`, {
    method: "PATCH",
    body: patch,
  });
}

/** 404 RESPONDENT_NOT_FOUND は AdminApiError のまま投げる（06 §3.4.5） */
export function deleteRespondent(respondentId: string): Promise<void> {
  return adminFetch(`${admin}/respondents/${encodeURIComponent(respondentId)}`, {
    method: "DELETE",
  });
}

export function fetchUsageLogs(params: {
  readonly page: number;
  readonly pageSize: number;
}): Promise<PagedDto<UsageLogItemDto>> {
  return adminFetch(`${admin}/usage-logs?page=${params.page}&pageSize=${params.pageSize}`, {
    method: "GET",
  });
}

// ---- アカウント

/** PATCH /api/v1/admin/me（04 §5.1）。reloginRequired が true なら Cookie は削除済み */
export function updateMe(patch: {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly reauthIdToken?: string;
}): Promise<MeUpdatedDto> {
  return adminFetch(`${admin}/me`, { method: "PATCH", body: patch });
}

/** POST /api/v1/admin/organization/invite-token（04 §5.2） */
export function rotateInviteToken(): Promise<InviteRotatedDto> {
  return adminFetch(`${admin}/organization/invite-token`, { method: "POST" });
}
