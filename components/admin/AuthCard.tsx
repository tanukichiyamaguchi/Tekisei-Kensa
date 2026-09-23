// M-01〜M-03 の中央カード（06 §2.3、§2.4）
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export function AuthCard(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <ToastProvider>
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="auth-card-title">
          <p className="auth-card__site">{ADMIN_TEXTS.appTitle}</p>
          <h1 id="auth-card-title">{props.title}</h1>
          {props.children}
        </section>
      </main>
    </ToastProvider>
  );
}
