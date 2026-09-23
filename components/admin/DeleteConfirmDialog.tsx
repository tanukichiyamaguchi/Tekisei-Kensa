"use client";
// P-06 削除確認（06 §3.4.5）
import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export function DeleteConfirmDialog(props: {
  readonly target: { readonly name: string } | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Dialog
      open={props.target !== null}
      title={ADMIN_TEXTS.confirmDelete}
      onClose={props.onClose}
      closeDisabled={props.busy}
      footer={
        <>
          <button
            type="button"
            className="btn"
            aria-disabled={props.busy ? "true" : undefined}
            onClick={() => !props.busy && props.onClose()}
          >
            {ADMIN_TEXTS.cancel}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            aria-disabled={props.busy ? "true" : undefined}
            onClick={() => !props.busy && props.onConfirm()}
          >
            {ADMIN_TEXTS.delete}
          </button>
        </>
      }
    >
      <p>{props.target?.name} さんの回答データと結果を削除します。この操作は取り消せません。</p>
      {props.error ? (
        <p className="notice notice--error" role="alert">
          {props.error}
        </p>
      ) : null}
    </Dialog>
  );
}
