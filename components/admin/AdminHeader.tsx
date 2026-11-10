"use client";
// ヘッダー（06 §2.3）: 組織名、管理者名、ログアウト。利用履歴は回答一覧の見出しの横から開く（11-2 §2.4。ヘッダーの「利用履歴」
// ボタンは外した）。ヘッダー自体の廃止は 11-8 の PR-7.13a
import { LogoutButton } from "./LogoutButton";

export function AdminHeader(props: {
  readonly organizationName: string;
  readonly adminName: string;
}) {
  return (
    <header className="admin-header">
      <div className="admin-header__org">{props.organizationName}</div>
      <div className="admin-header__actions">
        <span className="admin-header__user">{props.adminName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
