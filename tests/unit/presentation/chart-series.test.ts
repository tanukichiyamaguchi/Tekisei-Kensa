// X-10（06 §10.6）とゲージ・スライダーの整形（06 §6.8）
import { describe, expect, it } from "vitest";

import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import {
  APTITUDE_RADAR_AXES,
  aptitudeRadarValues,
  compatSliders,
  matchScoreGauge,
  reliabilityGauge,
  riskGauges,
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
import { compareWithPopulation } from "@/lib/scoring/compare";
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

describe("ゲージ・スライダー（06 §6.8）", () => {
  it("信頼係数: 四捨五入と緑系の色", () => {
    expect(reliabilityGauge(scoreAnswers(cyclicAnswers()))).toEqual({
      key: "reliability",
      label: "信頼係数",
      title: "信頼係数",
      value: 79,
      color: "#7cb342",
    });
    expect(reliabilityGauge(scoreAnswers(uniformAnswers(1))).color).toBe("#1b7f4b");
  });
  it("リスク 7 件: 短縮名・正式名・負値は 0%", () => {
    const gauges = riskGauges(scoreAnswers(uniformAnswers(5)));
    expect(gauges).toHaveLength(7);
    expect(gauges[0]).toEqual({
      key: "misconduct",
      label: "不祥事",
      title: "不祥事が発生するリスク",
      value: 0,
      color: "#8ecae6",
    });
    expect(riskGauges(scoreAnswers(cyclicAnswers())).map((g) => g.value)).toEqual([
      28, 48, 30, 58, 43, 53, 43,
    ]);
  });
  it("合致度", () => {
    const subject = scoreAnswers(uniformAnswers(1));
    const other = scoreAnswers(uniformAnswers(3));
    const comparison = compareWithPopulation(subject, [subject, other], { kind: "organization" });
    expect(matchScoreGauge(comparison)).toMatchObject({
      value: 96,
      color: "#d32f2f",
      label: "組織との合致度",
    });
  });
  it("相性スライダー 5 件は保存値のまま（負値を含む）", () => {
    const sliders = compatSliders(scoreAnswers(cyclicAnswers()));
    expect(sliders.map((s) => s.value)).toEqual([-3, 0, 11, -13, -7]);
    expect(sliders[0]).toMatchObject({
      label: "適応する環境",
      lowLabel: "個人優先型",
      highLabel: "組織優先型",
    });
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
