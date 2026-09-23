// サイドメニュー・ヘッダー・本文コンテナ（06 §2.3、§2.4）。認証済みページが requireAdmin の後に使う
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminHeader } from "./AdminHeader";
import { ToastProvider } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import type { MeDto } from "@/lib/services/dto/admin";

export type AdminNavKey = "results" | "classification" | "account";

const NAV: ReadonlyArray<{ readonly key: AdminNavKey; readonly href: string }> = [
  { key: "results", href: "/admin" },
  { key: "classification", href: "/admin/classification" },
  { key: "account", href: "/admin/account" },
];

export function AdminShell(props: {
  readonly me: MeDto;
  readonly current: AdminNavKey | null;
  readonly children: ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <nav className="admin-sidebar__nav" aria-label="メインメニュー">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="admin-sidebar__link"
                aria-current={props.current === item.key ? "page" : undefined}
              >
                {ADMIN_TEXTS.nav[item.key]}
              </Link>
            ))}
          </nav>
          <div className="admin-sidebar__site">{ADMIN_TEXTS.appTitle}</div>
        </aside>
        <div className="admin-main">
          <AdminHeader organizationName={props.me.organization.name} adminName={props.me.name} />
          <main className="admin-content">{props.children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
