"use client";
// 操作の途中で受験を続けられなくなったとき（401・404）の R-06（11-1 §2.6 の session_unavailable、本文 E-04）。
// その場（同じ URL）に出し、このブラウザの退避を消す（11-1 §2.4.5）
import { useEffect } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";
import { clearAllExamDrafts } from "@/lib/utils/exam-draft-storage";

import { PageHeading } from "./PageHeading";

export function SessionUnavailableView() {
  useEffect(() => {
    clearAllExamDrafts();
  }, []);
  return (
    <section className="exam-frame-narrow" data-testid="exam-error-session_unavailable">
      <div className="exam-error">
        <PageHeading className="exam-title exam-title--center">{EXAM_TEXTS["X-04"]}</PageHeading>
        <p className="exam-error__text">{EXAM_TEXTS["E-04"]}</p>
      </div>
    </section>
  );
}

/** Server Component が session_unavailable を表示するときに退避を消すだけの部品 */
export function ExamDraftCleaner() {
  useEffect(() => {
    clearAllExamDrafts();
  }, []);
  return null;
}
