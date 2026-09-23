"use client";
// dialog 要素のポップアップ（06 §2.4）。Esc と背景クリックで閉じ、開いたら最初の操作要素へ、閉じたら元の要素へフォーカスを戻す
import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly wide?: boolean;
  /** 通信中など、閉じさせたくないとき */
  readonly closeDisabled?: boolean;
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  closeDisabled,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
      const first = dialog.querySelector<HTMLElement>(
        "[data-autofocus], button:not([aria-disabled='true']), a[href], input, select, textarea",
      );
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? "dialog dialog--wide" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc。閉じる判断は親に任せる
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(event) => {
        // 背景（dialog 要素自身）のクリックで閉じる
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div className="dialog__inner">
        <div className="dialog__header">
          <h2 className="dialog__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="閉じる"
            aria-disabled={closeDisabled ? "true" : undefined}
            onClick={() => {
              if (!closeDisabled) onClose();
            }}
          >
            ×
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer ? <div className="dialog__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}
