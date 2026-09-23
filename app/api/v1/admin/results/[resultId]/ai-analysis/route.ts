// POST/GET /api/v1/admin/results/{resultId}/ai-analysis（AI 解説。04 §5.9、§7.1）
import { requireAdmin } from "@/lib/auth/admin-context";
import { generateAiAnalysis, getAiAnalysisState } from "@/lib/services/ai-analysis";
import type { AiAnalysisDto } from "@/lib/services/dto/result";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";
// 同期方式。provider の 240 秒（04 D04-38）の外側（04 §2.9）
export const maxDuration = 300;

const ROUTE = "/api/v1/admin/results/[resultId]/ai-analysis";

type Params = { params: Promise<{ resultId: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(request, ROUTE, async (meta) => {
    const { resultId } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<AiAnalysisDto>(meta, await generateAiAnalysis(ctx, resultId));
  });
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handle(request, ROUTE, async (meta) => {
    const { resultId } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<AiAnalysisDto>(meta, await getAiAnalysisState(ctx, resultId));
  });
}
