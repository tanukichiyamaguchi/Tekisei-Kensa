// PDF の印刷用ページのレイアウト（07 §9.4）。AdminShell（サイドメニュー・ヘッダー）を描かない最小のラッパーで、
// 印刷用 CSS とフォント（07 §9.7）だけを読み込む。認可はページ側の印刷トークンで行う
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./print.css";

export const metadata: Metadata = {
  title: "診断結果（印刷用）",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { readonly children: ReactNode }) {
  return <div className="print-root">{children}</div>;
}
