// M-05 結果詳細の本文（11-4 §2.1・§3.6）。サイドメニューを出さない全画面の枠 ResultDetailFrame の中に、比較（ComparisonProvider。
// 比較 API を 1 本呼ぶ）と AI 解説の状態（AiAnalysisProvider）を置き、新しいレイアウトの本文 ResultDetailBody（見出しの塊・受験情報の
// 1 行・目次・AI 解説の領域・概要〜接し方の 7 セクション）を key={resultId} で描く（別の人の結果に移ると作り直す）。AI 解説の領域 ai には
// PR-7.9 まで今の AiAnalysisSection を置く（見出しの「AI解説を表示」は無くなった。11-6 の ai-04・ai-05）。見出しの「ダウンロード」は
// 今のダイアログを開く（作り直しは 11-5 の PR-7.12）。「類似分析」は PR-7.14 まで出さない
import { AiAnalysisProvider, AiAnalysisSection } from "./AiAnalysisSection";
import { ComparisonProvider } from "./ComparisonProvider";
import { DownloadButton } from "./DownloadDialog";
import { ResultDetailBody } from "./ResultDetailBody";
import { ResultDetailFrame } from "./ResultDetailFrame";
import { ResultIcon } from "./result-icons";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export function ResultDetailPage(props: {
  readonly detail: ResultDetailDto;
  /** buildResultDetailView(detail)（Server Component で組み立てる） */
  readonly view: ResultDetailView;
}) {
  const { detail, view } = props;
  return (
    <ResultDetailFrame>
      <ComparisonProvider resultId={detail.resultId}>
        <AiAnalysisProvider resultId={detail.resultId} initial={detail.aiAnalysis}>
          <ResultDetailBody
            key={detail.resultId}
            view={view}
            variant="screen"
            aiArea={<AiAnalysisSection />}
            headActions={{
              download: (
                <DownloadButton
                  resultId={detail.resultId}
                  className="rd-btn"
                  icon={<ResultIcon name="download" />}
                />
              ),
            }}
          />
        </AiAnalysisProvider>
      </ComparisonProvider>
    </ResultDetailFrame>
  );
}
