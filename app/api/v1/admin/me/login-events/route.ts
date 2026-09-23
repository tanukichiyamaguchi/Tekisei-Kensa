// POST /api/v1/admin/me/login-events（admin.login の記録。04 §5.1 D04-24）
import { requireAdmin } from "@/lib/auth/admin-context";
import { recordLoginEvent } from "@/lib/services/admin-account";
import { empty, handle } from "@/lib/services/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/me/login-events", async (meta) => {
    await recordLoginEvent(await requireAdmin(request, meta));
    return empty(meta, 204);
  });
}
