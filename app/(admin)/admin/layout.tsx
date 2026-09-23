// 管理画面のレイアウト（06 §1.3 D06-27）。認証チェックも AdminShell も持たず、スタイルの読み込みとルート要素だけを担う。
// 認証不要パス（M-01〜M-03）と 07 の印刷用ページもこの内側に置かれるため
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../admin.css";

export const metadata: Metadata = {
  title: "管理画面 | 適性検査",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { readonly children: ReactNode }) {
  return <div className="admin-root">{children}</div>;
}
