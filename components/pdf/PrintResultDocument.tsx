// PDF の本文（07 §9.4、§9.5、11-4 §2.18、11-5 §2.5.3〜§2.5.5）。結果詳細と同じ部品を印刷の形（ResultDetailBody の variant="print"）で
// 描く: 見出しの塊は「類似分析」「ダウンロード」のボタンを描かずに詰め、比較組織は動かない箱、目次は固定しない形、AI 解説の領域（全画面の
// PDF で生成済みのときだけ。07 D07-15）は目次と新しいレイアウトの間、新しいレイアウトは概要〜接し方の 7 セクション（育て方の左のカードは
// 留めない）。非表示の PDF は visibility で評価の箱・合致度のカード・注意したいリスクのカード・リスクのセクションと目次の「リスク」を
// 描かない。画面の状態は既定（すべて開く・点数の高い順・第二候補を出さない・接し方のタブはドライビング。画面の状態を PDF に写すのは
// 11-5 の PR-7.12）、比較の状態は今の initialComparison（比較ありか未選択）。グラフはすべて SVG で描くので、描画完了を待つグラフは無い
// （expectedCharts は 0。印 data-print-ready はハイドレーションの後の次のフレームで付く。07 §9.6。作り直しは PR-7.12）
import { PrintReadyProvider } from "./PrintReadyMarker";
import { AiAnalysisBody } from "@/components/admin/result/AiAnalysisBody";
import { ComparisonProvider } from "@/components/admin/result/ComparisonProvider";
import { ResultDetailBody } from "@/components/admin/result/ResultDetailBody";
import { buildPageMarginCss } from "@/lib/pdf/templates";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import { buildResultDetailView } from "@/lib/presentation/result-detail-view";
import type { PrintData } from "@/lib/services/print-data";

export function PrintResultDocument(props: {
  readonly data: PrintData;
  /** 出力日時（フッター） */
  readonly generatedAt: Date;
}) {
  const { detail, comparison, visibility, mode } = props.data;
  const view = buildResultDetailView(detail);
  const latest = detail.aiAnalysis.latest;
  // ヘッダー・フッター（07 §9.5）。値は cssString でエスケープ済み
  const pageMarginCss = buildPageMarginCss({
    headerText: ADMIN_TEXTS.resultTitle(detail.respondent.name),
    submittedAtText: formatDateTime(detail.submittedAt),
    generatedAtText: formatDateTime(props.generatedAt.toISOString()),
    mode,
  });
  return (
    <ComparisonProvider resultId={detail.resultId} initialComparison={comparison}>
      <style dangerouslySetInnerHTML={{ __html: pageMarginCss }} />
      <PrintReadyProvider expectedCharts={0}>
        <div className="result-detail" data-print-mode={mode}>
          <ResultDetailBody
            view={view}
            variant="print"
            visibility={visibility}
            aiArea={
              visibility.showAiAnalysis && latest ? (
                <section id="ai" className="result-section" aria-labelledby="section-ai">
                  <h2 id="section-ai">AI 解説</h2>
                  <div className="panel">
                    <AiAnalysisBody output={latest.output} generatedAt={latest.generatedAt} />
                  </div>
                </section>
              ) : undefined
            }
          />
        </div>
      </PrintReadyProvider>
    </ComparisonProvider>
  );
}
