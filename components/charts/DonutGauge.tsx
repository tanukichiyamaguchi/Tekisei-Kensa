// ドーナツゲージ（V-04。06 §6.5）。自前 SVG で Server Component でも描ける（06 D06-01）。
// 値の丸めと色は呼び出し側（lib/presentation/chart-series.ts）が決め、ここは「整数 0〜100 と色」だけを扱う
export interface DonutGaugeProps {
  readonly value: number; // 表示値。整数 0〜100（丸め・クランプ済み）
  readonly color: string; // 外周の色（riskColor / reliabilityColor / matchScoreColor の戻り値）
  readonly label: string; // ゲージ下のラベル（例: 信頼係数、不祥事）
  readonly title?: string; // ホバーで出す正式名（リスクの正式名など）
  readonly size?: number; // 既定 120（px）。PDF 用に 96 も使う
}

export const GAUGE_RADIUS = 44; // viewBox 100×100 中の半径
const STROKE = 10;
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export function DonutGauge({ value, color, label, title, size = 120 }: DonutGaugeProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const dash = (GAUGE_CIRCUMFERENCE * clamped) / 100;
  return (
    <figure className="donut-gauge" style={{ width: size }} title={title}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`${label} ${clamped}%`}
      >
        <circle
          cx="50"
          cy="50"
          r={GAUGE_RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE}
        />
        <circle
          className="donut-gauge__value"
          cx="50"
          cy="50"
          r={GAUGE_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${dash} ${GAUGE_CIRCUMFERENCE}`}
          strokeLinecap="butt"
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="22"
          fontWeight="700"
          fill="#1f2933"
        >
          {clamped}%
        </text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
