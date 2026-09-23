// PUT /api/v1/respondent/sessions/{sessionId}/answers（1 ページ分の回答の上書き保存。04 §4.4）
import { requireRespondentSession } from "@/lib/auth/respondent-session";
import { saveAnswers } from "@/lib/services/answer-saving";
import type { AnswersSavedDto } from "@/lib/services/dto/respondent";
import { handle, json, readJson } from "@/lib/services/http";
import { respondentCookieToken, setRespondentCookie } from "@/lib/services/respondent-cookie";
import { saveAnswersInputSchema } from "@/lib/services/schemas/respondent";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/respondent/sessions/[sessionId]/answers", async (meta) => {
    const { sessionId } = await params;
    const ctx = await requireRespondentSession(request, sessionId, { meta });
    const input = await readJson(request, (v) => saveAnswersInputSchema.parse(v));
    const { dto, tokenExpiresAt } = await saveAnswers(ctx, input);
    return setRespondentCookie(
      json<AnswersSavedDto>(meta, dto),
      respondentCookieToken(request),
      tokenExpiresAt,
    );
  });
}
