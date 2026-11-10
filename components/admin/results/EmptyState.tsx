"use client";
// 表示対象が 0 行のときの表示（11-2 §2.19、K-32 ⑥）。表の代わりに表の枠の中に出す。種類は emptyStateKind（§2.19 の 1〜5）。
// ボタン: no_match は「絞り込みを解除」、no_employed は既存スタッフ用のリンクのコピー（オーナー以外も）、no_candidate・no_results は
// 求職者用のリンクのコピー、no_left はボタンなし
import type { EmptyStateKind } from "@/lib/presentation/result-list-view";
import { RESULT_LIST_TEXTS, type ResultListLinkKind } from "@/lib/presentation/result-list-texts";

const COPY_KIND: Readonly<Partial<Record<EmptyStateKind, ResultListLinkKind>>> = {
  no_employed: "executive",
  no_candidate: "applicant",
  no_results: "applicant",
};

export function EmptyState(props: {
  readonly kind: EmptyStateKind;
  readonly onClear: () => void;
  readonly onCopyLink: (kind: ResultListLinkKind) => void;
}) {
  const texts = RESULT_LIST_TEXTS.empty[props.kind];
  const copyKind = COPY_KIND[props.kind];
  return (
    <div className="rl-empty-box">
      <div className="rl-empty">
        <p className="rl-empty__title">{texts.title}</p>
        <p className="rl-empty__body">{texts.body}</p>
        {texts.button !== null ? (
          <button
            type="button"
            className="rl-empty__btn"
            onClick={() => {
              if (props.kind === "no_match") props.onClear();
              else if (copyKind !== undefined) props.onCopyLink(copyKind);
            }}
          >
            {texts.button}
          </button>
        ) : null}
      </div>
    </div>
  );
}
