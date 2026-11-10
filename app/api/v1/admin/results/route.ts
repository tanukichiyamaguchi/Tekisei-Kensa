// GET /api/v1/admin/results（回答一覧の全行。04 §5.3、11-2 §3.5）。クエリは受け取らない（付いていても無視する）。
// 検索・絞り込み・並び替え・表示の上限は画面で行う
import { requireAdmin } from "@/lib/auth/admin-context";
import type { ResultListDto } from "@/lib/services/dto/admin";
import { handle, json } from "@/lib/services/http";
import { listResultRows } from "@/lib/services/result-list";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/results", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<ResultListDto>(meta, await listResultRows(ctx));
  });
}
