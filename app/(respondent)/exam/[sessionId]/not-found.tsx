// /exam/{sessionId} 以下の notFound()（Cookie なし・不一致・期限切れ・削除済み）。05 §5.6 session_unavailable
import { ExamErrorView } from "@/components/respondent/ExamErrorView";
import { ExamDraftCleaner } from "@/components/respondent/SessionUnavailableView";

export default function SessionUnavailable() {
  return (
    <>
      <ExamErrorView kind="session_unavailable" />
      <ExamDraftCleaner />
    </>
  );
}
