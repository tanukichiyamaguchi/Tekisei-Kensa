// M-05 結果詳細の本文（11-4 §2.1・§3.6）。サイドメニューを出さない全画面の枠 ResultDetailFrame の中に、比較（ComparisonProvider。
// 比較 API を 1 本呼ぶ）を置き、新しいレイアウトの本文 ResultDetailBody（見出しの塊・受験情報の 1 行・目次・AI 解説の領域・概要〜接し方の
// 7 セクション）を key={resultId} で描く（別の人の結果に移ると作り直す）。AI 解説の領域 aiArea は結果詳細のページが作った 11-6 の AiArea
// （id ai）で、そのまま ResultDetailBody に渡す（null なら領域も目次の「AI解説」も描かない。PR-7.11a まで、表示上の役職が責任者の受験は
// null。11-6 §4.4）。見出しの「ダウンロード」は今のダイアログを開く（作り直しは 11-5 の PR-7.12）。「類似分析」は PR-7.14 まで出さない
import type { ReactNode } from "react";

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
  /** AI 解説の領域（11-6 の AiArea。描かないときは null） */
  readonly aiArea: ReactNode;
}) {
  const { detail, view } = props;
  return (
    <ResultDetailFrame>
      <ComparisonProvider resultId={detail.resultId}>
        <ResultDetailBody
          key={detail.resultId}
          view={view}
          variant="screen"
          aiArea={props.aiArea}
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
      </ComparisonProvider>
    </ResultDetailFrame>
  );
}
