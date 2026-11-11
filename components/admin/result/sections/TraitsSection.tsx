"use client";
// 16の特性 rs-tr（11-4 §2.8）と特性の詳細（§2.9）。カード #rs-trc の中に、凡例と並び替えの行・レーダー（TraitRadarSvg）・項目の説明・
// 一覧（2 つ目の凡例と 16 行）・目盛の行を上から置き、カードの下に小見出し「特性の詳細」と 5 枚のカード #rs-det を置く。
// 比較あり以外の状態では、平均の凡例・平均の線・差のバッジ・「平均との差」のボタン・レーダーの平均を出さず、2 つ目の凡例は
// 「サロン平均（右上で比較組織を選ぶと表示されます）」（0 人でも。§2.6）。「平均との差」を選んだまま比較あり以外になると、並びは項目順で
// どのボタンも選ばれていない表示になり、比較ありに戻ると戻る（§2.8.6）。項目の説明のボタンは説明を開け閉めするだけで、並びと並び替えの
// ボタンを変えない（参照元の不具合を再現しない。K-20 (3)。§1.4 の 12）。差のバッジは丸めない差で色を決め、小数第 1 位で 0 になる差は
// 「0.0」（K-44）。印刷の形もボタンを同じ見た目で描き（処理なし）、比較ありなら一覧に本人の値と差のバッジを描く（PDF でもレーダーの値を
// 文字で読める。総論 8.3 の 20）。特性の詳細の小見出しは、§2.21 に要素の定めが無いので h2 と h4 の間の h3 にした
import type { ComparisonState } from "@/components/admin/result/ComparisonProvider";
import { ResultIcon } from "@/components/admin/result/result-icons";
import type {
  ResultDetailVariant,
  ResultViewActions,
} from "@/components/admin/result/ResultViewStateContext";
import { TraitRadarSvg } from "@/components/charts/TraitRadarSvg";
import { formatScopeLabel } from "@/lib/presentation/comparison-view";
import { TRAIT_RADAR } from "@/lib/presentation/radar-geometry";
import { sortTraitKeys, type TraitSortOrder } from "@/lib/presentation/result-detail-rules";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import type { ResultViewState } from "@/lib/presentation/result-view-state";
import { diffTone, formatDiffBadge, formatOneDecimal } from "@/lib/presentation/rounding";
import type { TraitScores } from "@/lib/scoring/types";

/** 並び替えのボタンの順（§2.8.2。「平均との差」は比較ありのときだけ） */
const SORT_BUTTONS: readonly TraitSortOrder[] = ["score", "diff", "def"];

/** 棒の位置（%）: min(100, max(0, 値 ÷ 30 × 100))。丸めない */
const barPercent = (value: number): number =>
  Math.min(100, Math.max(0, (value / TRAIT_RADAR.max) * 100));

