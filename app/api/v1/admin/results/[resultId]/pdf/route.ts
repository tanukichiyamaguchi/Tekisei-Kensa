// GET /api/v1/admin/results/{resultId}/pdf（PDF 出力。04 §5.10、§7.2）。生成したバイト列をそのまま返す（07 D07-21）
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin-context";
import { handle } from "@/lib/services/http";
import { exportPdf } from "@/lib/services/pdf-export";
import { comparisonScopeQuerySchema, pdfModeSchema } from "@/lib/services/schemas/common";

export const runtime = "nodejs";
// Chromium の起動と印刷用ページの描画を同期で待つ（04 §2.9、07 §9.10）
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resultId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/admin/results/[resultId]/pdf", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    const { resultId } = await params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const { mode } = z.object({ mode: pdfModeSchema }).parse({ mode: query.mode });
    const scope =
      query.scope === undefined && query.teamCode === undefined
        ? null
        : comparisonScopeQuerySchema.parse({ scope: query.scope, teamCode: query.teamCode });
    const pdf = await exportPdf(ctx, { resultId, mode, scope });
    return new Response(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Content-Length": String(pdf.bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Request-Id": meta.requestId,
      },
    });
  });
}
