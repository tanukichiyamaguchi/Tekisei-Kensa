// 印刷用ページを Chromium で開いて A4 縦の PDF にする（07 §9.3、§9.5、§9.6、§9.10）
import type { Browser } from "puppeteer-core";

import { launchBrowser } from "./browser";
import { PdfGenerationError, type PdfFailureReason } from "./errors";
import { buildPrintUrl } from "./print-url";
import { protectionBypassHeaders } from "./protection-bypass";
import type { RenderedPdf, RenderResultPdfArgs } from "./types";

export const NAVIGATION_TIMEOUT_MS = 30_000;
export const CHART_READY_TIMEOUT_MS = 20_000;
export const PDF_TIMEOUT_MS = 20_000;
/** PrintReadyMarker が描画完了を示す属性（07 §9.6） */
export const PRINT_READY_SELECTOR = 'html[data-print-ready="true"]';

/** A4 @ 96dpi（07 §9.5） */
const VIEWPORT = { width: 794, height: 1123, deviceScaleFactor: 2 } as const;
const MARGIN = { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } as const;

async function step<T>(reason: PdfFailureReason, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PdfGenerationError) throw error;
    const name = error instanceof Error ? error.constructor.name : typeof error;
    throw new PdfGenerationError(reason, `${reason}: ${name}`);
  }
}

function countPages(bytes: Uint8Array): number | null {
  // PDF のページオブジェクト（/Type /Page）の数。取得できない場合は null
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return matches ? matches.length : null;
}

export async function renderResultPdf(args: RenderResultPdfArgs): Promise<RenderedPdf> {
  const startedAt = Date.now();
  if (args.signal?.aborted) throw new PdfGenerationError("aborted", "aborted before launch");
  const browser: Browser = await launchBrowser();
  const onAbort = () => {
    void browser.close();
  };
  args.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const run = async (): Promise<RenderedPdf> => {
      const page = await step("print_page_unavailable", () => browser.newPage());
      await step("print_page_unavailable", async () => {
        await page.setViewport(VIEWPORT);
        await page.setExtraHTTPHeaders(protectionBypassHeaders());
      });
      const url = buildPrintUrl(args.origin, args.resultId, args.mode, args.scope, args.token);
      const res = await step("print_page_unavailable", () =>
        page.goto(url, { waitUntil: "networkidle0", timeout: NAVIGATION_TIMEOUT_MS }),
      );
      if (!res || !res.ok()) {
        throw new PdfGenerationError(
          "print_page_unavailable",
          `print page status ${res?.status() ?? "none"}`,
        );
      }
      await step("chart_timeout", async () => {
        await page.waitForSelector(PRINT_READY_SELECTOR, { timeout: CHART_READY_TIMEOUT_MS });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
      });
      const pdf = await step("pdf_timeout", () =>
        page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margin: MARGIN,
          // ヘッダー・フッターは印刷用ページの @page マージンボックス（templates.ts）で描く
          displayHeaderFooter: false,
          timeout: PDF_TIMEOUT_MS,
        }),
      );
      const bytes = new Uint8Array(pdf);
      return { bytes, pageCount: countPages(bytes), elapsedMs: Date.now() - startedAt };
    };
    try {
      return await run();
    } catch (error) {
      // 中断でブラウザを閉じた場合は、途中の段階の失敗ではなく aborted として返す
      if (args.signal?.aborted) throw new PdfGenerationError("aborted", "aborted");
      throw error;
    }
  } finally {
    args.signal?.removeEventListener("abort", onAbort);
    // 関数の再利用時にプロセスを残さない
    await browser.close().catch(() => undefined);
  }
}
