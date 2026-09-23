// GET /api/v1/admin/classification（組織内分類。04 §5.7）
import { requireAdmin } from "@/lib/auth/admin-context";
import { getClassification } from "@/lib/services/classification";
import type { ClassificationDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";
import { classificationQuerySchema } from "@/lib/services/schemas/admin-results";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/classification", async (meta) => {
    const query = classificationQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const ctx = await requireAdmin(request, meta);
    return json<ClassificationDto>(meta, await getClassification(ctx, query));
  });
}
