// U-05（06 §11）: 自前描画のグラフ部品（DonutGauge・CompatSlider・GradeLetter）を静的 HTML に描いて確かめる
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompatSlider } from "@/components/charts/CompatSlider";
import { DonutGauge, GAUGE_CIRCUMFERENCE } from "@/components/charts/DonutGauge";
import { GradeLetter } from "@/components/charts/GradeLetter";

function dashOf(html: string): number {
  const m = /class="donut-gauge__value"[^>]*stroke-dasharray="([\d.]+) /.exec(html);
  if (!m) throw new Error(`stroke-dasharray が見つかりません: ${html}`);
  return Number(m[1]);
}

describe("DonutGauge", () => {
  const render = (value: number, color = "#d32f2f") =>
    renderToStaticMarkup(
      createElement(DonutGauge, { value, color, label: "不祥事", title: "不祥事が発生するリスク" }),
    );

  it("strokeDasharray が値に比例し、色と「NN%」を出す", () => {
    const html = render(90);
    expect(dashOf(html)).toBeCloseTo(GAUGE_CIRCUMFERENCE * 0.9, 6);
    expect(dashOf(render(25))).toBeCloseTo(GAUGE_CIRCUMFERENCE * 0.25, 6);
    expect(html).toContain('stroke="#d32f2f"');
    expect(html).toContain("90%");
    expect(html).toContain('aria-label="不祥事 90%"');
    expect(html).toContain('title="不祥事が発生するリスク"');
  });

  it("負値は 0%、100 超は 100% にクランプし、小数は四捨五入", () => {
    expect(dashOf(render(-12))).toBe(0);
    expect(render(-12)).toContain("0%");
    expect(dashOf(render(140))).toBeCloseTo(GAUGE_CIRCUMFERENCE, 6);
    expect(render(140)).toContain("100%");
    expect(render(49.5)).toContain("50%");
  });
});

describe("CompatSlider", () => {
  const render = (value: number) =>
    renderToStaticMarkup(
      createElement(CompatSlider, {
        label: "適応する環境",
        lowLabel: "個人優先型",
        highLabel: "組織優先型",
        value,
      }),
    );

  it("0 以上: 位置は値そのもの、ホバーの title に値、注記なし", () => {
    const html = render(62);
    expect(html).toContain("left:calc(62% - 7px)");
    expect(html).toContain('title="62"');
    expect(html).not.toContain("計算値が 0 未満");
    expect(html).toContain("個人優先型");
    expect(html).toContain("組織優先型");
  });

  it("負値: 左端に置き、title を付けず注記（T-12）を出す。aria-label も表示位置", () => {
    const html = render(-8);
    expect(html).toContain("left:calc(0% - 7px)");
    expect(html).not.toContain('title="-8"');
    expect(html).not.toContain("-8");
    expect(html).toContain("※ 計算値が 0 未満のため左端に表示しています");
    expect(html).toContain("のうち 0");
  });

  it("100 超は右端", () => {
    expect(render(130)).toContain("left:calc(100% - 7px)");
  });
});

describe("GradeLetter", () => {
  it("null は固定文言（比較未選択）", () => {
    expect(renderToStaticMarkup(createElement(GradeLetter, { grade: null }))).toContain(
      "比較組織を選択すると表示されます",
    );
  });

  it.each([
    ["A", "#d32f2f"],
    ["B", "#ff8000"],
    ["C", "#2e9e5b"],
    ["D", "#d4a600"],
    ["E", "#8ecae6"],
  ] as const)("%s は %s", (grade, color) => {
    const html = renderToStaticMarkup(createElement(GradeLetter, { grade }));
    expect(html).toContain(`color:${color}`);
    expect(html).toContain(`>${grade}<`);
  });
});
