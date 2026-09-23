// グラフの色・フォント・サイズ（06 §5.3、§6.2。付録E §1・§2）
export const CHART_COLORS = { subject: "#00a2ff", comparison: "#14f584" } as const;
export const COMPARISON_SERIES_NAME = "比較対象";
export const CHART_FONT_FAMILY =
  'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
export const CHART_SIZES = {
  traitRadarSummary: { width: 626, height: 450 },
  traitRadarDetail: { width: 440, height: 440 },
  aptitudeRadar: { width: 440, height: 500 },
  socialStyleRadar: { width: 484, height: 500 },
} as const;
/** レーダーの最大値（付録E §2 yaxis_max）。資質は自動（null） */
export const RADAR_MAX = { traits: 30, socialStyles: 30 } as const;
