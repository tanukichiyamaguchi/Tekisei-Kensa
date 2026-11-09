"use client";
// 各画面の h1（11-1 §2.1.7）。表示されたらフォーカスを移す（tabIndex -1。輪郭は出さない）。
// 大きさは画面ごとのクラス（23px の見出し .exam-title、受験画面の「Step n」.exam-step__heading）
import { useEffect, useRef, type ReactNode } from "react";

export interface PageHeadingProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function PageHeading({ children, className = "exam-title" }: PageHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
