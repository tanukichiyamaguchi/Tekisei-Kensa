// POST /api/v1/respondent/sessions/{sessionId}/submit（送信・採点・結果保存。04 §4.5）。本文なし
// Cookie は削除も延長もしない（完了画面が GET …/sessions/{sessionId} で状態を確認するため）
import { requireRespondentSession } from "@/lib/auth/respondent-session";
import type { SessionSubmittedDto } from "@/lib/services/dto/respondent";
import { handle, json } from "@/lib/services/http";
import { submitSession } from "@/lib/services/submission";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/respondent/sessions/[sessionId]/submit", async (meta) => {
    const { sessionId } = await params;
    const ctx = await requireRespondentSession(request, sessionId, { meta });
    return json<SessionSubmittedDto>(meta, await submitSession(ctx));
  });
}
