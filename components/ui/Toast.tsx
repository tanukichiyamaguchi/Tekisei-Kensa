"use client";
// 画面下部の通知（06 §2.5）。エラーは role="alert"、それ以外は role="status"
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastKind = "info" | "error";
interface ToastItem {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

interface ToastApi {
  readonly show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TOAST_MS = 6000;
let nextId = 1;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), TOAST_MS);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {items.map((t) => (
          <div
            key={t.id}
            className={t.kind === "error" ? "toast toast--error" : "toast"}
            role={t.kind === "error" ? "alert" : "status"}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("ToastProvider の内側で使ってください");
  return api;
}
