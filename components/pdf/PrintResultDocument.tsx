// PDF の本文（07 §9.4、§9.5）。結果詳細と同じ部品・同じ順序（セクション 1〜7）で、操作要素を除いて描く
import { PrintReadyProvider } from "./PrintReadyMarker";
import { AiAnalysisBody } from "@/components/admin/result/AiAnalysisBody";
import { PopulationSummary } from "@/components/admin/result/ComparisonParts";
import { ComparisonProvider } from "@/components/admin/result/ComparisonProvider";
import { PRINT_RADAR_COUNT, ResultSections } from "@/components/admin/result/ResultSections";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { buildPageMarginCss } from "@/lib/pdf/templates";
import { ADMIN_TEXTS, RESPONDENT_KIND_LABELS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { PrintData } from "@/lib/services/print-data";

export function PrintResultDocument(props: {
  readonly data: PrintData;
  /** 出力日時（フッター） */
  readonly generatedAt: Date;
}) {
  const { detail, comparison, visibility, mode } = props.data;
  const { respondent } = detail;
  const latest = detail.aiAnalysis.latest;
  // ヘッダー・フッター（07 §9.5）。値は cssString でエスケープ済み
  const pageMarginCss = buildPageMarginCss({
    headerText: ADMIN_TEXTS.resultTitle(respondent.name),
    submittedAtText: formatDateTime(detail.submittedAt),
    generatedAtText: formatDateTime(props.generatedAt.toISOString()),
    mode,
  });
  return (
    <ComparisonProvider resultId={detail.resultId} initialComparison={comparison}>
      <style dangerouslySetInnerHTML={{ __html: pageMarginCss }} />
      <PrintReadyProvider expectedCharts={PRINT_RADAR_COUNT}>
        <div className="result-detail" data-print-mode={mode}>
          <h1>{ADMIN_TEXTS.resultTitle(respondent.name)}</h1>
          <p className="result-subline">
            {RESPONDENT_KIND_LABELS[respondent.kind]} ／{" "}
            {getOccupationLabel(respondent.occupationCode)} ／ 回答日時{" "}
            {formatDateTime(detail.submittedAt)} <PopulationSummary />
          </p>

          <ResultSections detail={detail} variant="print" visibility={visibility} />

          {/* セクション 7 AI 解説（completed かつ full のときのみ。07 D07-15） */}
          {visibility.showAiAnalysis && latest ? (
            <section className="result-section" aria-labelledby="section-ai">
              <h2 id="section-ai">AI 解説</h2>
              <div className="panel">
                <AiAnalysisBody output={latest.output} generatedAt={latest.generatedAt} />
              </div>
            </section>
          ) : null}
        </div>
      </PrintReadyProvider>
    </ComparisonProvider>
  );
}