export function TraitsSection(props: {
  readonly view: ResultDetailView;
  readonly comparison: ComparisonState;
  readonly viewState: ResultViewState;
  readonly actions: ResultViewActions;
  readonly variant: ResultDetailVariant;
}) {
  const { view, viewState, actions } = props;
  const t = RESULT_DETAIL_TEXTS.traits;
  const screen = props.variant === "screen";
  const ready = props.comparison.kind === "ready" ? props.comparison.comparison : null;
  const averages = ready ? ready.traitAverages : null;
  const scopeLabel = ready ? formatScopeLabel(ready.scope) : null;
  // 「平均との差」を選んだまま比較あり以外: 並びは項目順（sortTraitKeys）で、どのボタンも選ばれていない表示
  const pressed: TraitSortOrder | null =
    viewState.traitSort === "diff" && !ready ? null : viewState.traitSort;
  const values = Object.fromEntries(
    view.traits.map((trait) => [trait.key, trait.value]),
  ) as TraitScores;
  const order = sortTraitKeys({
    values,
    averages,
    order: viewState.traitSort,
    highestKey: view.highestKey,
    lowestKey: view.lowestKey,
  });
  const byKey = new Map(view.traits.map((trait) => [trait.key, trait]));
  const help = viewState.traitHelp ? byKey.get(viewState.traitHelp) : undefined;
  // 全同点（いちばん高い = いちばん低い）は「最も高い」だけ（§2.8.5）
  const lowestKey = view.lowestKey === view.highestKey ? null : view.lowestKey;

  return (
    <>
      <div id="rs-trc" className="card">
        <div className="tr-head">
          <div className="legend">
            <span>
              <i className="lgp" />
              {t.subject}
            </span>
            {ready && scopeLabel !== null ? (
              <span>
                <i className="lgo" />
                {t.average(scopeLabel, ready.populationSize)}
              </span>
            ) : null}
          </div>
          <div className="seg">
            {SORT_BUTTONS.filter((key) => key !== "diff" || ready).map((key) => (
              <button
                key={key}
                type="button"
                className={pressed === key ? "on" : undefined}
                aria-pressed={pressed === key}
                onClick={screen ? () => actions.setTraitSort(key) : undefined}
              >
                {t.sort[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="rs-rad">
          <TraitRadarSvg traits={view.traits} averages={averages} variant={props.variant} />
        </div>
        <div className="rs-sk">
          <p className="sk-t">{t.helpNote}</p>
          <div className="sk-b">
            {view.traits.map((trait) => {
              const on = viewState.traitHelp === trait.key;
              return (
                <button
                  key={trait.key}
                  type="button"
                  className={on ? "on" : undefined}
                  aria-pressed={on}
                  onClick={screen ? () => actions.setTraitHelp(on ? null : trait.key) : undefined}
                >
                  {trait.label}
                </button>
              );
            })}
          </div>
          {help ? (
            <div className="sk-p">
              <p className="sk-n">
                {help.label}
                <span className="sk-s">{t.subjectPoints(formatOneDecimal(help.value))}</span>
              </p>
              <p className="sk-d">{help.description}</p>
              <p className="sk-h">{help.highLow}</p>
            </div>
          ) : null}
        </div>
        <div className="traits">
          <div className="tlg">
            <span>
              <i className="k1" />
              {t.legendSubject}
            </span>
            <span>
              <i className="k2" />
              {scopeLabel !== null ? t.legendAverage(scopeLabel) : t.legendAverageNone}
            </span>
            <span>
              <i className="k3" />
              {t.highest}
            </span>
            <span>
              <i className="k4" />
              {t.lowest}
            </span>
          </div>
          {order.map((key) => {
            const trait = byKey.get(key);
            if (!trait) return null;
            const highest = key === view.highestKey;
            const lowest = key === lowestKey;
            const diff = averages ? trait.value - averages[key] : null;
            return (
              <div key={key} className={highest ? "tr hi" : lowest ? "tr lo" : "tr"}>
                <div className="n">
                  <span className="tic">
                    <ResultIcon name={trait.icon} />
                  </span>
                  {trait.label}
                  {highest ? <span className="flag ep">{t.highest}</span> : null}
                  {lowest ? <span className="flag en">{t.lowest}</span> : null}
                </div>
                <div className="bar">
                  <span className="mid" />
                  <i style={{ width: `${barPercent(trait.value)}%` }} />
                  {averages ? (
                    <u style={{ left: `calc(${barPercent(averages[key])}% - 1px)` }} />
                  ) : null}
                </div>
                <div className="val">{formatOneDecimal(trait.value)}</div>
                {diff !== null ? (
                  <span className={`df ${diffTone(diff)}`}>{formatDiffBadge(diff)}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="ax">
          <div />
          <div>
            {t.scale.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <h3 className="subh">{t.detailsHeading}</h3>
      <div id="rs-det" className="detail">
        {view.details.map((detail) => (
          <div key={detail.category} className="card">
            <h4>
              <span className="cic">
                <ResultIcon name={detail.icon} />
              </span>
              {detail.heading}
            </h4>
            <ul className="dl">
              {detail.sentences.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
            <span className="wm" aria-hidden="true">
              <ResultIcon name={detail.icon} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
