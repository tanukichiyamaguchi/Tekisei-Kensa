// R-05 完了（05 §5.5、§11.4）。未送信なら /exam/{sessionId} へ
import { notFound, redirect } from "next/navigation";

import { CompleteView } from "@/components/respondent/CompleteView";
import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";

export default async function CompletePage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await guardRespondentPage(sessionId, "complete");
  if (result.kind === "error") notFound(); // session_unavailable（[sessionId]/not-found.tsx）
  if (result.kind === "redirect") redirect(result.to);
  return <CompleteView />;
}
