// PDF 出力（04 §5.10、§7.2。07 §9.3）。可視性と母集団の確認 → 印刷トークン発行 → lib/pdf で生成 → 監査ログ
import { writeAuditLog } from "./audit";
import { populationEmpty } from "./comparison";
import { ApiError } from "./errors";
import { loadVisibleResult } from "./result-detail";
import type { AdminContext } from "@/lib/auth/admin-context";
import { issuePdfToken } from "@/lib/auth/pdf-token";
import { COLLECTIONS } from "@/lib/db/collections";
import { fetchPopulation } from "@/lib/db/repositories/results-repository";
import { PdfGenerationError } from "@/lib/pdf/errors";
import { renderResultPdf } from "@/lib/pdf/render-result-pdf";
import type { PdfMode } from "@/lib/pdf/visibility";
import type { ComparisonScope } from "@/lib/scoring/types";
import { appBaseUrl } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";

/** 生成全体の打ち切り（07 §9.10。maxDuration 120 秒の内側） */
export const PDF_EXPORT_TIMEOUT_MS = 90_000;

export interface ExportedPdf {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

/** ファイル名に氏名を含めない（04 §5.10、01） */
export function pdfFilename(resultId: string, mode: PdfMode): string {
  return `result-${resultId.slice(0, 8)}-${mode}.pdf`;
}

export async function exportPdf(
  ctx: AdminContext,
  input: {
    readonly resultId: string;
    readonly mode: PdfMode;
    readonly scope: ComparisonScope | null;
  },
  now: Date = new Date(),
): Promise<ExportedPdf> {
  // 1. 対象の可視性（見えなければ 404）
  const result = await loadVisibleResult(ctx, input.resultId);

  // 2. scope 指定時は母集団 0 件を先に 409 にする（Chromium を起動しない。04 D04-35、08 I-46）
  if (input.scope) {
    const population = await fetchPopulation({
      organizationId: ctx.organizationId,
      scope: input.scope,
    });
    if (population.length === 0) throw populationEmpty(input.scope);
  }

  // 3. 印刷トークン（120 秒。04 §7.2）
  const token = issuePdfToken(
    {
      resultId: result.id,
      organizationId: ctx.organizationId,
      adminUid: ctx.uid,
      role: ctx.role,
      mode: input.mode,
      scope: input.scope,
    },
    now,
  );

  // 4. 生成（90 秒で打ち切り）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_EXPORT_TIMEOUT_MS);
  const startedAt = Date.now();
  let bytes: Uint8Array;
  try {
    const rendered = await renderResultPdf({
      origin: appBaseUrl(),
      resultId: result.id,
      mode: input.mode,
      scope: input.scope,
      token,
      signal: controller.signal,
    });
    bytes = rendered.bytes;
    logger.info("pdf.export", {
      resultId: result.id,
      organizationId: ctx.organizationId,
      mode: input.mode,
      scope: input.scope?.kind ?? null,
      status: "completed",
      pageCount: rendered.pageCount,
      bytes: rendered.bytes.byteLength,
      elapsedMs: rendered.elapsedMs,
    });
  } catch (error) {
    const reason = error instanceof PdfGenerationError ? error.reason : "internal_error";
    logger.error("pdf.export", {
      resultId: result.id,
      organizationId: ctx.organizationId,
      mode: input.mode,
      status: "failed",
      reason,
      // PdfGenerationError の message は印刷用 URL（トークン）や氏名を含まない（lib/pdf/errors.ts）
      detail:
        error instanceof PdfGenerationError
          ? error.message
          : error instanceof Error
            ? error.constructor.name
            : typeof error,
      elapsedMs: Date.now() - startedAt,
    });
    throw new ApiError(
      500,
      "PDF_GENERATION_FAILED",
      "PDF の生成に失敗しました。再度お試しください",
      {
        reason,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  // 5. 監査ログ（印刷用ページ側では書かない。04 §7.2）
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "result.pdf_export",
    targetCollection: COLLECTIONS.results,
    targetId: result.id,
    details: {
      mode: input.mode,
      scope: input.scope?.kind ?? null,
      teamCode: input.scope?.kind === "team" ? input.scope.teamCode : null,
    },
    request: ctx.request,
  });

  return { bytes, filename: pdfFilename(result.id, input.mode) };
}
