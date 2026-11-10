"use client";
// 画面下部の通知（06 §2.5、11-2 §2.20・§3.12）。1 件ずつ出し、新しい通知は前の通知を置き換えて表示の時間を数え直す。
// 時間は情報 2.2 秒・エラー 6 秒（durationMs で上書き）。title は本文の前の行に出す。読み上げは通知の要素の role
// （エラーは alert、ほかは status）で、空の role="status" の領域は置かない。
// モーダルの dialog 要素が開いている間に出した通知は、その dialog の中に描く（showModal の外は inert で、暗幕の下になり読み上げられない
// ため）。その dialog が閉じたら元の場所に戻す。最初の描画ではポータルを使わない（サーバの描画で使えるように）
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastKind = "info" | "error";

export interface ToastOptions {
  readonly kind?: ToastKind;
  /** 本文の前の行に出す見出し（削除の通知の「完了」。11-2 §2.20） */
  readonly title?: string;
  /** 表示の時間（ミリ秒）。省くと情報 2,200・エラー 6,000 */
  readonly durationMs?: number;
}

interface ToastItem {
  readonly id: number;
  readonly kind: ToastKind;
  readonly title: string | null;
  readonly message: string;
}

interface ToastApi {
  /** 2 つ目の引数は今の種類（"info"・"error"）か、種類・見出し・時間の指定 */
  readonly show: (message: string, options?: ToastKind | ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
/** 表示の時間（11-2 §2.20。エラーは今のまま） */
export const TOAST_INFO_MS = 2200;
export const TOAST_ERROR_MS = 6000;
let nextId = 1;

/** 開いているモーダルの dialog 要素（無ければ null。:modal を読めない古いブラウザでも null） */
function openModalDialog(): HTMLDialogElement | null {
  try {
    return document.querySelector<HTMLDialogElement>("dialog:modal");
  } catch {
    return null;
  }
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, options?: ToastKind | ToastOptions) => {
    const o: ToastOptions = typeof options === "string" ? { kind: options } : (options ?? {});
    const kind = o.kind ?? "info";
    const id = nextId++;
    if (timer.current !== null) clearTimeout(timer.current);
    setHost(openModalDialog());
    setItem({ id, kind, title: o.title ?? null, message });
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setItem((current) => (current?.id === id ? null : current));
      },
      o.durationMs ?? (kind === "error" ? TOAST_ERROR_MS : TOAST_INFO_MS),
    );
  }, []);

  useEffect(() => {
    if (!host) return;
    // 描いた先の dialog が閉じたら（すでに閉じていたら）元の場所に戻す
    if (!host.open || !host.isConnected) {
      setHost(null);
      return;
    }
    const onClose = () => setHost(null);
    host.addEventListener("close", onClose);
    return () => host.removeEventListener("close", onClose);
  }, [host]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);
  const region = (
    <div className="toast-region">
      {item ? (
        <div
          key={item.id}
          className={item.kind === "error" ? "toast toast--error" : "toast"}
          role={item.kind === "error" ? "alert" : "status"}
        >
          {item.title !== null ? <span className="toast__title">{item.title}</span> : null}
          {item.message}
        </div>
      ) : null}
    </div>
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      {host ? createPortal(region, host) : region}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("ToastProvider の内側で使ってください");
  return api;
}
