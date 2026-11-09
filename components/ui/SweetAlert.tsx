"use client";
// 共用の通知の部品（11-8 §2.12.4。参照元のプラグイン「Sweet Alert」= SweetAlert2 6.6.10 と同じ見た目）。
// 受験者側の R-07（components/respondent/ExamAlertDialog.tsx）がアイコンなしで包む（11-1 §2.1.5）。
// 呼び出した要素の中に dialog を描き、showModal() で最上位の層に出す（createPortal で document.body へ移さない）。
// 文書の中の位置は変わらないので、管理画面では .admin-root、受験者側では .exam-root の指定と変数が効く。
// 見た目の CSS は管理画面が admin.css（11-8 別表D の 5）、受験者側が exam.css（11-1 §2.1.5）に置く。
// 時間・Esc・背景・差し替えの判定は sweet-alert-state.ts（純関数）
import { useEffect, useId, useRef, useState } from "react";

import {
  createSweetAlertController,
  SWEET_ALERT_CLOSING_MS,
  SWEET_ALERT_DURATION_MS,
  SWEET_ALERT_HIDDEN,
  type SweetAlertController,
  type SweetAlertState,
} from "./sweet-alert-state";

export interface SweetAlertProps {
  readonly open: boolean;
  readonly title: string;
  readonly text: string;
  /** 警告のアイコン（11-8 の招待のリンクの通知）。受験者側は出さない */
  readonly icon?: "warning" | undefined;
  /** 自動で閉じるまでの時間（既定 2,000 ミリ秒） */
  readonly durationMs?: number | undefined;
  /** 消え終わったときに呼ぶ */
  readonly onClose: () => void;
  /** 根の dialog 要素（.swal-layer）に足すクラス。包む側が自分の CSS を当てるために使う */
  readonly className?: string | undefined;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 表示中はページを縦に動かさない（SweetAlert2 の body.swal2-shown）。スクロールバーの分の幅は右の余白で埋める */
function lockScroll(): () => void {
  const body = document.body;
  const previous = { overflowY: body.style.overflowY, paddingRight: body.style.paddingRight };
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflowY = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  return () => {
    body.style.overflowY = previous.overflowY;
    body.style.paddingRight = previous.paddingRight;
  };
}

export function SweetAlert({
  open,
  title,
  text,
  icon,
  durationMs = SWEET_ALERT_DURATION_MS,
  onClose,
  className,
}: SweetAlertProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const controller = useRef<SweetAlertController | null>(null);
  const opened = useRef<{ readonly returnFocus: HTMLElement | null; readonly unlock: () => void }>(
    null,
  );
  const onCloseRef = useRef(onClose);
  const [state, setState] = useState<SweetAlertState>(SWEET_ALERT_HIDDEN);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const created = createSweetAlertController({
      onChange: setState,
      closingMs: () => (prefersReducedMotion() ? 0 : SWEET_ALERT_CLOSING_MS),
    });
    controller.current = created;
    return () => {
      created.dispose();
      controller.current = null;
    };
  }, []);

  // 開く・中身が変わる → 表示（表示中なら差し替えて数え直す）。呼び出し側が閉じたら、動きを待たずに消す
  useEffect(() => {
    if (open) controller.current?.show({ title, text }, durationMs);
    else controller.current?.hide();
  }, [open, title, text, durationMs]);

  // 状態 → dialog の開閉・フォーカス・スクロールの止め
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (state.phase !== "hidden") {
      if (opened.current) return;
      const active = document.activeElement;
      opened.current = {
        returnFocus: active instanceof HTMLElement ? active : null,
        unlock: lockScroll(),
      };
      if (!dialog.open) dialog.showModal();
      // 表示したら箱へフォーカスを移す（箱は輪郭を出さない）
      boxRef.current?.focus({ preventScroll: true });
      return;
    }
    const current = opened.current;
    if (!current) return;
    opened.current = null;
    if (dialog.open) dialog.close();
    current.unlock();
    // 閉じたら、開いたときにフォーカスがあった要素（呼び出したボタンなど）へ戻す
    if (current.returnFocus?.isConnected) current.returnFocus.focus();
    onCloseRef.current();
  }, [state.phase]);

  const content = state.phase === "hidden" ? { title, text } : state.content;
  const classes = className ? `swal-layer ${className}` : "swal-layer";

  return (
    <dialog
      ref={dialogRef}
      className={classes}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => {
        // Esc。消える動きのあとで閉じる
        event.preventDefault();
        controller.current?.escape();
      }}
      onClose={() => {
        // ブラウザが dialog を閉じた（Esc の 2 回目など）。状態を合わせる
        controller.current?.hide();
      }}
      onClick={(event) => {
        // 背景（dialog 要素そのもの）を押しても閉じない
        if (event.target === event.currentTarget) controller.current?.backdrop();
      }}
    >
      <div
        ref={boxRef}
        className="swal-modal"
        tabIndex={-1}
        data-closing={state.phase === "closing" ? "" : undefined}
      >
        {icon === "warning" ? (
          <div className="swal-icon-warning" aria-hidden="true">
            !
          </div>
        ) : null}
        <h2 className="swal-title" id={titleId}>
          {content.title}
        </h2>
        <div className="swal-content" id={textId}>
          {content.text}
        </div>
      </div>
    </dialog>
  );
}
