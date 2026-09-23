// 設問ページの前段でセッションを検証する（05 §1.3）。ここで notFound() すると、親の [sessionId]/not-found.tsx
// （session_unavailable）が表示される。ページ番号の不正（page_not_found）は [page]/not-found.tsx が表示する
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
