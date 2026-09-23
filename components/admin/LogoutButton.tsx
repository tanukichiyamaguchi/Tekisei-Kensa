"use client";
// ログアウト（DELETE /auth/session → /admin/login。06 §3.7、§10.4）
import { useState } from "react";

import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { logout } from "@/lib/utils/admin-api";

export function LogoutButton({ className = "btn" }: { readonly className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-disabled={busy ? "true" : undefined}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        await logout();
        window.location.assign("/admin/login");
      }}
    >
      {ADMIN_TEXTS.logout}
    </button>
  );
}
