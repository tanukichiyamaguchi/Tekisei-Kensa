// M-05 結果詳細（06 §3.5、11-4 §2.1・§3.6、11-6 §3.7.6・§3.9）。結果詳細は Server Component で 1 回取得し、比較はブラウザから GET …/comparison を
// 1 本呼ぶ（D06-28）。枠はサイドメニューと共通ヘッダーを出さない frame: "detail"。画面の値は buildResultDetailView でサーバで組み立てて渡す
// （文言マスタの全体をブラウザに送らない。11-4 §2.21）。AI 解説の領域（11-6 の AiArea）はここで作り、ResultDetailPage を通して
// ResultDetailBody の aiArea に渡す。初めのタブは URL の ai（画面の状態の aiTab）を initialAiTab で出せるタブに選び直したもの。出せるタブが
// 無い（PR-7.11a まで経年比較のタブを出さない間の、表示上の役職が責任者の受験。K-21）ときは領域を作らない（目次の「AI解説」も出ない。
// 11-4 §2.5）。ログインの戻り先（path）は今のまま比較組織（scope・teamCode）だけを残す（ほかの画面の状態と同じく ai を残さない）
import { notFound } from "next/navigation";

import { renderAdminPage } from "@/components/admin/admin-page";
import { AiArea } from "@/components/admin/result/ai/AiArea";
import { ResultDetailPage } from "@/components/admin/result/ResultDetailPage";
import { initialAiTab } from "@/lib/presentation/ai-area";
import {
  toComparisonQuery,
  parseComparisonScope,
} from "@/lib/presentation/comparison-scope-params";
import { buildResultDetailView } from "@/lib/presentation/result-detail-view";
import { decodeResultViewState } from "@/lib/presentation/result-view-state";
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
      const tab = initialAiTab(detail.ai.visibleTabs, decodeResultViewState(query).aiTab);
      const aiArea =
        tab === null ? null : (
          <AiArea resultId={detail.resultId} initial={detail.ai} initialTab={tab} />
        );
      return (
        <ResultDetailPage detail={detail} view={buildResultDetailView(detail)} aiArea={aiArea} />
      );
    },
  });
}
