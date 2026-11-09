// R-02 診断開始（11-1 §2.3）。開始済みなら受験画面（/exam/{sessionId}/questions）へ、送信済みなら完了画面へ（11-1 §2.1.2）
import { notFound, redirect } from "next/navigation";

import { StartPanel } from "@/components/respondent/StartPanel";
import { guardRespondentPage } from "@/lib/auth/respondent-page-guard";

export default async function StartPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await guardRespondentPage(sessionId, "start");
  if (result.kind === "error") notFound(); // session_unavailable（[sessionId]/not-found.tsx）
  if (result.kind === "redirect") redirect(result.to);
  return <StartPanel sessionId={sessionId} />;
}
