// 値域と刻み（03 §5.10）。T-10・T-10b が共有する（08 §3.6）
export interface ValueRange {
  readonly min: number;
  readonly max: number;
  readonly step: number | null;
}

export const VALUE_RANGES = {
  traits: { min: 0, max: 30, step: 0.5 },
  compatibility: { min: -100, max: 100, step: 1 },
  aptitudes: { min: 0, max: 145, step: 1.25 },
  risks: { min: -40, max: 100, step: 2.5 },
  aptitudeTypeScores: { min: -58, max: 58, step: 0.5 },
  socialStyles: { min: -29, max: 29, step: 0.25 },
  reliability: { min: 0, max: 100, step: null },
} as const satisfies Record<string, ValueRange>;

export function isInRange(value: number, range: ValueRange): boolean {
  if (value < range.min || value > range.max) return false;
  if (range.step === null) return true;
  const ratio = value / range.step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}
