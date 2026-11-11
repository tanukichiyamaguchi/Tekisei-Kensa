// 育て方・接し方の小さいレーダー（11-4 §2.13.2。K-23 の自作の SVG。育て方と接し方で共用する）。
// viewBox 0 0 340 250、中心 (170, 125)、半径 70 = 最大値（miniRadarMax。10 から始め、値を 10 単位で切り上げる）。軸は 4 本で、渡された
// 順に真上から時計回り（radar-geometry.ts。育て方は APTITUDE_RADAR_AXES、接し方は SOCIAL_STYLE_RADAR_AXES の順）、座標は小数第 1 位で
// 書く。値は丸めずに位置を求め、負の値は 0 の位置に描く（clampForRadar。D3-06）。描く順: 目盛 → 軸ごとの線と名前 → 本人の多角形 → 本人の点。
// 強調する軸（育て方は資質の第一候補、接し方は本人のスタイル）の名前だけを太字にする。凡例・吹き出し・当たりの線・title 要素は置かない。
// 色は参照元のまま（育て方の線と点は外の白と 4.88:1、塗りを白に重ねた #D5E4E9 と 3.74:1。接し方は 4 区分の表の点数で値を読めるので K-50 の
// 対象外。軸の名前は K-49 で確かめる。M7-result-38・39）。フックを使わないので Server でも Client でも描ける。入れ物 .rs-mini は呼ぶ側が付ける
import { clampForRadar } from "@/lib/presentation/negative-values";
import {
  MINI_RADAR,
  formatCoordinate,
  formatPoint,
  labelAnchor,
  miniRadarMax,
  radarPoint,
  type RadarPoint,
} from "@/lib/presentation/radar-geometry";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";

/** 線・塗り・文字の色（11-4 §2.13.2。参照元のまま。M7-result-17・38・39 が読む） */
export const MINI_RADAR_COLORS = {
  grid: "#d9e0e8", // 目盛の 4 角形
  axis: "#e5eaf0", // 軸の線
  label: "#475569", // 軸の名前（カードの白と 7.58:1。K-49 で確かめる）
  labelStrong: "#14202b", // 強調する軸の名前（カードの白と 16.52:1）
  fill: "rgba(46,122,144,.2)", // 本人の多角形の塗り
  line: "#2e7a90", // 本人の多角形の線
  point: "#2e7a90", // 本人の点（塗りの丸）
} as const;

/** 線の太さ・点の半径・軸の名前の大きさと太さ（§2.13.2） */
export const MINI_RADAR_STROKES = {
  grid: 1,
  line: 2.5,
  pointRadius: 3,
  labelFontSize: 11,
  labelWeight: 400,
  labelStrongWeight: 700,
} as const;

/** i 番目（0 から）の軸の、中心から r の点（軸の数は渡された軸の数。§2.13.2 は 4 本） */
const pointAt = (index: number, count: number, r: number): RadarPoint =>
  radarPoint(MINI_RADAR.cx, MINI_RADAR.cy, index, count, r);

export function MiniRadarSvg<K extends string>(props: {
  /** 軸の順（真上から時計回り）の値（丸めない。負の値は 0 の位置に描く） */
  readonly axes: ReadonlyArray<{ readonly key: K; readonly label: string; readonly value: number }>;
  /** 名前を太字にする軸 */
  readonly strongKey: K;
}) {
  const { axes, strongKey } = props;
  const count = axes.length;
  const max = miniRadarMax(axes.map((axis) => axis.value));
  const center = { x: MINI_RADAR.cx, y: MINI_RADAR.cy };
  /** 値の位置の半径: 70 × min(最大値, max(0, 値)) ÷ 最大値 */
  const radiusOf = (value: number): number =>
    (MINI_RADAR.radius * Math.min(max, clampForRadar(value))) / max;
  const ring = (r: number): string =>
    axes.map((_, i) => formatPoint(pointAt(i, count, r))).join(" ");
  /** 本人の値の点（軸の順） */
  const subjectAt = (index: number, value: number): RadarPoint =>
    pointAt(index, count, radiusOf(value));

  return (
    <svg
      viewBox={`0 0 ${MINI_RADAR.width} ${MINI_RADAR.height}`}
      role="img"
      aria-label={RESULT_DETAIL_TEXTS.learn.radarLabel}
    >
      {MINI_RADAR.gridRatios.map((ratio) => (
        <polygon
          key={ratio}
          points={ring(MINI_RADAR.radius * ratio)}
          fill="none"
          stroke={MINI_RADAR_COLORS.grid}
          strokeWidth={MINI_RADAR_STROKES.grid}
        />
      ))}
      {axes.map((axis, i) => {
        const end = pointAt(i, count, MINI_RADAR.radius);
        const label = pointAt(i, count, MINI_RADAR.radius + MINI_RADAR.labelOffset);
        const strong = axis.key === strongKey;
        return (
          <g key={axis.key}>
            <line
              x1={formatCoordinate(center.x)}
              y1={formatCoordinate(center.y)}
              x2={formatCoordinate(end.x)}
              y2={formatCoordinate(end.y)}
              stroke={MINI_RADAR_COLORS.axis}
            />
            <text
              x={formatCoordinate(label.x)}
              y={formatCoordinate(label.y + MINI_RADAR.labelDy)}
              textAnchor={labelAnchor(label.x, MINI_RADAR.cx, MINI_RADAR.anchorTolerance)}
              fontSize={MINI_RADAR_STROKES.labelFontSize}
              fontWeight={
                strong ? MINI_RADAR_STROKES.labelStrongWeight : MINI_RADAR_STROKES.labelWeight
              }
              fill={strong ? MINI_RADAR_COLORS.labelStrong : MINI_RADAR_COLORS.label}
            >
              {axis.label}
            </text>
          </g>
        );
      })}
      <polygon
        points={axes.map((axis, i) => formatPoint(subjectAt(i, axis.value))).join(" ")}
        fill={MINI_RADAR_COLORS.fill}
        stroke={MINI_RADAR_COLORS.line}
        strokeWidth={MINI_RADAR_STROKES.line}
      />
      {axes.map((axis, i) => {
        const point = subjectAt(i, axis.value);
        return (
          <circle
            key={axis.key}
            cx={formatCoordinate(point.x)}
            cy={formatCoordinate(point.y)}
            r={MINI_RADAR_STROKES.pointRadius}
            fill={MINI_RADAR_COLORS.point}
          />
        );
      })}
    </svg>
  );
}
