// POST /api/v1/respondent/sessions/{sessionId}/start（「開始する」の記録。04 §4.3）。本文なし
import { requireRespondentSession } from "@/lib/auth/respondent-session";
import type { SessionStartedDto } from "@/lib/services/dto/respondent";
import { handle, json } from "@/lib/services/http";
import { respondentCookieToken, setRespondentCookie } from "@/lib/services/respondent-cookie";
import { startSession } from "@/lib/services/session-progress";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/respondent/sessions/[sessionId]/start", async (meta) => {
    const { sessionId } = await params;
    const ctx = await requireRespondentSession(request, sessionId, { meta });
    const { dto, tokenExpiresAt } = await startSession(ctx);
    // 同じトークンを延長後の期限で再発行する（D04-45）
    return setRespondentCookie(
      json<SessionStartedDto>(meta, dto),
      respondentCookieToken(request),
      tokenExpiresAt,
    );
  });
}
