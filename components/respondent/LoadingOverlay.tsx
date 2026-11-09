"use client";
// R-08 ロード中（11-1 §2.1.6）。画面全体を覆い（下の画面を押せない）、中央に回るアイコンと「ロード中」。
// 出すのは「送信する」を押してから完了画面に移るまでと、「次へ」で保存が終わっていない間（11-1 §2.4.6・§2.4.7）。
// .exam-root の中に描く（「ロード中」の色などのトークンを効かせる）。動きを減らす設定では回さない（exam.css）
import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

import { SpinnerIcon } from "./ExamIcons";

export function LoadingOverlay() {
  return (
    <div className="exam-loading" data-testid="loading-overlay">
      <div className="exam-loading__inner">
        <SpinnerIcon className="exam-loading__icon" />
        <p className="exam-loading__text" role="status">
          {EXAM_TEXTS["LD-01"]}
        </p>
      </div>
    </div>
  );
}
