// scripts/generate-masters.ts の解析規則と不変条件（08 §7.3）: 付録の書式・式が崩れたら生成が失敗すること
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { build, GenerationError } from "../../../scripts/generate-masters";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const A = read("docs/付録A_設問一覧.md");
const B = read("docs/付録B_採点ロジック仕様.md");

function replaceOnce(text: string, from: string, to: string): string {
  const index = text.indexOf(from);
  if (index < 0 || text.indexOf(from, index + 1) >= 0) throw new Error(`一意でない: ${from}`);
  return text.slice(0, index) + to + text.slice(index + from.length);
}

describe("generate-masters", () => {
  it("現在の付録A・付録B から生成でき、コミット済みの生成物と同じ項を持つ", () => {
    const g = build(A, B);
    const committed = JSON.parse(read("lib/masters/data/traits.json")) as { items: unknown[] };
    expect(g.traits).toEqual(committed.items);
    expect(g.questions).toHaveLength(204);
  });

  const broken: Array<[string, () => string, () => string]> = [
    [
      "自己実現型の Q13 重複を片方消す（付録A の逆引き表・不変条件と矛盾）",
      () => A,
      () => replaceOnce(B, "Q13.+ソーシャル + Q13.+ソーシャル", "Q13.+ソーシャル"),
    ],
    [
      "尺度の符号を 1 つ反転する（加算 8・減算 7 が崩れる）",
      () => A,
      () => replaceOnce(B, "+ Q93.スコア + Q67.スコア", "- Q93.スコア + Q67.スコア"),
    ],
    [
      "未知の配点属性",
      () => A,
      () => replaceOnce(B, "Q24.スコア + Q93.スコア", "Q24.点数 + Q93.スコア"),
    ],
    ["式の左辺が見出しと違う", () => A, () => replaceOnce(B, "協力性 = Q24", "協調性 = Q24")],
    [
      "採点対象外の設問（Q150）を式に使う",
      () => A,
      () =>
        replaceOnce(
          B,
          "Q139.スコア + Q96.スコア\n    - Q1.スコア",
          "Q139.スコア + Q150.スコア\n    - Q1.スコア",
        ),
    ],
    [
      "タイプ表の所属分類が 00 §1.6 と違う",
      () => A,
      () =>
        replaceOnce(B, "| アテンダントタイプ | expressive |", "| アテンダントタイプ | driving |"),
    ],
    [
      "配点表の値を変える（スコア(相性) と スコア(-相性) の不一致）",
      () => A,
      () =>
        replaceOnce(
          B,
          "| そう思う | 2 | 1 | 5 | -2.5 | 3 | 5 | 5 |",
          "| そう思う | 2 | 1 | 5 | -2.5 | 3 | 5 | 4 |",
        ),
    ],
    [
      "付録A の設問が 1 件欠ける",
      () => replaceOnce(A, "| 204 | 単独仕事より、チーム仕事の方が好きだ |\n", ""),
      () => B,
    ],
    [
      "付録A の逆引き表が式と食い違う",
      () =>
        replaceOnce(
          A,
          "| 16 | 驚きやすい | 感情の豊かさ: −スコア |",
          "| 16 | 驚きやすい | 感情の豊かさ: +スコア |",
        ),
      () => B,
    ],
  ];

  it.each(broken)("%s → GenerationError", (_, a, b) => {
    expect(() => build(a(), b())).toThrow(GenerationError);
  });
});
