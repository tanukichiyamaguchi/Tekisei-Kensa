// POST /auth/invite（招待リンクによる管理者追加）。04 §6.3
import type { InviteAcceptedDto } from "@/lib/services/dto/admin";
import { handle, json, readJson } from "@/lib/services/http";
import { acceptInvite } from "@/lib/services/invite-acceptance";
import { acceptInviteInputSchema } from "@/lib/services/schemas/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handle(request, "/auth/invite", async (meta) => {
    const input = await readJson(request, (v) => acceptInviteInputSchema.parse(v));
    return json<InviteAcceptedDto>(meta, await acceptInvite(input, meta));
  });
}
