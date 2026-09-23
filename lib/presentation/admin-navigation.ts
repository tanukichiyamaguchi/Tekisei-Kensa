// 管理画面の URL の組み立て・検証（06 §1.3、§3.4.3）。純関数
import type { ListResultsQuery } from "@/lib/services/schemas/admin-results";

/** ログイン後の遷移先。/admin で始まるパスだけを許可する（オープンリダイレクト防止。06 §1.3） */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin")) return "/admin";
  // //example.com や /admin\… のようなブラウザが別オリジンと解釈し得る形を拒否する
  if (next.startsWith("//") || next.includes("\\")) return "/admin";
  let url: URL;
  try {
    url = new URL(next, "http://localhost");
  } catch {
    return "/admin";
  }
  if (url.origin !== "http://localhost") return "/admin";
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return "/admin";
  // 認証画面自身には戻さない
  if (/^\/admin\/(login|signup|password-reset)(\/|$)/.test(url.pathname)) return "/admin";
  return url.pathname + url.search;
}

export function loginPath(next?: string): string {
  return next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login";
}

/** 回答一覧の URL クエリで画面が使う項目（06 §3.4.3。excluded・teamCode 以外の sort は使わない） */
export type ResultListUrlState = Pick<
  ListResultsQuery,
  "q" | "kind" | "teamCode" | "sort" | "order" | "page" | "pageSize"
>;

const DEFAULT_PAGE_SIZE = 50;

/** 既定値（submittedAt desc、page 1、pageSize 50）は URL に出さない */
export function resultListHref(state: Partial<ResultListUrlState>): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.kind) params.set("kind", state.kind);
  if (state.teamCode) params.set("teamCode", state.teamCode);
  const sort = state.sort ?? "submittedAt";
  const order = state.order ?? (sort === "submittedAt" ? "desc" : "asc");
  if (sort !== "submittedAt" || order !== "desc") {
    params.set("sort", sort);
    params.set("order", order);
  }
  if (state.page && state.page > 1) params.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  }
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export function hasResultFilters(state: Partial<ResultListUrlState>): boolean {
  return Boolean(state.q || state.kind || state.teamCode);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
