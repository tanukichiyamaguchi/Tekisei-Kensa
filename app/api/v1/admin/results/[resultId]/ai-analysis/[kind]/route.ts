// POST/GET /api/v1/admin/results/{resultId}/ai-analysis/{kind}（AI 解説の種類ごとの生成と状態。11-6 §3.4・§3.5。04 §5.9、§7.1）。
// kind は recruitment・training・longitudinal。PR-7.9 は採用向けだけが有効（育成・定着と経年比較の POST は 503 AI_KIND_DISABLED）。
// 要求の本文は読まない（育成・定着の 8 項目と経年比較の前回は PR-7.10・PR-7.11b）
import { requireAdmin } from "@/lib/auth/admin-context";
import { isAiAnalysisKind, type AiAnalysisKind } from "@/lib/ai/kinds";
import { generateAi, getAiState } from "@/lib/services/ai-analysis";
import type { AiKindResponse } from "@/lib/services/dto/ai";
import { API_ERRORS } from "@/lib/services/errors";
import { handle, json } from "@/lib/services/http";

export const runtime = "nodejs";
// 同期方式。provider の 240 秒（04 D04-38）の外側（04 §2.9）
export const maxDuration = 300;

const ROUTE = "/api/v1/admin/results/[resultId]/ai-analysis/[kind]";

type Params = { params: Promise<{ resultId: string; kind: string }> };

/** パスの kind。3 つの種類のどれでもなければ 404 NOT_FOUND（11-6 §3.4） */
function kindOf(kind: string): AiAnalysisKind {
  if (!isAiAnalysisKind(kind)) throw API_ERRORS.notFound();
  return kind;
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(request, ROUTE, async (meta) => {
    const { resultId, kind } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<AiKindResponse>(meta, await generateAi(ctx, resultId, kindOf(kind)));
  });
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handle(request, ROUTE, async (meta) => {
    const { resultId, kind } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<AiKindResponse>(meta, await getAiState(ctx, resultId, kindOf(kind)));
  });
}
