// GET /api/v1/admin/me（04 §5.1）。PATCH は M4 で追加する
import { requireAdmin } from "@/lib/auth/admin-context";
import { getMe } from "@/lib/services/admin-account";
import type { MeDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/me", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<MeDto>(meta, await getMe(ctx));
  });
}
