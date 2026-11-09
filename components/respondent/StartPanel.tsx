"use client";
// R-02 診断開始（11-1 §2.3）。広い枠の中のカードに見出し・本文・「開始する」。アプリが足していた補足 3 行は出さない。
// 「開始する」は POST …/start が 200 のときだけ受験画面（/exam/{sessionId}/questions）へ進む（D05-32）。
// 通信中は押せない状態（ロード中は出さない）。失敗は R-07、受験を続けられなければ R-06 をその場に出す
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { examErrorAction } from "@/lib/presentation/exam-errors";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import { RespondentApiError, startSession } from "@/lib/utils/respondent-api";

import { ExamAlertDialog } from "./ExamAlertDialog";
import { PageHeading } from "./PageHeading";
import { SessionUnavailableView } from "./SessionUnavailableView";

export function StartPanel({ sessionId }: { readonly sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<ExamBannerTextId | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await startSession(sessionId);
      router.replace(`/exam/${sessionId}/questions`);
      return; // 遷移が終わるまで押せない状態のまま
    } catch (error) {
      const failure =
        error instanceof RespondentApiError
          ? error
          : new RespondentApiError(0, "NETWORK_ERROR", "network error");
      const action = examErrorAction("start", failure);
      if (action.kind === "complete") {
        router.replace(`/exam/${sessionId}/complete`);
        return;
      }
      if (action.kind === "session_unavailable") setUnavailable(true);
      else setAlert(action.kind === "alert" ? action.textId : "E-01");
    }
    inFlight.current = false;
    setBusy(false);
  }

  if (unavailable) return <SessionUnavailableView />;

  return (
    <div className="exam-frame-wide">
      <section className="exam-card exam-start" data-testid="start-panel">
        <div className="exam-start__title">
          <PageHeading>{EXAM_TEXTS["R2-01"]}</PageHeading>
          <p className="exam-text">{EXAM_TEXTS["R2-02"]}</p>
        </div>
        <button
          type="button"
          className="exam-button exam-start__button"
          aria-disabled={busy ? true : undefined}
          onClick={() => void start()}
          data-testid="start-button"
        >
          {EXAM_TEXTS["B-02"]}
        </button>
      </section>
      <ExamAlertDialog textId={alert} onClose={() => setAlert(null)} />
    </div>
  );
}
