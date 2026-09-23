"use client";
// M-07 アカウント（06 §3.7）: 氏名・メールアドレス・パスワードの変更、受検リンク、管理者追加用リンク（owner）、管理者一覧（owner）
import { useState, type FormEvent } from "react";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_ROLE_LABELS } from "@/lib/presentation/admin-roles";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { fieldErrorsFrom, passwordProblem } from "@/lib/presentation/form-errors";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { AdminUserListDto, MeDto } from "@/lib/services/dto/admin";
import { AdminApiError, rotateInviteToken, updateMe } from "@/lib/utils/admin-api";
import { AdminAuthError, reauthenticate } from "@/lib/utils/admin-auth";

export function AccountPage(props: {
  readonly me: MeDto;
  readonly adminUsers: AdminUserListDto | null; // owner / super_admin のみ
}) {
  const canManage = props.me.role === "owner" || props.me.role === "super_admin";
  return (
    <>
      <h1>{ADMIN_TEXTS.nav.account}</h1>
      <AccountInfo me={props.me} />
      <LinksPanel me={props.me} canManage={canManage} />
      {canManage && props.adminUsers ? <AdminUserTable list={props.adminUsers} /> : null}
      <PasswordPanel email={props.me.email} />
      <div className="panel">
        <LogoutButton />
      </div>
    </>
  );
}

/** reloginRequired: Cookie は削除済み。案内を出してログイン画面へ（06 §3.7、04 D04-57） */
function goRelogin(toastShow: (m: string) => void, what: "メールアドレス" | "パスワード") {
  toastShow(ADMIN_TEXTS.reloginRequired(what));
  setTimeout(() => window.location.assign("/admin/login?reset=1"), 1500);
}

/** 再認証の失敗を欄の文言にする（T-38）。429 相当は呼び出し側で Toast */
function reauthMessage(error: unknown): { field: string | null; toast: string | null } {
  if (error instanceof AdminAuthError) {
    if (error.reason === "too_many_requests") {
      return { field: null, toast: "試行回数が多すぎます。しばらくしてから再度お試しください" };
    }
    if (error.reason === "network") return { field: null, toast: ADMIN_TEXTS.networkError };
  }
  return { field: ADMIN_TEXTS.currentPasswordMismatch, toast: null };
}

function AccountInfo(props: { readonly me: MeDto }) {
  const toast = useToast();
  const [name, setName] = useState(props.me.name);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(props.me.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNameError(null);
    try {
      const updated = await updateMe({ name: nameDraft });
      setName(updated.name);
      setEditingName(false);
      toast.show(ADMIN_TEXTS.changed);
    } catch (e) {
      if (e instanceof AdminApiError && e.code === "VALIDATION_ERROR") {
        setNameError(fieldErrorsFrom(e.details).name ?? e.message);
      } else {
        toast.show(e instanceof AdminApiError ? e.message : ADMIN_TEXTS.networkError, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel account-section" aria-labelledby="account-info">
      <h2 id="account-info">アカウント情報</h2>
      <dl className="account-list">
        <div>
          <dt>お名前</dt>
          <dd>
            {editingName ? (
              <form className="field__row" onSubmit={saveName} noValidate>
                <input
                  className="field__input"
                  aria-label="お名前"
                  maxLength={100}
                  value={nameDraft}
                  aria-invalid={nameError ? "true" : undefined}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn--primary"
                  aria-disabled={busy ? "true" : undefined}
                >
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditingName(false)}>
                  {ADMIN_TEXTS.cancel}
                </button>
              </form>
            ) : (
              <>
                <span data-testid="account-name">{name}</span>{" "}
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setNameDraft(name);
                    setNameError(null);
                    setEditingName(true);
                  }}
                >
                  変更
                </button>
              </>
            )}
            {nameError ? <p className="field__error">{nameError}</p> : null}
          </dd>
        </div>
        <div>
          <dt>メールアドレス</dt>
          <dd>
            {props.me.email ?? "—"}{" "}
            <button type="button" className="btn" onClick={() => setEmailOpen(true)}>
              変更
            </button>
          </dd>
        </div>
        <div>
          <dt>役割</dt>
          <dd>{ADMIN_ROLE_LABELS[props.me.role]}</dd>
        </div>
      </dl>
      <EmailDialog open={emailOpen} email={props.me.email} onClose={() => setEmailOpen(false)} />
    </section>
  );
}

