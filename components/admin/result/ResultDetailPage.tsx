// M-05 結果詳細の本文（06 §3.5）。比較に依存しない部分はサーバで描き、比較依存の部品だけを Client にする。
// セクション 1〜6 は PDF の印刷用ページと共用する ResultSections（07 §9.4）
import Link from "next/link";
import { Suspense } from "react";

import { AiAnalysisHeaderButton, AiAnalysisProvider, AiAnalysisSection } from "./AiAnalysisSection";
import { PopulationSummary } from "./ComparisonParts";
import { ComparisonProvider } from "./ComparisonProvider";
import { ComparisonScopeSelect } from "./ComparisonScopeSelect";
import { DownloadButton } from "./DownloadDialog";
import { ResultSections } from "./ResultSections";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { ADMIN_TEXTS, RESPONDENT_KIND_LABELS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export function ResultDetailPage(props: { readonly detail: ResultDetailDto }) {
  const { detail } = props;
  const { respondent } = detail;

  return (
    <ComparisonProvider resultId={detail.resultId}>
      <AiAnalysisProvider resultId={detail.resultId} initial={detail.aiAnalysis}>
        <div className="result-detail">
          <Link href="/admin" className="back-link">
            ← {ADMIN_TEXTS.backToResults}
          </Link>
          <div className="result-header">
            <h1>{ADMIN_TEXTS.resultTitle(respondent.name)}</h1>
            <div className="result-header__actions">
              <Suspense>
                <ComparisonScopeSelect />
              </Suspense>
              <DownloadButton resultId={detail.resultId} />
              <AiAnalysisHeaderButton />
            </div>
          </div>
          <p className="result-subline">
            {RESPONDENT_KIND_LABELS[respondent.kind]} ／{" "}
            {getOccupationLabel(respondent.occupationCode)} ／ 回答日時{" "}
            {formatDateTime(detail.submittedAt)} <PopulationSummary />
          </p>

          <ResultSections detail={detail} variant="screen" />

          {/* セクション 7 AI 解説 */}
          <AiAnalysisSection />
        </div>
      </AiAnalysisProvider>
    </ComparisonProvider>
  );
}
