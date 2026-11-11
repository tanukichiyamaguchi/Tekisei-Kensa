// M-05 結果詳細（06 §3.5、11-4 §2.1・§3.6）。結果詳細は Server Component で 1 回取得し、比較はブラウザから GET …/comparison を 1 本呼ぶ（D06-28）。
// 枠はサイドメニューと共通ヘッダーを出さない frame: "detail"。画面の値は buildResultDetailView でサーバで組み立てて渡す（文言マスタの全体を
// ブラウザに送らない。11-4 §2.21）
import { notFound } from "next/navigation";

import { renderAdminPage } from "@/components/admin/admin-page";
import { ResultDetailPage } from "@/components/admin/result/ResultDetailPage";
import {
  toComparisonQuery,
  parseComparisonScope,
} from "@/lib/presentation/comparison-scope-params";
import { buildResultDetailView } from "@/lib/presentation/result-detail-view";
import { ApiError } from "@/lib/services/errors";
import { getResultDetail } from "@/lib/services/result-detail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResultPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ resultId: string }>;
  readonly searchParams: SearchParams;
}) {
  const { resultId } = await params;
  const query = await searchParams;
  const scopeQuery = toComparisonQuery(
    parseComparisonScope({
      scope: typeof query.scope === "string" ? query.scope : undefined,
      teamCode: typeof query.teamCode === "string" ? query.teamCode : undefined,
    }),
  );
  const path = `/admin/results/${encodeURIComponent(resultId)}${scopeQuery ? `?${scopeQuery}` : ""}`;
  return renderAdminPage({
    path,
    current: "results",
    frame: "detail",
    render: async (ctx) => {
      let detail;
      try {
        detail = await getResultDetail(ctx, resultId);
      } catch (error) {
        // 他組織・削除済み・admin に対する幹部・形式不正は存在を見せない（E-02。06 §1.3）
        if (error instanceof ApiError && error.status === 404) notFound();
        throw error;
      }
      return <ResultDetailPage detail={detail} view={buildResultDetailView(detail)} />;
    },
  });
}
