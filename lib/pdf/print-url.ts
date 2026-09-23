// 印刷用ページの URL（07 §9.4、04 §7.2）。トークンを含むため、組み立てた URL をログに出さない
import type { PdfMode } from "./visibility";
import type { ComparisonScope } from "@/lib/scoring/types";

export function buildPrintUrl(
  origin: string,
  resultId: string,
  mode: PdfMode,
  scope: ComparisonScope | null,
  token: string,
): string {
  const url = new URL(`/admin/results/${encodeURIComponent(resultId)}/print`, origin);
  url.searchParams.set("mode", mode);
  if (scope) {
    url.searchParams.set("scope", scope.kind);
    if (scope.kind === "team") url.searchParams.set("teamCode", scope.teamCode);
  }
  url.searchParams.set("token", token);
  return url.toString();
}
