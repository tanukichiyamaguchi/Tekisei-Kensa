"use client";
// M-01 ログインフォーム（06 §3.1）
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { recordLoginEvent } from "@/lib/utils/admin-api";
import { AdminAuthError, establishSession } from "@/lib/utils/admin-auth";

export function LoginForm(props: { readonly next: string; readonly reset: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(props.reset);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    if (showReset) {
      // ?reset=1 はフォーム送信時に取り除く（06 §3.1）
      setShowReset(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("reset");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    try {
      await establishSession(email, password);
    } catch (e) {
      setError(
        e instanceof AdminAuthError && e.reason === "network"
          ? ADMIN_TEXTS.networkError
          : ADMIN_TEXTS.loginFailed,
      );
      setBusy(false);
      return;
    }
    try {
      await recordLoginEvent();
    } catch {
      // 失敗しても遷移を続ける（監査記録の欠落として扱う。04 §5.1）
    }
    window.location.assign(props.next);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {showReset ? (
        <p className="notice" role="status">
          {ADMIN_TEXTS.passwordResetDone}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="login-email">
          メールアドレス
        </label>
        <input
          id="login-email"
          className="field__input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="login-password">
          パスワード
        </label>
        <div className="field__row">
          <input
            id="login-password"
            className="field__input"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "隠す" : "表示"}
          </button>
        </div>
      </div>
      <button
        type="submit"
        className="btn btn--primary btn--block"
        aria-disabled={busy ? "true" : undefined}
      >
        {ADMIN_TEXTS.login}
      </button>
      <div className="auth-card__links">
        <Link href="/admin/password-reset">パスワードを忘れた方</Link>
        <Link href="/admin/signup">アカウント作成（管理者追加用リンクからご登録ください）</Link>
      </div>
    </form>
  );
}
