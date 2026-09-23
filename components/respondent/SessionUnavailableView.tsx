"use client";
// 通信中に受検セッションを確認できなくなったときの全面表示（05 §7.1 の E-04）。未保存の選択の退避も消す（05 §6.4）
import { useEffect } from "react";

import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";
import { clearAllExamDrafts } from "@/lib/utils/exam-draft-storage";

import { PageHeading } from "./PageHeading";

export function SessionUnavailableView() {
  useEffect(() => {
    clearAllExamDrafts();
  }, []);
  return (
    <section className="exam-error" data-testid="exam-error-session_unavailable">
      <PageHeading>{EXAM_TEXTS["X-04"]}</PageHeading>
      <p>{EXAM_TEXTS["E-04"]}</p>
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
