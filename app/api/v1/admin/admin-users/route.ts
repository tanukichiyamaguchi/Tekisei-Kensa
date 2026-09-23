// GET /api/v1/admin/admin-users（同一組織の管理者一覧。04 §5.11）
import { requireAdmin } from "@/lib/auth/admin-context";
import { listAdminUsers } from "@/lib/services/admin-account";
import type { AdminUserListDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/admin-users", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<AdminUserListDto>(meta, await listAdminUsers(ctx));
  });
}
