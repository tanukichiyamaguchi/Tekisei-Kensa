// U-17（08 §3.2.2）: lib/pdf/render-result-pdf.ts。launchBrowser を vi.mock で差し替える（07 §9.8、§9.10）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfGenerationError } from "@/lib/pdf/errors";
import type { RenderResultPdfArgs } from "@/lib/pdf/types";

vi.mock("@/lib/pdf/browser", () => ({ launchBrowser: vi.fn() }));
vi.mock("@/lib/pdf/protection-bypass", () => ({ protectionBypassHeaders: () => ({}) }));

const { launchBrowser } = await import("@/lib/pdf/browser");
const { renderResultPdf, PRINT_READY_SELECTOR } = await import("@/lib/pdf/render-result-pdf");

const PDF_BYTES = Buffer.from(
  "%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Pages >> endobj",
);

interface FakeOptions {
  readonly status?: number;
  readonly waitFails?: boolean;
  readonly pdfFails?: boolean;
  readonly gotoHangs?: boolean;
}

function fakeBrowser(options: FakeOptions = {}) {
  // puppeteer はブラウザを閉じると進行中のナビゲーションを失敗させる
  let rejectPending: (error: Error) => void = () => undefined;
  const closed = new Promise<never>((_resolve, reject) => {
    rejectPending = reject;
  });
  closed.catch(() => undefined);
  const page = {
    setViewport: vi.fn(async () => undefined),
    setExtraHTTPHeaders: vi.fn(async () => undefined),
    goto: vi.fn(async () => {
      if (options.gotoHangs) await closed;
      return { ok: () => (options.status ?? 200) < 400, status: () => options.status ?? 200 };
    }),
    waitForSelector: vi.fn(async () => {
      if (options.waitFails) throw new Error("Waiting for selector timed out");
      return {};
    }),
    evaluate: vi.fn(async () => undefined),
    pdf: vi.fn(async () => {
      if (options.pdfFails) throw new Error("Timed out after 20000 ms");
      return PDF_BYTES;
    }),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {
      rejectPending(new Error("Navigating frame was detached"));
    }),
  };
  vi.mocked(launchBrowser).mockResolvedValue(browser as never);
  return { browser, page };
}

const args = (overrides: Partial<RenderResultPdfArgs> = {}): RenderResultPdfArgs => ({
  origin: "http://localhost:3000",
  resultId: "Res1",
  mode: "full",
  scope: { kind: "organization" },
  token: "secret-token.signature",
  ...overrides,
});

async function failure(promise: Promise<unknown>): Promise<PdfGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PdfGenerationError);
    return error as PdfGenerationError;
  }
  throw new Error("例外が投げられませんでした");
}

const logged: string[] = [];
beforeEach(() => {
  logged.length = 0;
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...a: unknown[]) => {
      logged.push(a.map(String).join(" "));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(launchBrowser).mockReset();
});

describe("U-17 renderResultPdf", () => {
  it("成功: page.pdf の引数が 07 §9.5 の値、待ち合わせの順序、browser.close 1 回、URL をログに出さない", async () => {
    const { browser, page } = fakeBrowser();
    const rendered = await renderResultPdf(args());
    expect(Buffer.from(rendered.bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(rendered.pageCount).toBe(1);
    expect(page.setViewport).toHaveBeenCalledWith({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2,
    });
    const [url, gotoOptions] = page.goto.mock.calls[0] as unknown as [string, object];
    expect(url).toBe(
      "http://localhost:3000/admin/results/Res1/print?mode=full&scope=organization&token=secret-token.signature",
    );
    expect(gotoOptions).toEqual({ waitUntil: "networkidle0", timeout: 30_000 });
    expect(page.waitForSelector).toHaveBeenCalledWith(PRINT_READY_SELECTOR, { timeout: 20_000 });
    const pdfOptions = (page.pdf.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(pdfOptions).toMatchObject({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
      // ヘッダー・フッターは印刷用ページの @page マージンボックスで描く（templates.ts）
      displayHeaderFooter: false,
      timeout: 20_000,
    });
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(logged.join("\n")).not.toContain("secret-token");
  });

  it("印刷用ページが 500 → print_page_unavailable", async () => {
    const { browser } = fakeBrowser({ status: 500 });
    const error = await failure(renderResultPdf(args()));
    expect(error.reason).toBe("print_page_unavailable");
    expect(error.message).not.toContain("secret-token");
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("data-print-ready が付かない → chart_timeout", async () => {
    const { browser } = fakeBrowser({ waitFails: true });
    expect((await failure(renderResultPdf(args()))).reason).toBe("chart_timeout");
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("page.pdf のタイムアウト → pdf_timeout", async () => {
    const { browser } = fakeBrowser({ pdfFails: true });
    expect((await failure(renderResultPdf(args()))).reason).toBe("pdf_timeout");
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("signal の発火 → aborted（処理中・開始前）", async () => {
    const { browser } = fakeBrowser({ gotoHangs: true });
    const controller = new AbortController();
    const pending = renderResultPdf(args({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);
    expect((await failure(pending)).reason).toBe("aborted");
    expect(browser.close).toHaveBeenCalled();

    const aborted = new AbortController();
    aborted.abort();
    vi.mocked(launchBrowser).mockClear();
    expect((await failure(renderResultPdf(args({ signal: aborted.signal })))).reason).toBe(
      "aborted",
    );
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("起動失敗 → browser_launch_failed をそのまま返す", async () => {
    vi.mocked(launchBrowser).mockRejectedValue(
      new PdfGenerationError("browser_launch_failed", "PDF_CHROMIUM_EXECUTABLE_PATH is not set"),
    );
    expect((await failure(renderResultPdf(args()))).reason).toBe("browser_launch_failed");
  });
});
