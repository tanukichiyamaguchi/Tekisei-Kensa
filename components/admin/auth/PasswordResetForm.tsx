"use client";
// M-03 パスワード再設定（06 §3.3）。oobCode が無ければ送信依頼、mode=resetPassword と oobCode があれば新パスワード入力
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { passwordProblem } from "@/lib/presentation/form-errors";
import { recordLoginEvent } from "@/lib/utils/admin-api";
import {
  AdminAuthError,
  completePasswordReset,
  establishSession,
  requestPasswordReset,
  verifyResetCode,
} from "@/lib/utils/admin-auth";

export function PasswordResetForm(props: { readonly oobCode: string | null }) {
  const [codeState, setCodeState] = useState<
    | { readonly kind: "none" }
    | { readonly kind: "verifying" }
    | { readonly kind: "valid"; readonly email: string }
    | { readonly kind: "invalid" }
  >(props.oobCode ? { kind: "verifying" } : { kind: "none" });

  useEffect(() => {
    if (!props.oobCode) return;
    let cancelled = false;
    verifyResetCode(props.oobCode)
      .then((email) => !cancelled && setCodeState({ kind: "valid", email }))
      .catch(() => !cancelled && setCodeState({ kind: "invalid" }));
    return () => {
      cancelled = true;
    };
  }, [props.oobCode]);

  if (codeState.kind === "verifying") return <p>確認しています…</p>;
  if (codeState.kind === "valid" && props.oobCode) {
    return <NewPasswordForm oobCode={props.oobCode} email={codeState.email} />;
  }
  return <RequestResetForm invalidLink={codeState.kind === "invalid"} />;
}

function RequestResetForm(props: { readonly invalidLink: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch {
      setError(ADMIN_TEXTS.networkError);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <p className="notice" role="status">
          {ADMIN_TEXTS.resetMailSent}
        </p>
        <Link href="/admin/login">ログイン画面へ</Link>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      {props.invalidLink ? (
        <p className="notice notice--error" role="alert">
          {ADMIN_TEXTS.resetLinkInvalid}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <p>登録済みのメールアドレスを入力してください。パスワード設定用のリンクをお送りします。</p>
      <div className="field">
        <label className="field__label" htmlFor="reset-email">
          メールアドレス
        </label>
        <input
          id="reset-email"
          className="field__input"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="btn btn--primary btn--block"
        aria-disabled={busy ? "true" : undefined}
      >
        送信する
      </button>
      <div className="auth-card__links">
        <Link href="/admin/login">ログイン画面へ戻る</Link>
      </div>
    </form>
  );
}

function NewPasswordForm(props: { readonly oobCode: string; readonly email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("確認用のパスワードが一致しません");
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(props.oobCode, password);
    } catch (e) {
      setBusy(false);
      if (e instanceof AdminAuthError && e.reason === "weak_password") {
        setError("このパスワードは使用できません。別のパスワードを入力してください");
      } else if (e instanceof AdminAuthError && e.reason === "network") {
        setError(ADMIN_TEXTS.networkError);
      } else {
        setError(ADMIN_TEXTS.resetLinkInvalid);
      }
      return;
    }
    setDone(true);
    try {
      await establishSession(props.email, password);
    } catch {
      window.location.assign("/admin/login?reset=1");
      return;
    }
    try {
      await recordLoginEvent();
    } catch {
      // 失敗しても遷移を続ける（04 §5.1）
    }
    window.location.assign("/admin");
  }

  if (done) {
    return (
      <p className="notice" role="status">
        パスワードを変更しました
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <p>{props.email} の新しいパスワードを設定します（8〜72 文字、英字と数字を含む）。</p>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="new-password">
          新しいパスワード
        </label>
        <input
          id="new-password"
          className="field__input"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="new-password-confirm">
          新しいパスワード（確認）
        </label>
        <input
          id="new-password-confirm"
          className="field__input"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="btn btn--primary btn--block"
        aria-disabled={busy ? "true" : undefined}
      >
        パスワードを設定する
      </button>
    </form>
  );
}
