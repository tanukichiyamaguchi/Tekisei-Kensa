// R-03 受験画面（11-1 §2.4）。/exam/{sessionId}/questions（ステップ番号は URL に入れない）。
// 表示するステップは、保存済みの回答のうち未回答の設問がある最初のステップ（11-1 §2.4.8、K-41）
import { redirect } from "next/navigation";

import { ExamErrorView } from "@/components/respondent/ExamErrorView";
import { QuestionForm } from "@/components/respondent/QuestionForm";
import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";
import { EXAM_STEPS } from "@/lib/presentation/exam-steps";

export default async function QuestionsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await guardRespondentPage(sessionId, "questions");
  // セッションの検証は questions/layout.tsx が先に行う。ここに来るのは検証の直後に失効した場合だけ
  if (result.kind === "error") return <ExamErrorView kind={result.error} />;
  if (result.kind === "redirect") redirect(result.to);
  return (
    <QuestionForm
      sessionId={sessionId}
      steps={EXAM_STEPS}
      initialStepNo={result.currentStepNo}
      savedAnswers={result.session.answers}
    />
  );
}
