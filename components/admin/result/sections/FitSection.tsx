"use client";
// 組織との相性 rs-fit（11-4 §2.11。K-23 の CSS で描く線）。カード #rs-fitc に、凡例（本人と、比較ありのとき「{比較組織名}の平均（{n}人）」、
// それ以外は比較なしの文言。氏名は出さない）、5 つの軸（マスタの順）、比較ありのときポジションの説明の全行を置く。軸ごとに、比較ありの
// ときだけ一言（fitLean。0〜100 に収めて比べる）と平均の印 .og を出し、本人の印 .me は値を 0〜100 に収めた位置に置く（負の値は左端に
// 置くだけで、数値と注記 T-12 は出さない）。本人の印は平均の印の上に描く（.me の z-index 2。重なるところは本人の印の中の白と平均の印の縁
// #8896A5 で 3.02:1。総論 8.3 の 15。CSS は別表D の 10）。線の行（左の言葉・線・右の言葉）は role="img" で、本人の位置を読み上げの名前
// 「{軸}: {左} から {右} のうち {位置}」で伝える（画面には数値を出さない。今の相性スライダーと同じ文。§2.11・§2.21。1.1 版）
import { noComparisonOf, readyComparison } from "./comparison-text";
import type { ComparisonState } from "@/components/admin/result/ComparisonProvider";
import { formatScopeLabel, toPositionView } from "@/lib/presentation/comparison-view";
import { clampForSlider } from "@/lib/presentation/negative-values";
import { fitLean } from "@/lib/presentation/result-detail-rules";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";

/** 線の目盛の位置（%。§2.11） */
const TICKS = [0, 25, 50, 75, 100] as const;

export function FitSection(props: {
  readonly view: ResultDetailView;
  readonly comparison: ComparisonState;
}) {
  const t = RESULT_DETAIL_TEXTS.fit;
  const ready = readyComparison(props.comparison);
  const noComparison = noComparisonOf(props.comparison);
  const position = ready ? toPositionView(ready) : null;
  return (
    <div id="rs-fitc" className="card">
      <div className="fitlg">
        <span>
          <i className="lgme" />
          {t.subject}
        </span>
        {ready ? (
          <span>
            <i className="lgog" />
            {t.average(formatScopeLabel(ready.scope), ready.populationSize)}
          </span>
        ) : (
          <span className="empty">{noComparison}</span>
        )}
      </div>
      <div className="fit">
        {props.view.fit.map((axis) => {
          const average = ready ? ready.compatibilityAverages[axis.key] : null;
          return (
            <div key={axis.key} className="fr">
              <div className="h">
                <b>{axis.label}</b>
                {average !== null ? (
                  <span>{fitLean(axis.value, average, axis.left, axis.right)}</span>
                ) : null}
              </div>
              <div
                className="row"
                role="img"
                aria-label={t.trackLabel(
                  axis.label,
                  axis.left,
                  axis.right,
                  clampForSlider(axis.value),
                )}
              >
                <div className="l">{axis.left}</div>
                <div className="track">
                  {TICKS.map((tick) => (
                    <span key={tick} className="tick" style={{ left: `${tick}%` }} />
                  ))}
                  {average !== null ? (
                    <span className="og" style={{ left: `${clampForSlider(average)}%` }} />
                  ) : null}
                  <span className="me" style={{ left: `${clampForSlider(axis.value)}%` }} />
                </div>
                <div className="r">{axis.right}</div>
              </div>
            </div>
          );
        })}
      </div>
      {position ? (
        <div className="fitnote">
          <p className="t">{t.position(position.label)}</p>
          <ul className="dl">
            {position.descriptionLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
