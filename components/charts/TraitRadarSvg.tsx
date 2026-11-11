"use client";
// 16の特性のレーダー（11-4 §2.8.3。K-23 の自作の SVG。今の TraitRadar（ApexCharts）を置き換える）。viewBox 0 0 560 460、中心 (280, 230)、
// 半径 150 = 30 点。軸は項目順に真上から時計回り（radar-geometry.ts）、座標は小数第 1 位で書く。値は丸めずに位置を求め、0〜30 に収める。
// 描く順: 目盛 → 軸ごとの線と名前 → 平均の多角形 → 本人の多角形 → 軸ごとに（平均の点、本人の点、吹き出しの当たりの線）。
// 線・塗り・点の色は参照元のまま（値は同じカードの一覧の文字で読めるので、値を文字でも出すグラフとして K-50 の対象外。PDF も同じ）。
// 吹き出しは画面の形だけ: 当たりの線にマウスが載ると document.body の直下に .rd-tip を出し（マウスから右 14px・下 14px。画面の右端か
// 下端まで 8px 未満になるならマウスの左か上へ）、外れたら隠し、どこかがスクロールしたら隠す。印刷の形は当たりの線と吹き出しを付けない
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import {
  TRAIT_RADAR,
  formatCoordinate,
  formatPoint,
  labelAnchor,
  radarPoint,
  type RadarPoint,
} from "@/lib/presentation/radar-geometry";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import { formatOneDecimal, formatTooltipDiff } from "@/lib/presentation/rounding";
import type { TraitKey, TraitScores } from "@/lib/scoring/types";

/** 線・塗り・文字の色（11-4 §2.8.3。参照元のまま。M7-result-17・38 が読む） */
export const TRAIT_RADAR_COLORS = {
  grid: "#d9e0e8", // 目盛の 16 角形
  axis: "#e5eaf0", // 軸の線
  label: "#475569", // 軸の名前（カードの白と 7.58:1。K-49 で確かめる）
  averageFill: "rgba(22,163,74,.15)",
  averageLine: "#16a34a",
  subjectFill: "rgba(37,99,235,.18)",
  subjectLine: "#2563eb",
  pointFill: "#ffffff",
} as const;

/** 線の太さ・点の半径・軸の名前の大きさ・吹き出しの当たり（§2.8.3） */
export const TRAIT_RADAR_STROKES = {
  grid: 1,
  average: 2,
  averagePointRadius: 3.5,
  subject: 2.5,
  subjectPointRadius: 4.5,
  labelFontSize: 12,
  hitWidth: 30,
} as const;

/** 吹き出しの位置（マウスからのずれと、画面の端までの余り。§2.8.3） */
const TIP_OFFSET = 14;
const TIP_MARGIN = 8;

const AXIS_COUNT = 16;

interface TipState {
  readonly index: number;
  readonly x: number; // マウスの位置（画面の座標）
  readonly y: number;
}

/** i 番目の軸の、中心から r の点 */
const pointAt = (index: number, r: number): RadarPoint =>
  radarPoint(TRAIT_RADAR.cx, TRAIT_RADAR.cy, index, AXIS_COUNT, r);

/** 値の位置の半径: 150 × min(30, max(0, 値)) ÷ 30 */
const radiusOf = (value: number): number =>
  (TRAIT_RADAR.radius * Math.min(TRAIT_RADAR.max, Math.max(0, value))) / TRAIT_RADAR.max;

const polygonOf = (values: readonly number[]): string =>
  values.map((value, i) => formatPoint(pointAt(i, radiusOf(value)))).join(" ");

