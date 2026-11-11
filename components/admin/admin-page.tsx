// 認証済みページ（M-04〜M-08）の共通処理（06 §1.3）。Server Component から呼ぶ。
// requireAdmin の ApiError を画面の振る舞いに変換する: 401 → ログイン画面へ、403（停止・未登録）→ E-01
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell, type AdminFrame, type AdminNavKey } from "./AdminShell";
import { AdminUnavailable } from "./AdminUnavailable";
import { requireAdminFromCookies, type AdminContext } from "@/lib/auth/admin-context";
import { loginPath } from "@/lib/presentation/admin-navigation";
import { getMe } from "@/lib/services/admin-account";
import type { MeDto } from "@/lib/services/dto/admin";
import { ApiError } from "@/lib/services/errors";

type Resolved =
  | { readonly kind: "ok"; readonly ctx: AdminContext; readonly me: MeDto }
  | { readonly kind: "login" }
  | { readonly kind: "unavailable" };

async function resolve(): Promise<Resolved> {
  try {
    const ctx = await requireAdminFromCookies();
    return { kind: "ok", ctx, me: await getMe(ctx) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { kind: "login" };
    if (
      error instanceof ApiError &&
      (error.code === "ADMIN_SUSPENDED" || error.code === "ADMIN_NOT_REGISTERED")
    ) {
      return { kind: "unavailable" };
    }
    throw error;
  }
}

/**
 * 認可を通してから本文を描画する。path は 401 のときのログイン後の戻り先（クエリを含む）。
 * frame は枠の種類（省くと "default"。結果詳細は "detail" でサイドメニューと共通ヘッダーを描かない。11-4 §2.1・§3.6、11-8 §2.1.2）
 */
export async function renderAdminPage(options: {
  readonly path: string;
  readonly current: AdminNavKey | null;
  readonly frame?: AdminFrame;
  readonly render: (ctx: AdminContext, me: MeDto) => Promise<ReactNode> | ReactNode;
}): Promise<ReactNode> {
  const resolved = await resolve();
  // redirect() は例外で遷移するため try の外で呼ぶ
  if (resolved.kind === "login") redirect(loginPath(options.path));
  if (resolved.kind === "unavailable") return <AdminUnavailable />;
  return (
    <AdminShell me={resolved.me} current={options.current} frame={options.frame ?? "default"}>
      {await options.render(resolved.ctx, resolved.me)}
    </AdminShell>
  );
}
