// R-02 診断開始（05 §5.2、§11.2）。開始済みなら再開位置へ、送信済みなら完了画面へ
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
