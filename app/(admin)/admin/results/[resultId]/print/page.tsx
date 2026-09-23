// PDF の印刷用ページ（07 §9.4）。管理者 Cookie を要求せず、クエリの印刷トークンだけで認可する（04 §7.2）。
// 認可・対象の可視性のいずれかに失敗したら 404（トークンの有無で結果の存在を推測させない）。監査ログは書かない
import { notFound } from "next/navigation";

import { PrintResultDocument } from "@/components/pdf/PrintResultDocument";
import { loadPrintData } from "@/lib/services/print-data";

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ resultId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { resultId } = await params;
  const now = new Date();
  const data = await loadPrintData({ resultId, query: await searchParams, now });
  if (!data) notFound();
  return <PrintResultDocument data={data} generatedAt={now} />;
}
