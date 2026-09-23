// POST /api/v1/admin/organization/invite-token（管理者追加用リンクの再発行。04 §5.2）。本文なし
import { requireAdmin } from "@/lib/auth/admin-context";
import { rotateInviteToken } from "@/lib/services/admin-account";
import type { InviteRotatedDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/organization/invite-token", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<InviteRotatedDto>(meta, await rotateInviteToken(ctx));
  });
}
