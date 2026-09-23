// R-03 設問（05 §5.3、§11.3）。/exam/{sessionId}/questions/{page}（page は通しページ番号 1〜20）
import { notFound, redirect } from "next/navigation";

import { ExamErrorView } from "@/components/respondent/ExamErrorView";
import { QuestionPage } from "@/components/respondent/QuestionPage";
import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";
import {
  EXAM_QUESTION_COUNT,
  EXAM_STEP_COUNT,
  getExamPage,
  parseExamPageNo,
} from "@/lib/presentation/exam-pages";

export default async function QuestionsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string; page: string }>;
}) {
  const { sessionId, page } = await params;
  const pageNo = parseExamPageNo(page);
  if (pageNo === null) notFound(); // page_not_found（[page]/not-found.tsx）
  const result = await guardRespondentPage(sessionId, { pageNo });
  // セッションの検証は questions/layout.tsx が先に行う。ここに来るのは検証直後に失効した場合だけ
  if (result.kind === "error") return <ExamErrorView kind={result.error} />;
  if (result.kind === "redirect") redirect(result.to);
  return (
    <QuestionPage
      key={pageNo}
      sessionId={sessionId}
      page={getExamPage(pageNo)}
      savedAnswers={result.session.answers}
      totalCount={EXAM_QUESTION_COUNT}
      stepCount={EXAM_STEP_COUNT}
    />
  );
}
