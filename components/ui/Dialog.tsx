"use client";
// dialog 要素のポップアップ（06 §2.4、11-2 §3.12）。既定は Esc と背景クリックで閉じ、closeOnEsc・closeOnBackdrop で閉じない指定ができる
// （削除の確認・利用履歴。11-2 §2.16・§2.18）。開いたら最初の操作要素へ、閉じたら元の要素へフォーカスを戻す。
// 使う側の位置に描く（ポータルを使わない）ので、.admin-root の管理画面に共通の焦点の枠と、一覧の CSS 変数が中の部品に効く（11-8 §2.2.6）。
// closeIcon は閉じるボタンの中身（省くと「×」の文字）。bodyRegionLabel を渡すと、本文の入れ物（.dialog__body）がはみ出して動く間だけ
// 焦点を受ける（tabIndex 0・role="region"・その読み上げ名。はみ出しは ResizeObserver で見る。中に焦点を受ける部品が無い入れ物が
// axe の scrollable-region-focusable に当たらないように。結果詳細の 2 つのポップアップ。11-4 §2.15、11 総論 8.5）
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly wide?: boolean;
  /** 通信中など、閉じさせたくないとき */
  readonly closeDisabled?: boolean;
  /** Esc で閉じるか（既定 true） */
  readonly closeOnEsc?: boolean;
  /** 背景（dialog 要素自身）のクリックで閉じるか（既定 true） */
  readonly closeOnBackdrop?: boolean;
  /** dialog 要素の class に足すクラス（見た目の上書き。dialog・dialog--wide の後ろに付く） */
  readonly className?: string;
  /** 閉じるボタンの中身（省くと「×」の文字。読み上げの名前は aria-label「閉じる」のまま） */
  readonly closeIcon?: ReactNode;
  /** 本文の入れ物がはみ出して動く間だけ付ける読み上げの名前（省くと入れ物は焦点を受けない） */
  readonly bodyRegionLabel?: string;
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  closeDisabled,
  closeOnEsc = true,
  closeOnBackdrop = true,
  className,
  closeIcon,
  bodyRegionLabel,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyScrollable, setBodyScrollable] = useState(false);
  const titleId = useId();
  const escCloses = closeOnEsc && !closeDisabled;

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

  useEffect(() => {
    // 本文の入れ物のはみ出し（開いて描かれてから見る。上の効果で showModal した後）。bodyRegionLabel が無ければ見ない
    const box = bodyRef.current;
    if (!open || bodyRegionLabel === undefined || !box) {
      setBodyScrollable(false);
      return;
    }
    const check = () =>
      setBodyScrollable(box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [open, bodyRegionLabel]);

  useEffect(() => {
    // Esc で閉じないとき（closeOnEsc が偽・通信中）は、閉じる要求そのものを起こさない。Chrome は cancel を止めても、
    // 間に利用者の操作が無い 2 回目の Esc では止められずに閉じるため、Escape の keydown を止める（焦点がどこにあっても）
    if (!open || escCloses) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, escCloses]);

  return (
    <dialog
      ref={ref}
      className={["dialog", wide ? "dialog--wide" : null, className ?? null]
        .filter((c): c is string => c !== null && c !== "")
        .join(" ")}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc。閉じる判断は親に任せる
        event.preventDefault();
        if (escCloses) onClose();
      }}
      onClick={(event) => {
        // 背景（dialog 要素自身）のクリック
        if (closeOnBackdrop && event.target === event.currentTarget && !closeDisabled) onClose();
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
            {closeIcon ?? "×"}
          </button>
        </div>
        <div
          ref={bodyRef}
          className="dialog__body"
          {...(bodyRegionLabel !== undefined && bodyScrollable
            ? { tabIndex: 0, role: "region", "aria-label": bodyRegionLabel }
            : {})}
        >
          {children}
        </div>
        {footer ? <div className="dialog__footer">{footer}</div> : null}
      </div>
    </dialog>
  );
}
