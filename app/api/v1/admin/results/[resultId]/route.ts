// GET /api/v1/admin/results/{resultId}（結果詳細。04 §5.4）
import { requireAdmin } from "@/lib/auth/admin-context";
import type { ResultDetailDto } from "@/lib/services/dto/result";
import { handle, json } from "@/lib/services/http";
import { getResultDetail } from "@/lib/services/result-detail";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/admin/results/[resultId]", async (meta) => {
    const { resultId } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<ResultDetailDto>(meta, await getResultDetail(ctx, resultId));
  });
}
