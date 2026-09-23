// PDF 生成の入出力（07 §9.8）。ヘッダー・フッターの文言は印刷用ページが描く（templates.ts）
import type { PdfMode } from "./visibility";
import type { ComparisonScope } from "@/lib/scoring/types";

export interface RenderResultPdfArgs {
  readonly origin: string; // 自分自身の公開オリジン。appBaseUrl()（01 §4.3）の値（07 §9.13）
  readonly resultId: string;
  readonly mode: PdfMode;
  readonly scope: ComparisonScope | null;
  readonly token: string; // issuePdfToken の戻り値（04 §7.2）
  readonly signal?: AbortSignal; // 全体の打ち切り（サービスが 90 秒で発火。07 §9.10）
}

export interface RenderedPdf {
  readonly bytes: Uint8Array;
  readonly pageCount: number | null; // 取得できる場合のみ
  readonly elapsedMs: number;
}
