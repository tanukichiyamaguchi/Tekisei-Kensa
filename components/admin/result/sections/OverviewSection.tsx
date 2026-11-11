"use client";
// 概要 rs-ov（11-4 §2.7）。上段 #rs-hero（タイプのカードと、組織内のポジション・組織との合致度・信頼係数のカード）と、下段 #rs-sw
// （いちばん高い特性・いちばん低い特性・注意したいリスク）。比較に依存する 2 か所（ポジションと合致度）は、比較あり以外の状態で
// 比較なしの文言を出す（§2.6）。合致度と評価は色分けしない（K-39 Q-03）。信頼係数は表示値で 3 段階（§2.7.4。受験情報の 1 行は丸める前の
// 値。§2.4）。偏差値・人数の補足行・母集団の注記は出さない（K-39 Q-26・Q-27）。非表示の PDF は visibility で評価の箱・合致度の
// カード・注意したいリスクのカードを描かない（§2.18）。「ほかの特性が高い／低い場合を見る」のボタンは画面の形だけ押せる（§2.15）
import { noComparisonOf, readyComparison } from "./comparison-text";
import type { ComparisonState } from "@/components/admin/result/ComparisonProvider";
import { ResultIcon } from "@/components/admin/result/result-icons";
import type { ResultDetailVariant } from "@/components/admin/result/ResultViewStateContext";
import { Illustration } from "@/components/ui/Illustration";
import type { PdfSectionVisibility } from "@/lib/pdf/visibility";
import { reliabilityTone } from "@/lib/presentation/colors";
import { formatScopeLabel, toPositionView } from "@/lib/presentation/comparison-view";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import { formatOneDecimal, toDisplayPercent } from "@/lib/presentation/rounding";

type Trait = ResultDetailView["traits"][number];

/** いちばん高い・低い特性のカード（§2.7.5 のカード 1・2） */
function HighlightCard(props: {
  readonly side: "high" | "low";
  readonly trait: Trait | undefined;
  readonly onMore: (() => void) | undefined;
}) {
  const t = RESULT_DETAIL_TEXTS.overview;
  const high = props.side === "high";
  const positive = props.trait ? (high ? props.trait.highPositive : props.trait.lowPositive) : "";
  const negative = props.trait ? (high ? props.trait.highNegative : props.trait.lowNegative) : "";
  return (
    <div className="card">
      <h3>
        <span className="cic">
          <ResultIcon name={high ? "trend" : "down"} />
        </span>
        {high ? t.highest : t.lowest}
      </h3>
      {props.trait ? (
        <p className="big">{t.big(props.trait.label, formatOneDecimal(props.trait.value))}</p>
      ) : null}
      <div className="pn">
        {positive !== "" ? (
          <div>
            <em className="ep">{t.good}</em>
            <span>{positive}</span>
          </div>
        ) : null}
        {negative !== "" ? (
          <div>
            <em className="en">{t.caution}</em>
            <span>{negative}</span>
          </div>
        ) : null}
      </div>
      <button type="button" className="more" onClick={props.onMore}>
        {high ? t.moreHigh : t.moreLow}
      </button>
    </div>
  );
}

export function OverviewSection(props: {
  readonly view: ResultDetailView;
  readonly comparison: ComparisonState;
  readonly visibility: PdfSectionVisibility;
  readonly variant: ResultDetailVariant;
  /** 「ほかの特性が高い／低い場合を見る」で開くポップアップ（画面の形だけ） */
  readonly onOpenPopup?: ((side: "high" | "low") => void) | undefined;
}) {
  const { view, visibility } = props;
  const t = RESULT_DETAIL_TEXTS.overview;
  const ready = readyComparison(props.comparison);
  const noComparison = noComparisonOf(props.comparison);
  const position = ready ? toPositionView(ready) : null;
  const reliability = toDisplayPercent(view.reliability);
  const tone = reliabilityTone(reliability);
  const match = ready ? toDisplayPercent(ready.matchScore) : null;
  const highest = view.traits.find((trait) => trait.key === view.highestKey);
  const lowest = view.traits.find((trait) => trait.key === view.lowestKey);
  const onOpenPopup = props.variant === "screen" ? props.onOpenPopup : undefined;

  return (
    <>
      <div id="rs-hero" className="hero">
        <div className="card">
          <div className="who">
            <div className="pic">
              <Illustration src={view.type.imagePath} alt="" width={116} height={116} decorative />
            </div>
            <div>
              <p className="lbl">{t.typeLabel}</p>
              <div className="type">
                {view.type.label}
                <span className="nick">{view.type.characterName}</span>
              </div>
              <p className="lead">{t.aptitude(view.type.aptitude)}</p>
              <div className="tags">
                <span className="tag">
                  <i>{t.tags.style}</i>
                  {view.tags.style}
                </span>
                <span className="tag">
                  <i>{t.tags.learn}</i>
                  {view.tags.learn}
                </span>
                <span className="tag">
                  <i>{t.tags.sense}</i>
                  {view.tags.sense}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="kpis">
          <div className="card">
            <div className="pos">
              {visibility.showGrade ? (
                ready ? (
                  <div id="rs-hyo" className="grade">
                    {ready.grade}
                  </div>
                ) : (
                  <div id="rs-hyo" className="grade no">
                    {t.none}
                  </div>
                )
              ) : null}
              <div>
                <p className="lbl">{t.position}</p>
                {position ? (
                  <>
                    <p className="t">{position.label}</p>
                    <p className="s">{position.descriptionLines[0] ?? ""}</p>
                  </>
                ) : (
                  <p className="empty">{noComparison}</p>
                )}
              </div>
              {position ? (
                <Illustration src={position.imagePath} alt="" width={144} height={96} decorative />
              ) : null}
            </div>
          </div>
          <div className="kpi2">
            {visibility.showMatchScore ? (
              <div id="rs-gat" className="card kpi">
                <p className="lbl">{t.match}</p>
                {ready && match !== null ? (
                  <>
                    <div className="v">
                      {match}
                      <small>{t.percentSign}</small>
                    </div>
                    <div className="meter">
                      <i style={{ width: `${match}%` }} />
                    </div>
                    <p className="s">
                      {t.matchNote(formatScopeLabel(ready.scope), ready.populationSize)}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="v no">{t.none}</div>
                    <p className="empty">{noComparison}</p>
                  </>
                )}
              </div>
            ) : null}
            <div className={`card kpi t-${tone}`}>
              <p className="lbl">{t.reliability}</p>
              <div className="v">
                {reliability}
                <small>{t.percentSign}</small>
              </div>
              <div className="meter">
                <i style={{ width: `${reliability}%` }} />
              </div>
              <p className="s">{tone === "good" ? t.reliabilityGood : t.reliabilityLow}</p>
            </div>
          </div>
        </div>
      </div>
      <div id="rs-sw" className="sw">
        <HighlightCard
          side="high"
          trait={highest}
          onMore={onOpenPopup ? () => onOpenPopup("high") : undefined}
        />
        <HighlightCard
          side="low"
          trait={lowest}
          onMore={onOpenPopup ? () => onOpenPopup("low") : undefined}
        />
        {visibility.showRisks ? (
          <div id="rs-risk1" className="card">
            <h3>
              <span className="cic">
                <ResultIcon name="alert" />
              </span>
              {t.risk}
            </h3>
            <div className="rk3">
              {view.risks.slice(0, 3).map((risk) => (
                <div key={risk.key}>
                  <span className={`dot d${risk.level}`} />
                  <span>{risk.label}</span>
                  <b className={`d${risk.level}`}>{RESULT_DETAIL_TEXTS.percent(risk.display)}</b>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
