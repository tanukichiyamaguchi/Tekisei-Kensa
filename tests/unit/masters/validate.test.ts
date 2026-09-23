// 生成 JSON の読み込み時検証（03 §4.5、D3-03）: 不正なマスタを起動時に拒否すること
import { describe, expect, it } from "vitest";

import aptitudeTypesJson from "@/lib/masters/data/aptitude-types.json";
import choiceScoresJson from "@/lib/masters/data/choice-scores.json";
import questionsJson from "@/lib/masters/data/questions.json";
import socialStylesJson from "@/lib/masters/data/social-styles.json";
import traitsJson from "@/lib/masters/data/traits.json";
import { getOccupationLabel, isOccupationCode, OCCUPATIONS } from "@/lib/masters/occupations";
import { stepAndPageOf } from "@/lib/masters/question-layout";
import {
  MasterValidationError,
  parseAptitudeTypeDefinitions,
  parseChoiceScoreTable,
  parseQuestionDefinitions,
  parseSocialStyleDefinitions,
  parseTraitDefinitions,
} from "@/lib/masters/validate";

/** JSON を複製して一部を書き換える */
function mutate<T>(source: T, edit: (copy: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  edit(copy);
  return copy;
}
function items(copy: Record<string, unknown>): Array<Record<string, unknown>> {
  return copy.items as Array<Record<string, unknown>>;
}

describe("parse* は正しい生成物を受理する", () => {
  it("全マスタ", () => {
    expect(parseTraitDefinitions(traitsJson)).toHaveLength(16);
    expect(parseQuestionDefinitions(questionsJson)).toHaveLength(204);
    expect(parseAptitudeTypeDefinitions(aptitudeTypesJson)).toHaveLength(16);
    expect(parseSocialStyleDefinitions(socialStylesJson)).toHaveLength(4);
    expect(parseChoiceScoreTable(choiceScoresJson)[3].reliability).toBe(-0.5);
  });
});

describe("parse* は不正なマスタを MasterValidationError で拒否する", () => {
  const cases: Array<[string, () => unknown]> = [
    ["ルートがオブジェクトでない", () => parseTraitDefinitions([])],
    ["null", () => parseTraitDefinitions(null)],
    ["kind が違う", () => parseTraitDefinitions(mutate(traitsJson, (c) => (c.kind = "risk")))],
    [
      "scoringVersion が現在の SCORING_VERSION と違う",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => (c.scoringVersion = "0.9.0"))),
    ],
    [
      "generatorVersion が無い",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => delete c.generatorVersion)),
    ],
    ["items が配列でない", () => parseTraitDefinitions(mutate(traitsJson, (c) => (c.items = {})))],
    [
      "キーの並びが TRAIT_KEYS と違う",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => items(c).reverse())),
    ],
    ["キーが 1 件欠ける", () => parseTraitDefinitions(mutate(traitsJson, (c) => items(c).pop()))],
    [
      "項の questionNo が 145",
      () =>
        parseTraitDefinitions(
          mutate(traitsJson, (c) => {
            (items(c)[0]!.terms as Array<Record<string, unknown>>)[0]!.questionNo = 145;
          }),
        ),
    ],
    [
      "項の questionNo が小数",
      () =>
        parseTraitDefinitions(
          mutate(traitsJson, (c) => {
            (items(c)[0]!.terms as Array<Record<string, unknown>>)[0]!.questionNo = 1.5;
          }),
        ),
    ],
    [
      "項の属性が未知",
      () =>
        parseTraitDefinitions(
          mutate(traitsJson, (c) => {
            (items(c)[0]!.terms as Array<Record<string, unknown>>)[0]!.attribute = "bogus";
          }),
        ),
    ],
    [
      "項の符号が 2",
      () =>
        parseTraitDefinitions(
          mutate(traitsJson, (c) => {
            (items(c)[0]!.terms as Array<Record<string, unknown>>)[0]!.sign = 2;
          }),
        ),
    ],
    ["項が空", () => parseTraitDefinitions(mutate(traitsJson, (c) => (items(c)[0]!.terms = [])))],
    [
      "項がオブジェクトでない",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => (items(c)[0]!.terms = [1]))),
    ],
    [
      "定数が文字列",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => (items(c)[0]!.constant = "14"))),
    ],
    [
      "clampMin が文字列",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => (items(c)[0]!.clampMin = "0"))),
    ],
    [
      "ラベルが空",
      () => parseTraitDefinitions(mutate(traitsJson, (c) => (items(c)[0]!.label = ""))),
    ],
    [
      "タイプの所属分類が未知",
      () =>
        parseAptitudeTypeDefinitions(
          mutate(aptitudeTypesJson, (c) => (items(c)[0]!.socialStyle = "friendly")),
        ),
    ],
    [
      "設問番号が連番でない",
      () => parseQuestionDefinitions(mutate(questionsJson, (c) => items(c).shift())),
    ],
    [
      "設問の step が 5",
      () => parseQuestionDefinitions(mutate(questionsJson, (c) => (items(c)[0]!.step = 5))),
    ],
    [
      "設問の isActive が文字列",
      () =>
        parseQuestionDefinitions(mutate(questionsJson, (c) => (items(c)[0]!.isActive = "true"))),
    ],
    ["選択肢が 4 件", () => parseChoiceScoreTable(mutate(choiceScoresJson, (c) => items(c).pop()))],
    [
      "選択肢の並びが違う",
      () => parseChoiceScoreTable(mutate(choiceScoresJson, (c) => items(c).reverse())),
    ],
    [
      "配点が NaN 相当（null）",
      () => parseChoiceScoreTable(mutate(choiceScoresJson, (c) => (items(c)[0]!.score = null))),
    ],
    [
      "スタイルの並びが違う",
      () => parseSocialStyleDefinitions(mutate(socialStylesJson, (c) => items(c).reverse())),
    ],
  ];

  it.each(cases)("%s", (_, run) => {
    expect(run).toThrow(MasterValidationError);
  });
});

describe("設問のステップ・ページ割り当て", () => {
  it("境界", () => {
    expect(stepAndPageOf(7)).toEqual({ step: 1, page: 1 });
    expect(stepAndPageOf(8)).toEqual({ step: 1, page: 2 });
    expect(stepAndPageOf(28)).toEqual({ step: 1, page: 4 });
    expect(stepAndPageOf(29)).toEqual({ step: 1, page: 5 });
    expect(stepAndPageOf(73)).toEqual({ step: 3, page: 1 });
    expect(stepAndPageOf(109)).toEqual({ step: 4, page: 1 });
  });
  it.each([0, 145, 1.5, -1])("出題対象外の %s は RangeError", (q) => {
    expect(() => stepAndPageOf(q)).toThrow(RangeError);
  });
});

describe("職業マスタ（00 §1.10、10 K-19）", () => {
  it("8 件、コード順（アイリストのサロン向け）", () => {
    expect(OCCUPATIONS.map((o) => o.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(getOccupationLabel(1)).toBe("アイリスト");
    expect(getOccupationLabel(6)).toBe("受付");
    expect(getOccupationLabel(8)).toBe("その他");
    // K-19 より前に保存された旧コード 9（その他）は表示できるが、新規の登録には使えない
    expect(getOccupationLabel(9)).toBe("その他");
    expect(isOccupationCode(9)).toBe(false);
    expect(() => getOccupationLabel(10)).toThrow(RangeError);
    expect(isOccupationCode(1)).toBe(true);
    expect(isOccupationCode(0)).toBe(false);
    expect(isOccupationCode("1")).toBe(false);
  });
});
