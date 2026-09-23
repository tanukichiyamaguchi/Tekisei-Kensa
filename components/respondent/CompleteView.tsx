"use client";
// R-05 完了（05 §5.5）。固定文言のみ。結果・氏名・日時は表示しない
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

import { PageHeading } from "./PageHeading";

export function CompleteView() {
  const router = useRouter();
  useEffect(() => {
    // クライアント側のルーターキャッシュを捨てる。ブラウザの戻るで送信前の設問ページが
    // キャッシュから復元されず、サーバの判定（05 §1.3）で完了画面へ戻されるようにする（05 §7.3、D05-15）
    router.refresh();
  }, [router]);
  return (
    <section className="exam-complete" data-testid="complete-view">
      <span className="exam-complete-icon" aria-hidden="true">
        ✓
      </span>
      <PageHeading>{EXAM_TEXTS["C-01"]}</PageHeading>
      <p>{EXAM_TEXTS["C-02"]}</p>
    </section>
  );
}
