// PDF 生成の失敗（07 §9.8、§9.10）。reason は 500 PDF_GENERATION_FAILED の details.reason に載る
export const PDF_FAILURE_REASONS = [
  "browser_launch_failed",
  "print_page_unavailable",
  "chart_timeout",
  "pdf_timeout",
  "aborted",
] as const;
export type PdfFailureReason = (typeof PDF_FAILURE_REASONS)[number];

/** message に印刷用 URL（トークンを含む）や氏名を載せない */
export class PdfGenerationError extends Error {
  override readonly name = "PdfGenerationError";

  constructor(
    readonly reason: PdfFailureReason,
    message: string,
  ) {
    super(message);
  }
}
