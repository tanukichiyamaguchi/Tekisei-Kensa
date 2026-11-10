// 管理画面の URL の組み立て・検証（06 §1.3）。純関数。回答一覧の絞り込みの状態は URL に持たない（11-2 §2.21。result-list-view.ts）

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
