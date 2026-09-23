"use client";
// R-04 送信確認ダイアログ（05 §5.4）。dialog 要素の showModal() でフォーカスを閉じ込める
import { useEffect, useRef } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

export interface SubmitConfirmDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function SubmitConfirmDialog({ open, busy, onConfirm, onCancel }: SubmitConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="exam-dialog"
      aria-labelledby="submit-dialog-title"
      aria-describedby="submit-dialog-body"
      onCancel={(e) => {
        // Esc キー。送信中は閉じない
        e.preventDefault();
        if (!busy) onCancel();
      }}
      data-testid="submit-dialog"
    >
      <h2 id="submit-dialog-title">{EXAM_TEXTS["S-01"]}</h2>
      <p id="submit-dialog-body">{EXAM_TEXTS["S-02"]}</p>
      <div className="exam-dialog-buttons">
        <button
          type="button"
          className="exam-button exam-button--secondary"
          aria-disabled={busy ? true : undefined}
          onClick={() => {
            if (!busy) onCancel();
          }}
          data-testid="submit-cancel"
        >
          {EXAM_TEXTS["B-07"]}
        </button>
        <button
          type="button"
          className="exam-button"
          aria-disabled={busy ? true : undefined}
          onClick={onConfirm}
          data-testid="submit-confirm"
        >
          {EXAM_TEXTS["B-06"]}
        </button>
      </div>
      {/* モーダルの背後の BusyOverlay は見えないため、送信中の表示はダイアログ内に出す */}
      {busy ? (
        <p role="status" className="exam-muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
          {EXAM_TEXTS["L-03"]}
        </p>
      ) : null}
    </dialog>
  );
}
