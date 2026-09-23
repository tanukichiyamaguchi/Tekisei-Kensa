"use client";
// 通信エラーなどの画面内バナー（05 §3、§4）。role="alert"、必要なら「再試行」などの操作ボタン
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";

export interface ErrorBannerProps {
  readonly text: ExamBannerTextId;
  readonly actionLabel?: string | undefined;
  readonly onAction?: (() => void) | undefined;
}

export function ErrorBanner({ text, actionLabel, onAction }: ErrorBannerProps) {
  return (
    <div className="exam-banner" role="alert" data-testid="error-banner" data-text-id={text}>
      <p>{EXAM_TEXTS[text]}</p>
      {onAction && actionLabel ? (
        <button
          type="button"
          className="exam-button exam-button--secondary"
          onClick={onAction}
          data-testid="error-banner-action"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
