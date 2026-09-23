// E-01 利用不可（06 §1.3）。サイドメニュー・ヘッダーは出さず、T-15 と「ログアウト」だけを置く
import { LogoutButton } from "./LogoutButton";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export function AdminUnavailable() {
  return (
    <main className="admin-unavailable">
      <p role="alert">{ADMIN_TEXTS.accountUnavailable}</p>
      <LogoutButton />
    </main>
  );
}
