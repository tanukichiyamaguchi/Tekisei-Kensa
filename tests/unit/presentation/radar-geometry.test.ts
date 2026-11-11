// M7-result-11 radar-geometry.ts（11-4 §2.8.3・§3.5・§5.1。PR-7.8a の分: 16の特性のレーダーの寸法・座標・軸の名前の揃え）。
// 小さいレーダーの MINI_RADAR・miniRadarMax は PR-7.8b
import { describe, expect, it } from "vitest";

import {
  formatPoint,
  labelAnchor,
  radarPoint,
  TRAIT_RADAR,
} from "@/lib/presentation/radar-geometry";

const { cx, cy, radius, max, labelOffset, anchorTolerance } = TRAIT_RADAR;

describe("M7-result-11 radar-geometry（16の特性のレーダー）", () => {
  it("寸法は §2.8.3 の表のとおり（viewBox 0 0 560 460、中心 (280, 230)、半径 150 = 30 点、目盛 10・20・30 点）", () => {
    expect(TRAIT_RADAR).toEqual({
      width: 560,
      height: 460,
      cx: 280,
      cy: 230,
      radius: 150,
      max: 30,
      grid: [10, 20, 30],
      labelOffset: 16,
      labelDy: 4,
      anchorTolerance: 8,
    });
    // 目盛の 16 角形の半径 50・100・150、軸の名前は P(i, 166)、中央揃えの範囲は x 272〜288
    expect(TRAIT_RADAR.grid.map((g) => (radius * g) / max)).toEqual([50, 100, 150]);
    expect(radius + labelOffset).toBe(166);
    expect([cx - anchorTolerance, cx + anchorTolerance]).toEqual([272, 288]);
  });

  it("radarPoint: 角度 −90° + 360° × i ÷ 16（協力性が真上、時計回り）。i = 0・4・8・12 は上・右・下・左", () => {
    const at = (i: number) => radarPoint(cx, cy, i, 16, radius);
    for (const [i, x, y] of [
      [0, 280, 80],
      [4, 430, 230],
      [8, 280, 380],
      [12, 130, 230],
    ] as const) {
      expect(at(i).x, `i=${i}`).toBeCloseTo(x, 9);
      expect(at(i).y, `i=${i}`).toBeCloseTo(y, 9);
    }
    expect(formatPoint(at(0))).toBe("280.0,80.0");
    expect(formatPoint(at(4))).toBe("430.0,230.0");
    expect(formatPoint(at(8))).toBe("280.0,380.0");
    expect(formatPoint(at(12))).toBe("130.0,230.0");
    // 斜めの軸（i = 2）は 45°: 150 × cos 45° ≒ 106.07
    expect(formatPoint(at(2))).toBe("386.1,123.9");
  });

  it("radarPoint は丸めず、r = 0 は中心", () => {
    expect(radarPoint(cx, cy, 2, 16, radius).x).toBeCloseTo(280 + 150 * Math.SQRT1_2, 12);
    const center = radarPoint(cx, cy, 5, 16, 0);
    expect(formatPoint(center)).toBe("280.0,230.0");
  });

  it("formatPoint は x と y を小数第 1 位（toFixed(1)）で「x,y」", () => {
    expect(formatPoint({ x: 280, y: 80 })).toBe("280.0,80.0");
    expect(formatPoint({ x: 12.345, y: 0.05 })).toBe("12.3,0.1");
  });

  it.each([
    [271.9, "end"],
    [272, "middle"],
    [280, "middle"],
    [288, "middle"],
    [288.1, "start"],
  ])("labelAnchor(%f, 280, 8) → %s", (x, anchor) => {
    expect(labelAnchor(x, cx, anchorTolerance)).toBe(anchor);
  });

  it("16 本の軸の名前の揃え: 真上と真下は中央、右半分は左揃え、左半分は右揃え", () => {
    const anchors = Array.from({ length: 16 }, (_, i) =>
      labelAnchor(radarPoint(cx, cy, i, 16, radius + labelOffset).x, cx, anchorTolerance),
    );
    expect(anchors).toEqual([
      "middle",
      ...Array<string>(7).fill("start"),
      "middle",
      ...Array<string>(7).fill("end"),
    ]);
  });
});
