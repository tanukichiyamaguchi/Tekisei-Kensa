// X-10（06 §10.6）のレーダーの軸の順と値。ゲージ・スライダーの整形（06 §6.8）は PR-7.8a で消した（結果詳細の上半分はメーター・
// 横棒・相性の線を CSS で描く。色の段階は colors.test.ts の M7-result-04・05。11-4 §5.5）
import { describe, expect, it } from "vitest";

import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import {
  APTITUDE_RADAR_AXES,
  aptitudeRadarValues,
  SOCIAL_STYLE_RADAR_AXES,
  socialStyleRadarValues,
  TRAIT_RADAR_AXES,
  traitRadarValues,
} from "@/lib/presentation/chart-series";
import {
  CHART_COLORS,
  CHART_SIZES,
  COMPARISON_SERIES_NAME,
  RADAR_MAX,
} from "@/lib/presentation/chart-theme";
import { scoreAnswers } from "@/lib/scoring/score";
import { TRAIT_KEYS } from "@/lib/scoring/types";

import { cyclicAnswers, uniformAnswers } from "../scoring/helpers";

describe("X-10 レーダーの軸順と値", () => {
  it("16 尺度は TRAIT_DEFINITIONS.sortOrder 順（付録E §1）で、値を丸めない", () => {
    expect(TRAIT_RADAR_AXES.map((a) => a.key)).toEqual(
      [...TRAIT_DEFINITIONS].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => d.key),
    );
    expect(TRAIT_RADAR_AXES.map((a) => a.key)).toEqual([...TRAIT_KEYS]);
    expect(TRAIT_RADAR_AXES[0]!.label).toBe("協力性");
    const averages = Object.fromEntries(TRAIT_KEYS.map((k) => [k, 18.406666666666666]));
    expect(traitRadarValues(averages as never)[0]).toBe(18.406666666666666);
  });
  it("資質は表示名（直感型・柔軟型・目標達成型・専門追求型）", () => {
    expect(APTITUDE_RADAR_AXES.map((a) => a.label)).toEqual([
      "直感型",
      "柔軟型",
      "目標達成型",
      "専門追求型",
    ]);
    expect(aptitudeRadarValues(scoreAnswers(cyclicAnswers()).aptitudes)).toEqual([
      13.75, 7.5, 22.5, 12.5,
    ]);
  });
  it("ソーシャルスタイルは chartOrder 順（ドライビング, エクスプレッシブ, エミアブル, アナリティカル）で負値は 0", () => {
    expect(SOCIAL_STYLE_RADAR_AXES.map((a) => a.label)).toEqual([
      "ドライビング",
      "エクスプレッシブ",
      "エミアブル",
      "アナリティカル",
    ]);
    // 周期回答: driving 4.75, expressive 3.75, analytical 3.25, amiable 4 → 軸順 [4.75, 3.75, 4, 3.25]
    expect(socialStyleRadarValues(scoreAnswers(cyclicAnswers()).socialStyles)).toEqual([
      4.75, 3.75, 4, 3.25,
    ]);
    expect(socialStyleRadarValues(scoreAnswers(uniformAnswers(5)).socialStyles)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("グラフの色・サイズ（付録E §1・§2、06 §6.2）", () => {
  it("受検者 #00a2ff、比較対象 #14f584、系列名「比較対象」、レーダー最大 30", () => {
    expect(CHART_COLORS).toEqual({ subject: "#00a2ff", comparison: "#14f584" });
    expect(COMPARISON_SERIES_NAME).toBe("比較対象");
    expect(RADAR_MAX).toEqual({ traits: 30, socialStyles: 30 });
    expect(CHART_SIZES.traitRadarSummary).toEqual({ width: 626, height: 450 });
  });
});
