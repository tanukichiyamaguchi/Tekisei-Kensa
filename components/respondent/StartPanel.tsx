"use client";
// R-02 診断開始（05 §5.2）。「開始する」は POST …/start が 200 のときだけ設問ページへ進む（D05-32）
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { examErrorAction } from "@/lib/presentation/exam-errors";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import { RespondentApiError, startSession } from "@/lib/utils/respondent-api";

import { BusyOverlay } from "./BusyOverlay";
import { ErrorBanner } from "./ErrorBanner";
import { PageHeading } from "./PageHeading";
import { SessionUnavailableView } from "./SessionUnavailableView";

export function StartPanel({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: ExamBannerTextId; retry: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setBanner(null);
    try {
      await startSession(sessionId);
      router.replace(`/exam/${sessionId}/questions/1`);
      return; // 遷移完了まで BusyOverlay を残す
    } catch (error) {
      const failure =
        error instanceof RespondentApiError
          ? error
          : new RespondentApiError(0, "NETWORK_ERROR", "");
      const action = examErrorAction("start", failure);
      if (action.kind === "complete") {
        router.replace(`/exam/${sessionId}/complete`);
        return;
      }
      if (action.kind === "session_unavailable") setUnavailable(true);
      else if (action.kind === "banner") setBanner({ text: action.text, retry: action.retry });
      else setBanner({ text: "E-01", retry: true });
    }
    inFlight.current = false;
    setBusy(false);
  }

  if (unavailable) return <SessionUnavailableView />;

  return (
    <>
      <PageHeading>{EXAM_TEXTS["R2-01"]}</PageHeading>
      <p className="exam-lead">{EXAM_TEXTS["R2-02"]}</p>
      <ul className="exam-list">
        <li>{EXAM_TEXTS["R2-03"]}</li>
        <li>{EXAM_TEXTS["R2-04"]}</li>
        <li>{EXAM_TEXTS["R2-05"]}</li>
      </ul>
      {banner ? (
        <ErrorBanner
          text={banner.text}
          actionLabel={banner.retry ? EXAM_TEXTS["B-08"] : undefined}
          onAction={banner.retry ? () => void start() : undefined}
        />
      ) : null}
      <button
        type="button"
        className="exam-button"
        aria-disabled={busy ? true : undefined}
        onClick={() => void start()}
        data-testid="start-button"
      >
        {EXAM_TEXTS["B-02"]}
      </button>
      {busy ? <BusyOverlay text={EXAM_TEXTS["L-02"]} /> : null}
    </>
  );
}
