// GET /api/v1/admin/classification（組織内分類。04 §5.7、11-3 §3.2）。クエリは読まない（11-3 §3.2。includeExcluded は
// 廃止し、付いていても無視する。422 にしない）
import { requireAdmin } from "@/lib/auth/admin-context";
import { getClassification } from "@/lib/services/classification";
import type { ClassificationDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/classification", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<ClassificationDto>(meta, await getClassification(ctx));
  });
}
