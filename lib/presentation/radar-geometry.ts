// 自作の SVG のレーダーの座標（11-4 §2.8.3・§2.13.2・§3.5 の radar-geometry.ts。K-23）。16の特性のレーダー（TraitRadarSvg）と、
// 育て方・接し方の小さいレーダー（MiniRadarSvg）が使う純関数と寸法の定数。値は丸めずに位置を求め、SVG の座標の文字だけを小数第 1 位で
// 書く（§2.8.3。画面に出す数ではないので rounding.ts は使わない）。小さいレーダーの定数と最大値（MINI_RADAR・miniRadarMax）も
// ここに置く。軸の角度・座標・揃えは 2 つのレーダーで同じ関数（radarPoint・formatPoint・formatCoordinate・labelAnchor）を使う。
// 前回のグラフの設定（radar-options.ts・chart-theme.ts）は消した

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

/**
 * 育て方・接し方の小さいレーダー（§2.13.2。MiniRadarSvg）。viewBox 0 0 340 250、中心 (170, 125)、半径 70 = 最大値（miniRadarMax）、
 * 目盛は最大値の 1/3・2/3・1（半径 23.3・46.7・70）、軸は 4 本（radarPoint(cx, cy, i, 4, r)。最初の軸が真上、時計回り）、軸の名前は半径 84
 */
export const MINI_RADAR = {
  width: 340,
  height: 250,
  cx: 170,
  cy: 125,
  radius: 70,
  gridRatios: [1 / 3, 2 / 3, 1],
  labelOffset: 14, // 軸の名前の位置は半径 + 14（P(i, 84)）
  labelDy: 4, // 軸の名前の y に足す
  anchorTolerance: 6, // 中心から ±6 の内側は中央揃え（x が 164 未満は右揃え、176 を超えれば左揃え）
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

/**
 * 小さいレーダーの最大値（§2.13.2）。10 から始め、値を順に見て、今の最大値より大きい値があれば最大値を「その値 ÷ 10 を切り上げて
 * 10 を掛けた数」にする（結果は max(10, 最大の値を 10 単位で切り上げた数)。空と、負の値だけのときは 10）。
 * 例 [8, 9.5] → 10、[10.25] → 20、[26.25, 24, 30, 12] → 30、[31] → 40
 */
export function miniRadarMax(values: readonly number[]): number {
  let max = 10;
  for (const value of values) {
    if (value > max) max = Math.ceil(value / 10) * 10;
  }
  return max;
}
