// M7 より前の受験画面の URL（/exam/{sessionId}/questions/{ページ番号} など）。新しい受験画面へリダイレクトする
// （公開の時点で受験中の人のため。11-1 §2.1.1・§3.6）。Cookie が無効なときは、先に questions/layout.tsx のセッションの検証が
// R-06（session_unavailable）を出す。有効なときの判定はリダイレクト先で行う
import { redirect } from "next/navigation";

import { examPaths } from "@/lib/auth/respondent-page-guard";

export default async function LegacyQuestionsPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string; legacy: string[] }>;
}) {
  const { sessionId } = await params;
  redirect(examPaths.questions(sessionId));
}
