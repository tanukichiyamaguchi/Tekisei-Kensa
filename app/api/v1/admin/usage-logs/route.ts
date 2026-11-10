// GET /api/v1/admin/usage-logs（利用履歴。04 §5.8、11-2 §3.8）。クエリは受け取らない（付いていても無視する）。
// 送信済みの全件を回答日時の新しい順に返す
import { requireAdmin } from "@/lib/auth/admin-context";
import type { UsageLogListDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";
import { listUsageLogs } from "@/lib/services/usage-log-list";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/usage-logs", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<UsageLogListDto>(meta, await listUsageLogs(ctx));
  });
}
