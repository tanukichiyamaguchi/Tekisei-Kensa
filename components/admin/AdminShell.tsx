// サイドメニュー・ヘッダー・本文コンテナ（06 §2.3、§2.4）。認証済みページが requireAdmin の後に使う。
// サイドメニューは 回答一覧・組織内分類・在籍・退職・アカウント（10 K-38。在籍・退職は 3 番目で全管理者に出す。11-3 §2.1）。
// 見た目・アイコン・狭い幅は 11-8 の PR-7.13a が lib/presentation/admin-navigation.ts の ADMIN_NAV_ITEMS に移すときに作る。
// 枠の種類 frame: "default"（標準）と "detail"（結果詳細。11-4 §2.1・§3.6、11-8 §2.1.2）。"detail" はサイドメニュー・共通ヘッダー
// （組織名・管理者名・ログアウト）を描かず、ToastProvider と、余白を付けない本文の入れ物（main。クラスなし）と本文だけを描く（結果詳細の
// 枠 #rd は 11-4 の部品が描き、画面に固定するので main は見た目に関わらない。通知の領域は ToastProvider が main の外に描く）。読み込み中の
// 表示とお知らせは、PR-7.13a・PR-7.16 がどちらの枠にも出す（11-8 §2.1.2）
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminHeader } from "./AdminHeader";
import { ToastProvider } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import type { MeDto } from "@/lib/services/dto/admin";

export type AdminNavKey = "results" | "classification" | "employment" | "account";

/** 枠の種類（11-8 §2.1.2）。"detail" は結果詳細の全画面の枠（11-4 §2.1） */
export type AdminFrame = "default" | "detail";

const NAV: ReadonlyArray<{ readonly key: AdminNavKey; readonly href: string }> = [
  { key: "results", href: "/admin" },
  { key: "classification", href: "/admin/classification" },
  { key: "employment", href: "/admin/employment" },
  { key: "account", href: "/admin/account" },
];

export function AdminShell(props: {
  readonly me: MeDto;
  /** サイドメニューで選ばれている項目（"detail" の枠では使わない） */
  readonly current: AdminNavKey | null;
  /** 枠の種類（省くと "default"） */
  readonly frame?: AdminFrame;
  readonly children: ReactNode;
}) {
  if (props.frame === "detail") {
    return (
      <ToastProvider>
        <main>{props.children}</main>
      </ToastProvider>
    );
  }
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
