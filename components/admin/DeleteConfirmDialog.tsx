"use client";
// P-06 削除の確認（11-2 §2.16）。⋮メニューの「この受験を削除」から、行の代表の受験 1 件を対象に出す。
// Esc・背景では閉じず（参照元の設定）、右上の閉じるアイコンと「キャンセル」で閉じる。通信中はボタンを aria-disabled にし、閉じさせない。
// 見た目（箱・暗幕・閉じるアイコン・ボタン）は className の rl-popup で当てる（app/(admin)/admin.css）
import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatYmd } from "@/lib/presentation/format-datetime";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";

export function DeleteConfirmDialog(props: {
  /** 削除する受験（氏名と受験日）。null なら閉じる */
  readonly target: { readonly name: string; readonly submittedAt: string } | null;
  readonly busy: boolean;
  /** 404 以外の失敗の文言（ポップアップの中に出す） */
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  const disabled = props.busy ? "true" : undefined;
  return (
    <Dialog
      open={props.target !== null}
      title={RESULT_LIST_TEXTS.deleteConfirm.title}
      onClose={props.onClose}
      closeDisabled={props.busy}
      closeOnEsc={false}
      closeOnBackdrop={false}
      className="rl-popup"
      footer={
        <>
          <button
            type="button"
            className="rl-popup-btn rl-popup-btn--danger"
            aria-disabled={disabled}
            onClick={() => !props.busy && props.onConfirm()}
          >
            {ADMIN_TEXTS.delete}
          </button>
          <button
            type="button"
            className="rl-popup-btn rl-popup-btn--cancel"
            aria-disabled={disabled}
            onClick={() => !props.busy && props.onClose()}
          >
            {ADMIN_TEXTS.cancel}
          </button>
        </>
      }
    >
      {props.target ? (
        <p className="rl-popup-text">
          {RESULT_LIST_TEXTS.deleteConfirm.body(
            props.target.name,
            formatYmd(props.target.submittedAt),
          )}
        </p>
      ) : null}
      {props.error ? (
        <p className="rl-popup-text" role="alert">
          {props.error}
        </p>
      ) : null}
    </Dialog>
  );
}