function EmailDialog(props: {
  readonly open: boolean;
  readonly email: string | null;
  readonly onClose: () => void;
}) {
  const toast = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [errors, setErrors] = useState<{ email?: string; current?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !props.email) return;
    setBusy(true);
    setErrors({});
    let reauthIdToken: string;
    try {
      reauthIdToken = await reauthenticate(props.email, current);
    } catch (e) {
      const m = reauthMessage(e);
      if (m.field) setErrors({ current: m.field });
      if (m.toast) toast.show(m.toast, "error");
      setBusy(false);
      return;
    }
    try {
      const updated = await updateMe({ email: newEmail, reauthIdToken });
      if (updated.reloginRequired) goRelogin(toast.show, "メールアドレス");
    } catch (e) {
      setBusy(false);
      if (!(e instanceof AdminApiError)) return toast.show(ADMIN_TEXTS.networkError, "error");
      if (e.code === "CURRENT_PASSWORD_MISMATCH") setErrors({ current: e.message });
      else if (e.code === "EMAIL_ALREADY_REGISTERED") setErrors({ email: e.message });
      else if (e.code === "VALIDATION_ERROR") {
        const f = fieldErrorsFrom(e.details);
        setErrors({ email: f.email ?? e.message });
      } else toast.show(e.message, "error");
    }
  }

  return (
    <Dialog
      open={props.open}
      title="メールアドレスの変更"
      onClose={props.onClose}
      closeDisabled={busy}
    >
      <form onSubmit={onSubmit} noValidate>
        <p className="muted">{ADMIN_TEXTS.sessionsRevokedNote}</p>
        <div className="field">
          <label className="field__label" htmlFor="new-email">
            新しいメールアドレス
          </label>
          <input
            id="new-email"
            className="field__input"
            type="email"
            autoComplete="email"
            value={newEmail}
            aria-invalid={errors.email ? "true" : undefined}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {errors.email ? <p className="field__error">{errors.email}</p> : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="email-current-password">
            現在のパスワード
          </label>
          <input
            id="email-current-password"
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={current}
            aria-invalid={errors.current ? "true" : undefined}
            onChange={(e) => setCurrent(e.target.value)}
          />
          {errors.current ? <p className="field__error">{errors.current}</p> : null}
        </div>
        <button
          type="submit"
          className="btn btn--primary"
          aria-disabled={busy ? "true" : undefined}
        >
          変更する
        </button>
      </form>
    </Dialog>
  );
}

function LinkRow(props: { readonly id: string; readonly label: string; readonly url: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="field__row">
        <input id={props.id} className="field__input" readOnly value={props.url} />
        <CopyButton text={props.url} targetId={props.id} label={props.label} />
      </div>
    </div>
  );
}

