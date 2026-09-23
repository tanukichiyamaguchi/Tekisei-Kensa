// GET /api/v1/admin/results/{resultId}/comparison（比較計算。保存しない。04 §5.5）
import { requireAdmin } from "@/lib/auth/admin-context";
import { getComparison } from "@/lib/services/comparison";
import type { ComparisonDto } from "@/lib/services/dto/result";
import { API_ERRORS } from "@/lib/services/errors";
import { handle, json } from "@/lib/services/http";
import { comparisonScopeQuerySchema, docIdSchema } from "@/lib/services/schemas/common";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/admin/results/[resultId]/comparison", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    const { resultId } = await params;
    if (!docIdSchema.safeParse(resultId).success) throw API_ERRORS.notFound();
    const scope = comparisonScopeQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return json<ComparisonDto>(meta, await getComparison(ctx, { resultId, scope }));
  });
}
