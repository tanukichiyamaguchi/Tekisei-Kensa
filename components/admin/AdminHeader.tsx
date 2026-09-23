"use client";
// ヘッダー（06 §2.3）: 組織名、利用履歴ボタン（P-01）、管理者名、ログアウト
import { useState } from "react";

import { LogoutButton } from "./LogoutButton";
import { UsageLogDialog } from "./UsageLogDialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export function AdminHeader(props: {
  readonly organizationName: string;
  readonly adminName: string;
}) {
  const [usageOpen, setUsageOpen] = useState(false);
  return (
    <header className="admin-header">
      <div className="admin-header__org">{props.organizationName}</div>
      <div className="admin-header__actions">
        <button type="button" className="btn" onClick={() => setUsageOpen(true)}>
          {ADMIN_TEXTS.usageLogs}
        </button>
        <span className="admin-header__user">{props.adminName}</span>
        <LogoutButton />
      </div>
      <UsageLogDialog open={usageOpen} onClose={() => setUsageOpen(false)} />
    </header>
  );
}
