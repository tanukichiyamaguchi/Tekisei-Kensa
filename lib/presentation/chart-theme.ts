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
/** PDF の印刷用ページのレーダー（07 §9.5、D07-17。A4 の本文幅 186 mm に収める仮置き） */
export const PRINT_CHART_SIZES = {
  traitRadarSummary: { width: 540, height: 330, plotRadius: 118 },
  traitRadarDetail: { width: 540, height: 330, plotRadius: 118 },
  aptitudeRadar: { width: 280, height: 280 },
  socialStyleRadar: { width: 280, height: 280 },
} as const;
/** レーダーの最大値（付録E §2 yaxis_max）。資質は自動（null） */
export const RADAR_MAX = { traits: 30, socialStyles: 30 } as const;
