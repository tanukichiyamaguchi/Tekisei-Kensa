// M7-result-17（11-4 §5.1。U-05 の置き換え。PR-7.8a の分）: 16の特性のレーダー TraitRadarSvg（§2.8.3。K-23 の自作の SVG）を
// renderToStaticMarkup で静的な HTML に描いて確かめる。前回の DonutGauge・CompatSlider・GradeLetter は PR-7.8a で消した（メーター・
// 横棒・相性の線・評価の箱は CSS。結果詳細の部品の描画は result-detail-sections.test.ts）。線・塗り・点の色は参照元のまま（値は同じ
// カードの一覧の文字で読めるので、値を文字でも出すグラフとして K-50 の対象外。§2.2）。育て方・接し方の小さいレーダーは PR-7.8b が足す
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TRAIT_RADAR_COLORS,
  TRAIT_RADAR_STROKES,
  TraitRadarSvg,
} from "@/components/charts/TraitRadarSvg";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import { formatPoint, radarPoint } from "@/lib/presentation/radar-geometry";
import { TRAIT_KEYS, type TraitKey, type TraitScores } from "@/lib/scoring/types";

const LABELS = new Map(TRAIT_DEFINITIONS.map((d) => [d.key, d.label]));

/** 項目順の 16 件（values は項目順の値。省くとすべて 15） */
function traitsOf(values: readonly number[] = []) {
  return TRAIT_KEYS.map((key, i) => ({
    key,
    label: LABELS.get(key) ?? key,
    value: values[i] ?? 15,
  }));
}

function averagesOf(value: number): TraitScores {
  return Object.fromEntries(TRAIT_KEYS.map((key) => [key, value])) as Record<TraitKey, number>;
}

function render(
  traits: ReturnType<typeof traitsOf>,
  averages: TraitScores | null,
  variant: "screen" | "print" = "screen",
): string {
  return renderToStaticMarkup(createElement(TraitRadarSvg, { traits, averages, variant }));
}

/** 開きタグをすべて（要素名で） */
const tagsOf = (html: string, name: string): string[] =>
  html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** 中心 (280, 230)・16 軸で、i 番目の軸の半径 r の点（小数第 1 位の文字） */
const pt = (i: number, r: number) => formatPoint(radarPoint(280, 230, i, 16, r));
const ring = (r: number) => Array.from({ length: 16 }, (_, i) => pt(i, r)).join(" ");

