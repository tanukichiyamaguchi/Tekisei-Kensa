"use client";
// 各画面の h1。表示されたらフォーカスを移す（05 §8「ページ遷移後は見出し（h1）にフォーカス」）
import { useEffect, useRef, type ReactNode } from "react";

export function PageHeading({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="exam-heading">
      {children}
    </h1>
  );
}
