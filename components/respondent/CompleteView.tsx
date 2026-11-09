"use client";
// R-05 完了（11-1 §2.5）。狭い枠に笑顔のアイコン・「回答完了」・本文を中央揃えで並べる。
// 結果・氏名・電話番号・日時は出さない。ボタン・リンクは置かない。Cookie は消さない
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

import { SmileyIcon } from "./ExamIcons";
import { PageHeading } from "./PageHeading";

export function CompleteView() {
  const router = useRouter();
  useEffect(() => {
    // クライアント側のルーターキャッシュを捨てる。ブラウザの戻るで送信前の受験画面が
    // キャッシュから復元されず、サーバの判定（11-1 §2.1.2）で完了画面へ戻されるようにする（D05-15）
    router.refresh();
  }, [router]);
  return (
    <section className="exam-frame-narrow" data-testid="complete-view">
      <div className="exam-complete">
        <SmileyIcon className="exam-complete__icon" />
        <PageHeading className="exam-title exam-title--center">{EXAM_TEXTS["C-01"]}</PageHeading>
        <p className="exam-complete__text">{EXAM_TEXTS["C-02"]}</p>
      </div>
    </section>
  );
}
