// GET /api/v1/admin/results（回答一覧。04 §5.3）
import { requireAdmin } from "@/lib/auth/admin-context";
import type { PagedDto, ResultListItemDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";
import { listResults } from "@/lib/services/result-list";
import { listResultsQuerySchema } from "@/lib/services/schemas/admin-results";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/results", async (meta) => {
    const query = listResultsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const ctx = await requireAdmin(request, meta);
    return json<PagedDto<ResultListItemDto>>(meta, await listResults(ctx, query));
  });
}
