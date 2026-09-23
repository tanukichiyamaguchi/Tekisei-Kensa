// R-01 上部の再開バナー（05 §6.3）。氏名などの個人情報は表示しない（D05-27）
import Link from "next/link";

import { EXAM_TEXTS, examTextResumeAnswered } from "@/lib/presentation/exam-texts";

export interface ResumeBannerProps {
  readonly sessionId: string;
  readonly answeredCount: number;
}

export function ResumeBanner({ sessionId, answeredCount }: ResumeBannerProps) {
  return (
    <section className="exam-resume" aria-label={EXAM_TEXTS["R3-01"]} data-testid="resume-banner">
      <p>
        <strong>{EXAM_TEXTS["R3-01"]}</strong>
      </p>
      <p>{examTextResumeAnswered(answeredCount)}</p>
      <Link className="exam-button" href={`/exam/${sessionId}`} data-testid="resume-link">
        {EXAM_TEXTS["B-09"]}
      </Link>
      <p className="exam-muted">{EXAM_TEXTS["R3-02"]}</p>
    </section>
  );
}
