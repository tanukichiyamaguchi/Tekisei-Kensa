// POST/GET /api/v1/admin/results/{resultId}/ai-analysis/{kind}（AI 解説の種類ごとの生成と状態。11-6 §3.4・§3.5。04 §5.9、§7.1）。
// kind は recruitment・training・longitudinal。要求の本文は育成・定着だけが読む（context の 8 項目。Content-Type が JSON でなければ
// 415、JSON として読めなければ 400、形が違えば 422）。採用向けと経年比較は本文を読まない（あっても読まない。経年比較の前回は
// PR-7.11b）
import { requireAdmin } from "@/lib/auth/admin-context";
import { isAiAnalysisKind, type AiAnalysisKind } from "@/lib/ai/kinds";
import { generateAi, getAiState } from "@/lib/services/ai-analysis";
import type { AiKindResponse } from "@/lib/services/dto/ai";
import { API_ERRORS } from "@/lib/services/errors";
import { handle, json, readJson } from "@/lib/services/http";

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
    const { resultId, kind: rawKind } = await params;
    const ctx = await requireAdmin(request, meta);
    const kind = kindOf(rawKind);
    // 本文の形の検証（422）は generateAi の手順 1（11-6 §3.5）
    const body = kind === "training" ? await readJson(request, (v) => v) : undefined;
    return json<AiKindResponse>(meta, await generateAi(ctx, resultId, kind, body));
  });
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  return handle(request, ROUTE, async (meta) => {
    const { resultId, kind } = await params;
    const ctx = await requireAdmin(request, meta);
    return json<AiKindResponse>(meta, await getAiState(ctx, resultId, kindOf(kind)));
  });
}
