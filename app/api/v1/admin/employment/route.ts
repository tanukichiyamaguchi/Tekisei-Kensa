// GET /api/v1/admin/employment（在籍・退職。04 §5.7、11-3 §3.3）。クエリは読まない（付いていても無視し、422 にしない）
import { requireAdmin } from "@/lib/auth/admin-context";
import { getEmployment } from "@/lib/services/classification";
import type { EmploymentDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/employment", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<EmploymentDto>(meta, await getEmployment(ctx));
  });
}
