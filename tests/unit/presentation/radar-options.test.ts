// U-05（06 §11）: レーダー 3 種の options が付録E §2 の取得値と一致すること、系列の組み立て
import { describe, expect, it, vi } from "vitest";

import {
  APTITUDE_EMPTY_MAX,
  aptitudeRadarOptions,
  aptitudeRadarSeries,
  socialStyleRadarOptions,
  socialStyleRadarSeries,
  traitRadarOptions,
  traitRadarSeries,
} from "@/lib/presentation/radar-options";
import { scoreAnswers } from "@/lib/scoring/score";
import type { AptitudeScores, SocialStyleScores } from "@/lib/scoring/types";

import { cyclicAnswers } from "../scoring/helpers";

const TRAIT_CATEGORIES = [
  "協力性", "適応力", "優劣性", "謙虚さ", "反省力", "規則遵守力", "こだわり", "感情の豊かさ",
  "敏感さ", "自己肯定感", "革新的思考", "行動力", "前向きさ", "リーダーシップ", "発想力", "コミュニケーション力",
]; // prettier-ignore

/** 付録E §2 の共通の取得値 */
function expectCommon(options: ReturnType<typeof traitRadarOptions>) {
  expect(options.chart?.type).toBe("radar");
  expect(options.chart?.animations?.enabled).toBe(false); // 06 D06-21
  expect(options.chart?.toolbar?.show).toBe(false);
  expect(options.stroke).toEqual({ width: 5, curve: "straight" });
  expect(options.fill).toEqual({ type: "solid", opacity: 0.5 });
  expect(options.markers).toEqual({ size: 5 });
  expect(options.legend).toEqual({ show: true, position: "bottom" });
  expect(options.dataLabels).toEqual({ enabled: false });
  expect(options.tooltip).toEqual({ enabled: false });
}

describe("TraitRadar（V-01）", () => {
  const result = scoreAnswers(cyclicAnswers());

  it("比較なし: 軸 16・最大 30・目盛非表示・受検者色のみ", () => {
    const options = traitRadarOptions(false);
    expectCommon(options);
    expect(options.xaxis?.categories).toEqual(TRAIT_CATEGORIES);
    expect(options.yaxis).toEqual({ show: false, min: 0, max: 30 });
    expect(options.colors).toEqual(["#00a2ff"]);
    expect(options.chart?.events).toBeUndefined();
  });

  it("比較あり: 2 色（#00a2ff、#14f584）、系列名は「比較対象」、平均は丸めない", () => {
    const options = traitRadarOptions(true);
    expect(options.colors).toEqual(["#00a2ff", "#14f584"]);
    const averages = { ...result.traits, cooperativeness: 18.406666666666666 };
    const series = traitRadarSeries({
      subjectName: "山田 太郎",
      subject: result.traits,
      comparison: averages,
    });
    expect(series.map((s) => s.name)).toEqual(["山田 太郎", "比較対象"]);
    expect(series[1]!.data[0]).toBe(18.406666666666666);
    expect(series[0]!.data).toHaveLength(16);
    expect(series[0]!.data[5]).toBe(result.traits.rule_compliance);
  });

  it("comparison が null なら系列は 1 本", () => {
    expect(
      traitRadarSeries({ subjectName: "a", subject: result.traits, comparison: null }),
    ).toHaveLength(1);
  });

  it("onMounted を渡すと chart.events.mounted から呼ばれる（07 §9.6）", () => {
    const onMounted = vi.fn();
    const options = traitRadarOptions(false, onMounted);
    const mounted = options.chart?.events?.mounted as unknown as () => void;
    mounted();
    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});

describe("AptitudeRadar（V-02）", () => {
  const aptitudes: AptitudeScores = {
    sensory_open: 122.5,
    environment_receptive: 132.5,
    self_actualizing: 85,
    inquiry_logical: 37.5,
  };

  it("軸は表示名（直感型・柔軟型・目標達成型・専門追求型）、最大値は自動", () => {
    const options = aptitudeRadarOptions(aptitudes);
    expectCommon(options);
    expect(options.xaxis?.categories).toEqual(["直感型", "柔軟型", "目標達成型", "専門追求型"]);
    expect(options.yaxis).toEqual({ show: false, min: 0 });
    expect(aptitudeRadarSeries("受検者名", aptitudes)[0]!.data).toEqual([122.5, 132.5, 85, 37.5]);
  });

  it("4 型すべて 0 なら仮の最大値（06 §6.3）", () => {
    const zero: AptitudeScores = {
      sensory_open: 0,
      environment_receptive: 0,
      self_actualizing: 0,
      inquiry_logical: 0,
    };
    expect(aptitudeRadarOptions(zero).yaxis).toEqual({
      show: false,
      min: 0,
      max: APTITUDE_EMPTY_MAX,
    });
  });
});

describe("SocialStyleRadar（V-03）", () => {
  it("軸は chartOrder（ドライビング・エクスプレッシブ・エミアブル・アナリティカル）、最大 30、負値は 0", () => {
    const options = socialStyleRadarOptions();
    expectCommon(options);
    expect(options.xaxis?.categories).toEqual([
      "ドライビング",
      "エクスプレッシブ",
      "エミアブル",
      "アナリティカル",
    ]);
    expect(options.yaxis).toEqual({ show: false, min: 0, max: 30 });
    const styles: SocialStyleScores = {
      driving: 28,
      expressive: -3.5,
      analytical: 24.5,
      amiable: 29,
    };
    expect(socialStyleRadarSeries("受検者名", styles)[0]!.data).toEqual([28, 0, 29, 24.5]);
  });
});
