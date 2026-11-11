// 負値の表示規則（03 §8.4）。保存値は負値のまま持ち、表示・AI 入力（07 §2.3）の直前でだけ使う。

/** 相性スライダーの位置: 0〜100 に収める（負値は左端。D-07） */
export function clampForSlider(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** リスク・信頼係数・合致度のゲージ: 0〜100 に収める（リスクの負値は「0%」。付録B §5） */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** 小さいレーダー（MiniRadarSvg）で負の値を 0 の位置に描く（D3-06。最大値は miniRadarMax） */
export function clampForRadar(value: number): number {
  return Math.max(0, value);
}
