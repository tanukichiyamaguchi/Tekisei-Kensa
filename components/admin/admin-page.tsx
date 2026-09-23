// 認証済みページ（M-04〜M-07）の共通処理（06 §1.3）。Server Component から呼ぶ。
// requireAdmin の ApiError を画面の振る舞いに変換する: 401 → ログイン画面へ、403（停止・未登録）→ E-01
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell, type AdminNavKey } from "./AdminShell";
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
 * 認可を通してから本文を描画する。path は 401 のときのログイン後の戻り先（クエリを含む）
 */
export async function renderAdminPage(options: {
  readonly path: string;
  readonly current: AdminNavKey | null;
  readonly render: (ctx: AdminContext, me: MeDto) => Promise<ReactNode> | ReactNode;
}): Promise<ReactNode> {
  const resolved = await resolve();
  // redirect() は例外で遷移するため try の外で呼ぶ
  if (resolved.kind === "login") redirect(loginPath(options.path));
  if (resolved.kind === "unavailable") return <AdminUnavailable />;
  return (
    <AdminShell me={resolved.me} current={options.current}>
      {await options.render(resolved.ctx, resolved.me)}
    </AdminShell>
  );
}
