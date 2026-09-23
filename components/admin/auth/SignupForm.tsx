"use client";
// M-02 管理者サインアップ（06 §3.2）。パスワードはこの画面では入力せず、登録後にパスワード設定用のメールを送る（D06-30）
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { fieldErrorsFrom } from "@/lib/presentation/form-errors";
import { AdminApiError, acceptInvite } from "@/lib/utils/admin-api";
import { requestPasswordReset } from "@/lib/utils/admin-auth";

type Phase = "form" | "done" | "invalid";

export function SignupForm(props: {
  readonly inviteToken: string;
  readonly organizationName: string;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [emailTaken, setEmailTaken] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setEmailTaken(null);
    try {
      await acceptInvite({ inviteToken: props.inviteToken, name, email });
    } catch (e) {
      setBusy(false);
      if (!(e instanceof AdminApiError)) {
        toast.show(ADMIN_TEXTS.networkError, "error");
      } else if (e.code === "INVITE_TOKEN_INVALID") {
        setPhase("invalid");
      } else if (e.code === "EMAIL_ALREADY_REGISTERED") {
        setEmailTaken(e.message);
      } else if (e.code === "VALIDATION_ERROR") {
        setErrors(fieldErrorsFrom(e.details));
      } else {
        toast.show(e.message, "error");
      }
      return;
    }
    try {
      await requestPasswordReset(email);
    } catch {
      // 失敗しても T-35 を表示する（M-01「パスワードを忘れた方」から再送できる）
    }
    setPhase("done");
  }

  if (phase === "invalid") {
    return (
      <p className="notice notice--error" role="alert">
        {ADMIN_TEXTS.inviteInvalid}
      </p>
    );
  }
  if (phase === "done") {
    return (
      <>
        <p className="notice" role="status">
          {ADMIN_TEXTS.signupDone}
        </p>
        <Link href="/admin/login">ログイン画面へ</Link>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <p>{props.organizationName} の管理者として登録します</p>
      <div className="field">
        <label className="field__label" htmlFor="signup-name">
          お名前
        </label>
        <input
          id="signup-name"
          className="field__input"
          maxLength={100}
          required
          autoComplete="name"
          value={name}
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={errors.name ? "signup-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name ? (
          <p className="field__error" id="signup-name-error">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="signup-email">
          メールアドレス
        </label>
        <input
          id="signup-email"
          className="field__input"
          type="email"
          required
          autoComplete="email"
          value={email}
          aria-invalid={errors.email || emailTaken ? "true" : undefined}
          aria-describedby={errors.email || emailTaken ? "signup-email-error" : undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
        {errors.email || emailTaken ? (
          <p className="field__error" id="signup-email-error">
            {errors.email ?? emailTaken}
            {emailTaken ? (
              <>
                {" "}
                <Link href="/admin/login">ログイン画面へ</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="btn btn--primary btn--block"
        aria-disabled={busy ? "true" : undefined}
      >
        登録する
      </button>
    </form>
  );
}
