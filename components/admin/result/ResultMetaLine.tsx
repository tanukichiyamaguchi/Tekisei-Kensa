// 受験情報の 1 行 #rsm（11-4 §2.4。参照元定義の rs-meta）。見出しの塊の 3 段目に、受験日・職業・タイプ・信頼係数を横に並べる
// （値が空の項目は出さない）。信頼係数は丸める前の値が 0 より大きいときだけ出し、色と「結果は参考程度に」は丸める前の値で決める
// （40 未満 b.low、80 未満 b.mid。参照元どおり。03 D3-13 の例外）。概要の信頼係数のカードは表示値で決めるので、境目の近くで色が
// 合わないことがある（§2.7.4）。読み上げの名前は aria-label「受験の情報」で、総称の div に aria-label だけを付けると
// aria-prohibited-attr に当たるので role="group" を付ける（回答一覧の区切りと同じ形）。フックを使わないので Server でも描ける
import { reliabilityTone } from "@/lib/presentation/colors";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import { toDisplayPercent } from "@/lib/presentation/rounding";

export function ResultMetaLine(props: { readonly meta: ResultDetailView["meta"] }) {
  const { meta } = props;
  const t = RESULT_DETAIL_TEXTS.meta;
  const tone = reliabilityTone(meta.reliabilityRaw);
  return (
    <div id="rsm" role="group" aria-label={t.label}>
      {meta.examDate !== "" ? (
        <span>
          {t.examDate}
          <b>{meta.examDate}</b>
        </span>
      ) : null}
      {meta.occupationLabel !== "" ? (
        <span>
          {t.occupation}
          <b>{meta.occupationLabel}</b>
        </span>
      ) : null}
      {meta.typeShort !== "" ? (
        <span>
          {t.type}
          <b>{meta.typeShort}</b>
        </span>
      ) : null}
      {meta.reliabilityRaw > 0 ? (
        <span>
          {t.reliability}
          <b className={tone === "good" ? undefined : tone}>
            {RESULT_DETAIL_TEXTS.percent(toDisplayPercent(meta.reliabilityRaw))}
          </b>
          {tone === "good" ? null : <span className="note">{t.note}</span>}
        </span>
      ) : null}
    </div>
  );
}