describe("M7-result-17 TraitRadarSvg（16の特性のレーダー。11-4 §2.8.3）", () => {
  it("viewBox 0 0 560 460、role img と読み上げの名前「16の特性レーダーチャート」", () => {
    const svg = tagsOf(render(traitsOf(), null), "svg")[0]!;
    expect(attr(svg, "viewBox")).toBe("0 0 560 460");
    expect(attr(svg, "role")).toBe("img");
    expect(attr(svg, "aria-label")).toBe("16の特性レーダーチャート");
  });

  it("目盛は 10・20・30 点の 16 角形 3 つ（半径 50・100・150。座標は小数第 1 位）、塗りなし・線 #d9e0e8・太さ 1", () => {
    const grids = tagsOf(render(traitsOf(), null), "polygon").filter(
      (tag) => attr(tag, "fill") === "none",
    );
    expect(grids.map((tag) => attr(tag, "points"))).toEqual([ring(50), ring(100), ring(150)]);
    expect(ring(150).startsWith("280.0,80.0 ")).toBe(true);
    for (const tag of grids) {
      expect(attr(tag, "stroke")).toBe("#d9e0e8");
      expect(attr(tag, "stroke-width")).toBe("1");
    }
  });

  it("軸の線は中心から P(i, 150) までの 16 本（#e5eaf0）、名前は P(i, 166) の y に 4 を足した位置に 16 個（12px・#475569）で、x が 272 未満は end・288 を超えれば start・それ以外は middle", () => {
    const html = render(traitsOf(), null, "print");
    const axes = tagsOf(html, "line");
    expect(axes).toHaveLength(16);
    axes.forEach((tag, i) => {
      expect(attr(tag, "stroke"), `軸 ${i}`).toBe("#e5eaf0");
      expect(`${attr(tag, "x1")},${attr(tag, "y1")}`).toBe("280.0,230.0");
      expect(`${attr(tag, "x2")},${attr(tag, "y2")}`).toBe(pt(i, 150));
    });
    const texts = tagsOf(html, "text");
    expect(texts).toHaveLength(16);
    const anchors = texts.map((tag) => attr(tag, "text-anchor"));
    texts.forEach((tag, i) => {
      const p = radarPoint(280, 230, i, 16, 166);
      expect(attr(tag, "x"), `名前 ${i}`).toBe(p.x.toFixed(1));
      expect(attr(tag, "y"), `名前 ${i}`).toBe((p.y + 4).toFixed(1));
      expect(attr(tag, "font-size")).toBe("12");
      expect(attr(tag, "fill")).toBe("#475569");
      const expected = p.x < 272 ? "end" : p.x > 288 ? "start" : "middle";
      expect(anchors[i], `名前 ${i}`).toBe(expected);
    });
    // 真上（協力性）と真下は中央揃え、右は左揃え、左は右揃え
    expect([anchors[0], anchors[4], anchors[8], anchors[12]]).toEqual([
      "middle",
      "start",
      "middle",
      "end",
    ]);
    // 名前は項目順（協力性が真上、時計回り）
    expect(
      html.match(/<text[^>]*>([^<]*)<\/text>/g)?.map((t) => t.replace(/<[^>]+>/g, "")),
    ).toEqual(TRAIT_KEYS.map((key) => LABELS.get(key)));
  });

  it("値の位置は P(i, 150 × min(30, max(0, 値)) ÷ 30): 30 は外周、−5 は中心、35 は外周（最大 30 で固定）", () => {
    const values = [30, -5, 35, 0, 15];
    const subject = tagsOf(render(traitsOf(values), null), "polygon").find(
      (tag) => attr(tag, "stroke") === "#2563eb",
    )!;
    const points = attr(subject, "points")!.split(" ");
    expect(points[0]).toBe(pt(0, 150));
    expect(points[0]).toBe("280.0,80.0");
    expect(points[1]).toBe("280.0,230.0");
    expect(points[2]).toBe(pt(2, 150));
    expect(points[3]).toBe("280.0,230.0");
    expect(points[4]).toBe(pt(4, 75));
    expect(points).toHaveLength(16);
  });

  it("本人の多角形（塗り rgba(37,99,235,.18)・線 #2563eb・太さ 2.5）と各軸の白い点（半径 4.5・線 #2563eb・太さ 2.5）。比較なしは平均を描かない", () => {
    const html = render(traitsOf(), null);
    const polygons = tagsOf(html, "polygon").filter((tag) => attr(tag, "fill") !== "none");
    expect(polygons).toHaveLength(1);
    expect(attr(polygons[0]!, "fill")).toBe("rgba(37,99,235,.18)");
    expect(attr(polygons[0]!, "stroke")).toBe("#2563eb");
    expect(attr(polygons[0]!, "stroke-width")).toBe("2.5");
    const circles = tagsOf(html, "circle");
    expect(circles).toHaveLength(16);
    for (const tag of circles) {
      expect(attr(tag, "r")).toBe("4.5");
      expect(attr(tag, "fill")).toBe("#ffffff");
      expect(attr(tag, "stroke")).toBe("#2563eb");
      expect(attr(tag, "stroke-width")).toBe("2.5");
    }
    expect(html).not.toContain("#16a34a");
  });

  it("比較ありは平均の多角形（塗り rgba(22,163,74,.15)・線 #16a34a・太さ 2）を本人より前に描き、各軸に平均の白い点（半径 3.5・線 #16a34a・太さ 2）を本人の点の前に描く", () => {
    const html = render(traitsOf(), averagesOf(20));
    const polygons = tagsOf(html, "polygon").filter((tag) => attr(tag, "fill") !== "none");
    expect(polygons.map((tag) => attr(tag, "fill"))).toEqual([
      "rgba(22,163,74,.15)",
      "rgba(37,99,235,.18)",
    ]);
    expect(attr(polygons[0]!, "stroke")).toBe("#16a34a");
    expect(attr(polygons[0]!, "stroke-width")).toBe("2");
    expect(attr(polygons[0]!, "points")).toBe(ring(100));
    const circles = tagsOf(html, "circle");
    expect(circles).toHaveLength(32);
    // 軸ごとに 平均の点 → 本人の点
    expect(circles.map((tag) => attr(tag, "r"))).toEqual(
      Array.from({ length: 16 }, () => ["3.5", "4.5"]).flat(),
    );
    expect(attr(circles[0]!, "stroke")).toBe("#16a34a");
    expect(attr(circles[0]!, "stroke-width")).toBe("2");
    expect(`${attr(circles[0]!, "cx")},${attr(circles[0]!, "cy")}`).toBe(pt(0, 100));
  });

  it("画面の形は吹き出しの当たりの線を 16 本（中心から P(i, 150)・線の不透明度 0・太さ 30・端は丸・カーソルは指）。印刷の形は当たりの線が無い", () => {
    const hits = tagsOf(render(traitsOf(), averagesOf(20)), "line").filter(
      (tag) => attr(tag, "stroke-opacity") === "0",
    );
    expect(hits).toHaveLength(16);
    hits.forEach((tag, i) => {
      expect(attr(tag, "stroke-width")).toBe("30");
      expect(attr(tag, "stroke-linecap")).toBe("round");
      expect(attr(tag, "style")).toBe("cursor:pointer");
      expect(`${attr(tag, "x2")},${attr(tag, "y2")}`).toBe(pt(i, 150));
    });
    const print = render(traitsOf(), averagesOf(20), "print");
    expect(tagsOf(print, "line").filter((tag) => attr(tag, "stroke-opacity") === "0")).toEqual([]);
    expect(tagsOf(print, "line")).toHaveLength(16);
    // 吹き出しはマウスを載せるまで描かない（document.body の直下に出す。M7-result-28 は E2E）
    expect(render(traitsOf(), averagesOf(20))).not.toContain("rd-tip");
  });

  it("色と太さの定数は参照元のまま（K-50 の対象外。§2.8.3）", () => {
    expect(TRAIT_RADAR_COLORS).toEqual({
      grid: "#d9e0e8",
      axis: "#e5eaf0",
      label: "#475569",
      averageFill: "rgba(22,163,74,.15)",
      averageLine: "#16a34a",
      subjectFill: "rgba(37,99,235,.18)",
      subjectLine: "#2563eb",
      pointFill: "#ffffff",
    });
    expect(TRAIT_RADAR_STROKES).toEqual({
      grid: 1,
      average: 2,
      averagePointRadius: 3.5,
      subject: 2.5,
      subjectPointRadius: 4.5,
      labelFontSize: 12,
      hitWidth: 30,
    });
  });
});
