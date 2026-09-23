// GET /api/v1/admin/usage-logs（利用履歴。04 §5.8）
import { requireAdmin } from "@/lib/auth/admin-context";
import type { PagedDto, UsageLogItemDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";
import { listUsageLogsQuerySchema } from "@/lib/services/schemas/admin-results";
import { listUsageLogs } from "@/lib/services/usage-log-list";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/usage-logs", async (meta) => {
    const query = listUsageLogsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const ctx = await requireAdmin(request, meta);
    return json<PagedDto<UsageLogItemDto>>(meta, await listUsageLogs(ctx, query));
  });
}
