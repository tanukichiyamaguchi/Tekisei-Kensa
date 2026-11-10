"use client";
// 「組織内分類とは」のポップアップ（11-3 §2.5）。dialog（showModal で開くモーダル）を根の .ob-root の外（後ろ）に描く。
// 開いたら閉じるボタンに焦点、閉じるボタンと Esc で閉じ、背景（dialog 自身）を押しても閉じない（Bubble のポップアップの既定。推定。
// 11-3 6 章の 4）。閉じたら開いた要素（「組織内分類とは？」）に焦点を戻す。本文の空白と改行は CSS の pre-wrap で保つ
import { useEffect, useId, useRef, type RefObject } from "react";

import { CloseIcon } from "./icons";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";

export function ClassificationAboutDialog(props: {
  readonly open: boolean;
  /** 閉じたら焦点を戻す要素（「組織内分類とは？」） */
  readonly openerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS.about;
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { open, openerRef } = props;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      openerRef.current?.focus();
    }
  }, [open, openerRef]);

  return (
    <dialog
      ref={ref}
      className="ob-about"
      data-testid="ob-about"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc。閉じる判断は親に任せる
        event.preventDefault();
        props.onClose();
      }}
    >
      <div className="in">
        <button
          ref={closeRef}
          type="button"
          className="x"
          aria-label={t.close}
          onClick={props.onClose}
        >
          <CloseIcon />
        </button>
        <h2 id={titleId}>{t.title}</h2>
        <p className="tx">{t.body}</p>
      </div>
    </dialog>
  );
}
