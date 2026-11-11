// 結果詳細の枠（11-4 §2.1・§2.3.1・§3.6）。画面全体に固定した #rd に、上の行（「回答一覧に戻る」と 1 年経過の帯の差し込み口）と、
// スクロールする領域 .rd-scroll と本文 .rd-body を置く。サイドメニューと共通ヘッダーは出さない（renderAdminPage の frame: "detail"）。
// 「回答一覧に戻る」は /admin への next/link のリンクで、状態ごとの色と焦点の枠は CSS（別表D の 1。#rd から始まる指定で .admin-root a
// より強い）。スクロールする領域の内側の余白・負の外側の余白・scroll-padding-top も CSS（端の部品の焦点の枠を切らない。§2.2）。
// 印刷用ページ（11-5）はこの枠を使わない。1 年経過の帯（band）は 11-7 の PR-7.11a が渡す
import Link from "next/link";
import type { ReactNode } from "react";

import { ResultIcon } from "./result-icons";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";

import "./result-detail.css";

export function ResultDetailFrame(props: {
  /** 上の行の右に置く 1 年経過の帯（11-7。PR-7.8a では渡さない） */
  readonly band?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div id="rd">
      <div className="rd-top">
        <Link href="/admin" className="rd-back">
          <ResultIcon name="back" />
          {RESULT_DETAIL_TEXTS.backToResults}
        </Link>
        {props.band}
      </div>
      <div className="rd-scroll">
        <div className="rd-body">{props.children}</div>
      </div>
    </div>
  );
}
