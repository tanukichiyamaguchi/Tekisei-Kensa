// 自作の SVG のレーダーの座標（11-4 §2.8.3・§3.5 の radar-geometry.ts。K-23）。16の特性のレーダー（TraitRadarSvg）が使う純関数と
// 寸法の定数。値は丸めずに位置を求め、SVG の座標の文字だけを小数第 1 位で書く（§2.8.3。画面に出す数ではないので rounding.ts は
// 使わない）。育て方・接し方の小さいレーダーの定数と最大値（MINI_RADAR・miniRadarMax）は PR-7.8b が足す。
// 今の radar-options.ts・chart-theme.ts（ApexCharts の設定）は PR-7.8b で消す

/** 16の特性のレーダー（§2.8.3）。viewBox 0 0 560 460、中心 (280, 230)、半径 150 = 30 点、目盛 10・20・30 点、軸の名前は半径 166 */
export const TRAIT_RADAR = {
  width: 560,
  height: 460,
  cx: 280,
  cy: 230,
  radius: 150,
  max: 30,
  grid: [10, 20, 30],
  labelOffset: 16, // 軸の名前の位置は半径 + 16（P(i, 166)）
  labelDy: 4, // 軸の名前の y に足す
  anchorTolerance: 8, // 中心から ±8 の内側は中央揃え（x が 272 未満は右揃え、288 を超えれば左揃え）
} as const;

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
}

/** index 番目（0 から）の軸の、中心から r の位置。角度は −90° + 360° × index ÷ count（最初の軸が真上、時計回り）。丸めない */
export function radarPoint(
  cx: number,
  cy: number,
  index: number,
  count: number,
  r: number,
): RadarPoint {
  const angle = ((-90 + (360 * index) / count) * Math.PI) / 180;
  return Object.freeze({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
}

/** SVG の座標 1 つの文字（小数第 1 位。toFixed(1)。例 280 → "280.0"）。線の端・点の中心・軸の名前の位置に使う */
export function formatCoordinate(value: number): string {
  return value.toFixed(1);
}

/** SVG の座標の文字 "x,y"（小数第 1 位。toFixed(1)。例 "280.0,80.0"） */
export function formatPoint(p: RadarPoint): string {
  return `${formatCoordinate(p.x)},${formatCoordinate(p.y)}`;
}

/** 軸の名前の揃え（text-anchor）: x が cx − tolerance 未満なら end（右揃え）、cx + tolerance を超えれば start、それ以外 middle */
export function labelAnchor(x: number, cx: number, tolerance: number): "start" | "middle" | "end" {
  if (x < cx - tolerance) return "end";
  if (x > cx + tolerance) return "start";
  return "middle";
}
