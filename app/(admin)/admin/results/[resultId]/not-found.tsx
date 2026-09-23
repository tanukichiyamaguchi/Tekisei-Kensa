// E-02 見つからない・権限なし（06 §1.1、§1.3）。他組織・削除済み・admin に対する幹部を区別しない
import Link from "next/link";

import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export default function ResultNotFound() {
  return (
    <main className="admin-unavailable">
      <p role="alert">{ADMIN_TEXTS.resultNotFound}</p>
      <Link href="/admin" className="btn">
        {ADMIN_TEXTS.backToResults}
      </Link>
    </main>
  );
}
