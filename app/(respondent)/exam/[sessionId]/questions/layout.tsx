// 受験画面（questions/page.tsx）と M7 より前の URL のリダイレクト（questions/[...legacy]/page.tsx）の前段でセッションを検証する
// （11-1 §2.1.2）。ここで notFound() すると、親の [sessionId]/not-found.tsx（R-06 session_unavailable、404）が表示される
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { loadRespondentSession } from "@/lib/auth/respondent-page-guard";

export default async function QuestionsLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!(await loadRespondentSession(sessionId))) notFound();
  return children;
}
