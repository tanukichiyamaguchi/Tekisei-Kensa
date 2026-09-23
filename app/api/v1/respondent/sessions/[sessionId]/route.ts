// GET /api/v1/respondent/sessions/{sessionId}（進行状態と保存済み回答。04 §4.3）
import { requireRespondentSession } from "@/lib/auth/respondent-session";
import type { SessionProgressDto } from "@/lib/services/dto/respondent";
import { handle, json } from "@/lib/services/http";
import { getSessionProgress } from "@/lib/services/session-progress";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/respondent/sessions/[sessionId]", async (meta) => {
    const { sessionId } = await params;
    const ctx = await requireRespondentSession(request, sessionId, { meta });
    return json<SessionProgressDto>(meta, await getSessionProgress(ctx));
  });
}