function LinksPanel(props: { readonly me: MeDto; readonly canManage: boolean }) {
  const toast = useToast();
  const [issuedAt, setIssuedAt] = useState(props.me.links.adminInviteIssuedAt);
  const [invite, setInvite] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rotate() {
    if (busy) return;
    setBusy(true);
    try {
      const rotated = await rotateInviteToken();
      // 平文は React の state にだけ置く（ストレージに保存しない。04 D04-56）
      setInvite(rotated.adminInvite);
      setIssuedAt(rotated.rotatedAt);
      setConfirmOpen(false);
      toast.show(ADMIN_TEXTS.issued);
    } catch (e) {
      toast.show(e instanceof AdminApiError ? e.message : ADMIN_TEXTS.networkError, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel account-section" aria-labelledby="account-links">
      <h2 id="account-links">受検リンク</h2>
      <LinkRow id="link-applicant" label="求職者用回答リンク" url={props.me.links.applicant} />
      <LinkRow
        id="link-executive"
        label="既存スタッフ用回答リンク"
        url={props.me.links.executive}
      />
      <p className="muted">{ADMIN_TEXTS.ownerOnly}</p>
      {props.canManage ? (
        <div className="invite-block" data-testid="invite-block">
          <h3>管理者追加用リンク</h3>
          <p>発行日時: {issuedAt ? formatDateTime(issuedAt) : ADMIN_TEXTS.notIssued}</p>
          <button type="button" className="btn" onClick={() => setConfirmOpen(true)}>
            管理者追加用リンクを発行する
          </button>
          {invite ? (
            <>
              <LinkRow id="link-invite" label="管理者追加用リンク" url={invite} />
              <p className="notice" role="status">
                {ADMIN_TEXTS.inviteLinkOnce}
              </p>
            </>
          ) : null}
          <Dialog
            open={confirmOpen}
            title="管理者追加用リンクの発行"
            onClose={() => setConfirmOpen(false)}
            closeDisabled={busy}
            footer={
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => !busy && setConfirmOpen(false)}
                >
                  {ADMIN_TEXTS.cancel}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  aria-disabled={busy ? "true" : undefined}
                  onClick={() => void rotate()}
                >
                  発行する
                </button>
              </>
            }
          >
            <p>{ADMIN_TEXTS.rotateConfirm}</p>
          </Dialog>
        </div>
      ) : null}
    </section>
  );
}

function AdminUserTable(props: { readonly list: AdminUserListDto }) {
  return (
    <section className="panel account-section" aria-labelledby="account-admins">
      <h2 id="account-admins">管理者一覧</h2>
      <table className="data-table" data-testid="admin-user-table">
        <thead>
          <tr>
            <th scope="col">お名前</th>
            <th scope="col">メールアドレス</th>
            <th scope="col">役割</th>
            <th scope="col">状態</th>
            <th scope="col">登録日</th>
          </tr>
        </thead>
        <tbody>
          {props.list.items.map((u) => (
            <tr key={u.adminUserId}>
              <td>{u.name}</td>
              <td>{u.email ?? "—"}</td>
              <td>{ADMIN_ROLE_LABELS[u.role]}</td>
              <td>{u.isSuspended ? "停止中" : "有効"}</td>
              <td className="data-table__nowrap">{formatDateTime(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PasswordPanel(props: { readonly email: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !props.email) return;
    const problem = passwordProblem(password);
    if (problem) return setErrors({ password: problem });
    if (password !== confirm) return setErrors({ password: "確認用のパスワードが一致しません" });
    setBusy(true);
    setErrors({});
    let reauthIdToken: string;
    try {
      reauthIdToken = await reauthenticate(props.email, current);
    } catch (e) {
      const m = reauthMessage(e);
      if (m.field) setErrors({ current: m.field });
      if (m.toast) toast.show(m.toast, "error");
      setBusy(false);
      return;
    }
    try {
      const updated = await updateMe({ password, reauthIdToken });
      if (updated.reloginRequired) goRelogin(toast.show, "パスワード");
    } catch (e) {
      setBusy(false);
      if (!(e instanceof AdminApiError)) return toast.show(ADMIN_TEXTS.networkError, "error");
      if (e.code === "CURRENT_PASSWORD_MISMATCH") setErrors({ current: e.message });
      else if (e.code === "VALIDATION_ERROR") {
        setErrors({ password: fieldErrorsFrom(e.details).password ?? e.message });
      } else toast.show(e.message, "error");
    }
  }

  return (
    <section className="panel account-section" aria-labelledby="account-password">
      <h2 id="account-password">パスワード</h2>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        パスワードを変更する
      </button>
      <Dialog
        open={open}
        title="パスワードの変更"
        onClose={() => setOpen(false)}
        closeDisabled={busy}
      >
        <form onSubmit={onSubmit} noValidate>
          <p className="muted">{ADMIN_TEXTS.sessionsRevokedNote}</p>
          <div className="field">
            <label className="field__label" htmlFor="password-current">
              現在のパスワード
            </label>
            <input
              id="password-current"
              className="field__input"
              type="password"
              autoComplete="current-password"
              value={current}
              aria-invalid={errors.current ? "true" : undefined}
              onChange={(e) => setCurrent(e.target.value)}
            />
            {errors.current ? <p className="field__error">{errors.current}</p> : null}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="password-new">
              新しいパスワード（8〜72 文字、英字と数字を含む）
            </label>
            <input
              id="password-new"
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={errors.password ? "true" : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password ? <p className="field__error">{errors.password}</p> : null}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="password-confirm">
              新しいパスワード（確認）
            </label>
            <input
              id="password-confirm"
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn--primary"
            aria-disabled={busy ? "true" : undefined}
          >
            変更する
          </button>
        </form>
      </Dialog>
    </section>
  );
}
