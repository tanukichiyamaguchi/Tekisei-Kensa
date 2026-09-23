// POST /api/v1/respondent/sessions（受検者登録とセッション作成。04 §4.2）
import type { SessionCreatedDto } from "@/lib/services/dto/respondent";
import { handle, json, readJson } from "@/lib/services/http";
import { setRespondentCookie } from "@/lib/services/respondent-cookie";
import { registerRespondent } from "@/lib/services/respondent-registration";
import { registerRespondentInputSchema } from "@/lib/services/schemas/respondent";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handle(request, "/api/v1/respondent/sessions", async (meta) => {
    const input = await readJson(request, (v) => registerRespondentInputSchema.parse(v));
    const { dto, issued } = await registerRespondent(input, meta);
    // 生のトークンは Cookie だけで返す（00 D-32）
    return setRespondentCookie(
      json<SessionCreatedDto>(meta, dto, { status: 201 }),
      issued.token,
      issued.expiresAt,
    );
  });
}
