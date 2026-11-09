// 受験者側の画面の根（11-1 §2.1.3・§2.1.4）。.exam-root に受験者側のトークンを置き、その中に main を置くだけ。
// 共通ヘッダー（H-01）・最大幅のコンテナ・組織名は置かない（11-1 §1.3）。狭い枠・広い枠は各画面の根に付ける。
// 重ねて出す R-07（エラーの通知）と R-08（ロード中）も、この中（各画面の部品の中）に描く
import type { ReactNode } from "react";

export function ExamShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="exam-root">
      <main className="exam-main">{children}</main>
    </div>
  );
}
