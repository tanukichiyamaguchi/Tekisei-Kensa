// 共通ヘッダーと最大幅のコンテナ（05 §2.6）。ナビゲーション・組織名は置かない（D05-34）
import type { ReactNode } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

export function ExamShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="exam-root">
      <div className="exam-container">
        <header className="exam-header">
          <p className="exam-site-name">{EXAM_TEXTS["H-01"]}</p>
        </header>
        <main className="exam-main">{children}</main>
      </div>
    </div>
  );
}
