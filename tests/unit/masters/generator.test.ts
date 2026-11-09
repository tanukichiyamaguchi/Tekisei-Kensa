// scripts/generate-masters.ts（08 §7.3）と scripts/generate-texts.ts（08 §7.4）の解析規則と不変条件:
// 付録の書式・式・表が崩れたら生成が失敗すること
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { build, GenerationError } from "../../../scripts/generate-masters";
import { build as buildTexts } from "../../../scripts/generate-texts";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const A = read("docs/付録A_設問一覧.md");
const B = read("docs/付録B_採点ロジック仕様.md");
const C = read("docs/付録C_表示文言マスタ.md");

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

describe("generate-texts（08 §7.4。M7-result-15・M7-zaiseki-03）", () => {
  const committed = (fileName: string) =>
    JSON.parse(read(`lib/masters/data/texts/${fileName}`)) as Record<string, unknown>;

  it("現在の付録C から生成でき、9 ファイルの内容がコミット済みの生成物と同じ（再生成で差分が無い）", () => {
    const g = buildTexts(C);
    expect(g.typeTexts).toEqual(committed("type-texts.json").items);
    expect(g.traitDetails.categories).toEqual(committed("trait-details.json").categories);
    expect(g.traitDetails.sentences).toEqual(committed("trait-details.json").items);
    expect(g.traitHighlights).toEqual(committed("trait-highlights.json").items);
    expect(g.developmentGuides).toEqual(committed("development-guides.json").items);
    expect(g.styleTexts).toEqual(committed("style-texts.json").items);
    expect(g.styleInteractions).toEqual(committed("style-interactions.json").items);
    expect(g.positions).toEqual(committed("positions.json").items);
    expect(g.classifications.axes).toEqual(committed("classifications.json").axes);
    expect(g.classifications.items).toEqual(committed("classifications.json").items);
    expect(g.traitDescriptions).toEqual(committed("trait-descriptions.json").items);
    expect(g.traitDetails.sentences).toHaveLength(45);
    expect(g.styleInteractions).toHaveLength(16);
    expect(g.traitDescriptions).toHaveLength(16);
  });

  const broken: Array<[string, string, string]> = [
    ["特性詳細に未知のタイプ名", "| 主張せず他に依存する意識が強い。 | フォロワー、", "| 主張せず他に依存する意識が強い。 | フォロア、"],
    ["特性詳細で同じタイプが重複", "| 自分に厳しく他人には攻撃的。 | コントローラー、アクター、", "| 自分に厳しく他人には攻撃的。 | コントローラー、コントローラー、"],
    ["§1 の表のキャラクター名が 00 §1.6 と違う", "| アテンダントタイプ | Expressive | ハルカ |", "| アテンダントタイプ | Expressive | ハルコ |"],
    ["§1 の表の組織内分類が付録B と違う", "| フォロワータイプ | Amiable | ナオ |", "| フォロワータイプ | Driving | ナオ |"],
    ["§3 の尺度名が写像できない", "| 協力性 | 好印象", "| 協調性 | 好印象"],
    ["§4 の内部名が写像できない", "### 専門追求型（探求論理型）", "### 専門追求型（探求型）"],
    ["§4 の表示名が 00 §1.4 と違う", "| 環境受容型 | 柔軟型 |", "| 環境受容型 | 協調型 |"],
    ["§5 の見出しが未知", "**偉人名（イラスト）**\n\n```\nナポレオン", "**偉人（イラスト）**\n\n```\nナポレオン"],
    ["§6 の閾値が POSITION_RULES と違う", "| 60 以上 | 個が強いリーダータイプ |", "| 65 以上 | 個が強いリーダータイプ |"],
    ["§8 のひらがな名が 00 §1.6 と違う", "意見を聞く | あいり（サイエンティスト）", "意見を聞く | あいこ（サイエンティスト）"],
    ["§8 のキャラクターの所属分類が違う", "ひなた（パイオニア）、なつき（コントローラー）", "なお（フォロワー）、なつき（コントローラー）"],
    ["§8 の分類の表の並びが位置の表と違う", "あいり（サイエンティスト）、まどか（プロフェッショナル）", "まどか（プロフェッショナル）、あいり（サイエンティスト）"],
    ["§8 の位置の表で位置が重複する", "| まどか（プロフェッショナル） | 右上 |", "| まどか（プロフェッショナル） | 左上 |"],
    ["§8 の説明文が英名で始まる（前回の書式）", "アナリティカルタイプの人は、", "Analyticalタイプの人は、"],
    ["§9 の行が欠ける", "| コミュニケーション力 | 相手と話し、考えや気持ちを伝え合う力です。 | 高いと人との関わりが得意で、低いと一人で進める作業を好みます。 |\n", ""],
    ["§9 の尺度が重複する", "| 発想力 | 新しいアイデア", "| リーダーシップ | 新しいアイデア"],
    ["§9 の 1 行目の文が空", "| 行動力 | 考えたことを、すぐ実行に移す力です。 |", "| 行動力 |  |"],
    ["§9 の 2 行目の文が空", "| 高いとスピード感があり、低いとじっくり準備してから動きます。 |", "|  |"],
    ["§9 の尺度名が 00 §1.2 と違う", "| 協力性 | 周りと", "| 協調性 | 周りと"],
  ]; // prettier-ignore

  it.each(broken)("%s → GenerationError", (_name, from, to) => {
    expect(() => buildTexts(replaceOnce(C, from, to))).toThrow(GenerationError);
  });
});