export function TraitRadarSvg(props: {
  /** 項目順の 16 件（本人の値は丸めない） */
  readonly traits: ReadonlyArray<{
    readonly key: TraitKey;
    readonly label: string;
    readonly value: number;
  }>;
  /** 比較組織の平均（比較ありのときだけ。丸めない） */
  readonly averages: TraitScores | null;
  readonly variant: "screen" | "print";
}) {
  const { traits, averages } = props;
  const screen = props.variant === "screen";
  const [tip, setTip] = useState<TipState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const center = { x: TRAIT_RADAR.cx, y: TRAIT_RADAR.cy };
  const subjectValues = traits.map((t) => t.value);
  const averageValues = averages ? traits.map((t) => averages[t.key]) : null;
  const tipShown = tip !== null;

  // どこかがスクロールしたら隠す（window に capture で付け、内側のスクロールも拾う）
  useEffect(() => {
    if (!tipShown) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tipShown]);

  // 吹き出しの大きさが決まってから、描く前に位置を決める（画面の右端・下端まで 8px 未満ならマウスの左・上へ）。位置はこの効果だけが書く
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!tip || !el) return;
    const box = el.getBoundingClientRect();
    let left = tip.x + TIP_OFFSET;
    let top = tip.y + TIP_OFFSET;
    if (left + box.width > window.innerWidth - TIP_MARGIN) left = tip.x - TIP_OFFSET - box.width;
    if (top + box.height > window.innerHeight - TIP_MARGIN) top = tip.y - TIP_OFFSET - box.height;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [tip]);

  const showTip = (index: number) => (event: MouseEvent<SVGLineElement>) =>
    setTip({ index, x: event.clientX, y: event.clientY });

  const tipTrait = tip ? traits[tip.index] : undefined;
  const subjectText = tipTrait ? formatOneDecimal(tipTrait.value) : "";
  const averageText = tipTrait && averages ? formatOneDecimal(averages[tipTrait.key]) : null;

  return (
    <>
      <svg
        viewBox={`0 0 ${TRAIT_RADAR.width} ${TRAIT_RADAR.height}`}
        role="img"
        aria-label={RESULT_DETAIL_TEXTS.traits.radarLabel}
      >
        {TRAIT_RADAR.grid.map((step) => (
          <polygon
            key={step}
            points={polygonOf(traits.map(() => step))}
            fill="none"
            stroke={TRAIT_RADAR_COLORS.grid}
            strokeWidth={TRAIT_RADAR_STROKES.grid}
          />
        ))}
        {traits.map((trait, i) => {
          const end = pointAt(i, TRAIT_RADAR.radius);
          const label = pointAt(i, TRAIT_RADAR.radius + TRAIT_RADAR.labelOffset);
          return (
            <g key={trait.key}>
              <line
                x1={formatCoordinate(center.x)}
                y1={formatCoordinate(center.y)}
                x2={formatCoordinate(end.x)}
                y2={formatCoordinate(end.y)}
                stroke={TRAIT_RADAR_COLORS.axis}
              />
              <text
                x={formatCoordinate(label.x)}
                y={formatCoordinate(label.y + TRAIT_RADAR.labelDy)}
                textAnchor={labelAnchor(label.x, TRAIT_RADAR.cx, TRAIT_RADAR.anchorTolerance)}
                fontSize={TRAIT_RADAR_STROKES.labelFontSize}
                fill={TRAIT_RADAR_COLORS.label}
              >
                {trait.label}
              </text>
            </g>
          );
        })}
        {averageValues ? (
          <polygon
            points={polygonOf(averageValues)}
            fill={TRAIT_RADAR_COLORS.averageFill}
            stroke={TRAIT_RADAR_COLORS.averageLine}
            strokeWidth={TRAIT_RADAR_STROKES.average}
          />
        ) : null}
        <polygon
          points={polygonOf(subjectValues)}
          fill={TRAIT_RADAR_COLORS.subjectFill}
          stroke={TRAIT_RADAR_COLORS.subjectLine}
          strokeWidth={TRAIT_RADAR_STROKES.subject}
        />
        {traits.map((trait, i) => {
          const subject = pointAt(i, radiusOf(trait.value));
          const average = averageValues ? pointAt(i, radiusOf(averageValues[i] ?? 0)) : null;
          const end = pointAt(i, TRAIT_RADAR.radius);
          return (
            <g key={trait.key}>
              {average ? (
                <circle
                  cx={formatCoordinate(average.x)}
                  cy={formatCoordinate(average.y)}
                  r={TRAIT_RADAR_STROKES.averagePointRadius}
                  fill={TRAIT_RADAR_COLORS.pointFill}
                  stroke={TRAIT_RADAR_COLORS.averageLine}
                  strokeWidth={TRAIT_RADAR_STROKES.average}
                />
              ) : null}
              <circle
                cx={formatCoordinate(subject.x)}
                cy={formatCoordinate(subject.y)}
                r={TRAIT_RADAR_STROKES.subjectPointRadius}
                fill={TRAIT_RADAR_COLORS.pointFill}
                stroke={TRAIT_RADAR_COLORS.subjectLine}
                strokeWidth={TRAIT_RADAR_STROKES.subject}
              />
              {screen ? (
                <line
                  className="rd-hit"
                  x1={formatCoordinate(center.x)}
                  y1={formatCoordinate(center.y)}
                  x2={formatCoordinate(end.x)}
                  y2={formatCoordinate(end.y)}
                  stroke={TRAIT_RADAR_COLORS.subjectLine}
                  strokeOpacity={0}
                  strokeWidth={TRAIT_RADAR_STROKES.hitWidth}
                  strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={showTip(i)}
                  onMouseMove={showTip(i)}
                  onMouseLeave={() => setTip(null)}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {screen && tip && tipTrait
        ? createPortal(
            <div ref={tipRef} className="rd-tip">
              <b>{tipTrait.label}</b>
              <br />
              <span className="ks">{RESULT_DETAIL_TEXTS.traits.tipMark}</span>{" "}
              {RESULT_DETAIL_TEXTS.traits.subjectPoints(subjectText)}
              {averageText !== null ? (
                <>
                  <br />
                  <span className="ko">{RESULT_DETAIL_TEXTS.traits.tipMark}</span>{" "}
                  {RESULT_DETAIL_TEXTS.traits.tipAverage(
                    averageText,
                    formatTooltipDiff(Number(subjectText), Number(averageText)),
                  )}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
