// M7-exam-03（11-1 §2.4.1・§2.4.8・§3.5）と M7-exam-04 の設問の表記（11-1 §2.4.4）
import { describe, expect, it } from "vitest";

import { stepOf } from "@/lib/masters/question-layout";
import { QUESTION_BY_NO } from "@/lib/masters/questions";
import {
  EXAM_STEP_COUNT,
  EXAM_STEPS,
  getExamStep,
  questionLabel,
  questionNosOfStep,
  resolveCurrentStepNo,
  stepNoOfQuestion,
  unansweredInStep,
  type ExamStepNo,
} from "@/lib/presentation/exam-steps";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("M7-exam-03 ステップの定義", () => {
  it("4 ステップ、問数 41・41・41・21、合計 144 で Q145 以上を含まず、全設問がちょうど 1 回ずつ", () => {
    expect(EXAM_STEP_COUNT).toBe(4);
    expect(EXAM_STEPS.map((s) => s.stepNo)).toEqual([1, 2, 3, 4]);
    expect(EXAM_STEPS.map((s) => s.questions.length)).toEqual([41, 41, 41, 21]);
    const all = EXAM_STEPS.flatMap((s) => s.questions.map((q) => q.questionNo));
    expect(all).toEqual(range(1, 144));
    expect(all.some((q) => q >= 145)).toBe(false);
  });
  it("各ステップの設問は設問番号の昇順で、questionNosOfStep と一致する", () => {
    expect(getExamStep(1).questions.map((q) => q.questionNo)).toEqual(range(1, 41));
    expect(getExamStep(2).questions.map((q) => q.questionNo)).toEqual(range(42, 82));
    expect(getExamStep(3).questions.map((q) => q.questionNo)).toEqual(range(83, 123));
    expect(getExamStep(4).questions.map((q) => q.questionNo)).toEqual(range(124, 144));
    for (const step of EXAM_STEPS) {
      expect([...questionNosOfStep(step.stepNo)]).toEqual(step.questions.map((q) => q.questionNo));
    }
    expect(questionNosOfStep(0).size).toBe(0);
    expect(questionNosOfStep(5).size).toBe(0);
  });
  it("isLast は Step 4 だけ、案内文は Q-G1〜Q-G4", () => {
    expect(EXAM_STEPS.map((s) => s.isLast)).toEqual([false, false, false, true]);
    expect(EXAM_STEPS.map((s) => s.guideTextId)).toEqual(["Q-G1", "Q-G2", "Q-G3", "Q-G4"]);
  });
  it("範囲外のステップ番号は RangeError", () => {
    for (const stepNo of [0, 5, 1.5]) {
      expect(() => getExamStep(stepNo as ExamStepNo)).toThrow(RangeError);
    }
  });
  it("stepNoOfQuestion(42) = 2。出題対象外は RangeError。1〜144 で stepOf と一致", () => {
    expect(stepNoOfQuestion(42)).toBe(2);
    expect(stepNoOfQuestion(41)).toBe(1);
    expect(stepNoOfQuestion(144)).toBe(4);
    expect(() => stepNoOfQuestion(145)).toThrow(RangeError);
    expect(() => stepNoOfQuestion(0)).toThrow(RangeError);
    for (let q = 1; q <= 144; q += 1) expect(stepNoOfQuestion(q)).toBe(stepOf(q));
  });
});

describe("M7-exam-03 resolveCurrentStepNo（K-41: 未回答の設問がある最初のステップ）", () => {
  it.each<[string, readonly number[], ExamStepNo]>([
    ["空", [], 1],
    ["Q1〜Q41", range(1, 41), 2],
    ["Q1〜Q41 から Q5 を除く", range(1, 41).filter((q) => q !== 5), 1],
    ["Q1〜Q82 と Q100", [...range(1, 82), 100], 3],
    ["Q1〜Q144", range(1, 144), 4],
    ["Q42〜Q144（Step 1 が空）", range(42, 144), 1],
    ["Q1〜Q143", range(1, 143), 4],
  ])("%s → %s", (_, answered, expected) => {
    expect(resolveCurrentStepNo(new Set(answered))).toBe(expected);
  });
});

describe("M7-exam-03 unansweredInStep", () => {
  it("今のステップの未回答を昇順で返し、ほかのステップの回答は見ない", () => {
    const answers = new Map<number, number>([
      [43, 1],
      [1, 5],
      [80, 3],
    ]);
    const unanswered = unansweredInStep(getExamStep(2), answers);
    expect(unanswered).toEqual(range(42, 82).filter((q) => q !== 43 && q !== 80));
    expect([...unanswered].sort((a, b) => a - b)).toEqual(unanswered);
    expect(unansweredInStep(getExamStep(4), new Map(range(124, 144).map((q) => [q, 2])))).toEqual(
      [],
    );
  });
});

describe("M7-exam-04 設問の表記（Q-N）", () => {
  it("「{番号}. {設問文}」。半角のピリオドと半角の空白で、設問文は加工しない", () => {
    expect(questionLabel(1, "人の好き嫌いが多い")).toBe("1. 人の好き嫌いが多い");
    const q144 = QUESTION_BY_NO.get(144);
    expect(questionLabel(144, q144?.text ?? "")).toBe(`144. ${q144?.text}`);
  });
});
