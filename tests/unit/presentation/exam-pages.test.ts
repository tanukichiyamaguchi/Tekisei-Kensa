// 05/T-01（05 §10.1、§12）と pageNo の変換（04 §4.4）
import { describe, expect, it } from "vitest";

import {
  EXAM_PAGE_COUNT,
  EXAM_PAGES_PER_STEP,
  EXAM_QUESTION_COUNT,
  EXAM_STEP_COUNT,
  getExamPage,
  pageNoOfQuestion,
  parseExamPageNo,
  questionNosOfPage,
  resolveResumePageNo,
  toPageInStep,
  toPageNo,
  toStep,
  unansweredOnPage,
} from "@/lib/presentation/exam-pages";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("05/T-01 getExamPage の全ページ", () => {
  it("定数", () => {
    expect([EXAM_STEP_COUNT, EXAM_PAGES_PER_STEP, EXAM_PAGE_COUNT, EXAM_QUESTION_COUNT]).toEqual([
      4, 5, 20, 144,
    ]);
  });
  it("問数 7・7・7・7・8 × 4、合計 144、Q145 以上を含まない、全設問がちょうど 1 回ずつ", () => {
    const sizes: number[] = [];
    const all: number[] = [];
    for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
      const page = getExamPage(pageNo);
      sizes.push(page.questions.length);
      all.push(...page.questions.map((q) => q.questionNo));
      expect(page.questions.every((q) => q.questionNo <= 144)).toBe(true);
      expect([...questionNosOfPage(pageNo)]).toEqual(page.questions.map((q) => q.questionNo));
    }
    expect(sizes).toEqual([7, 7, 7, 7, 8, 7, 7, 7, 7, 8, 7, 7, 7, 7, 8, 7, 7, 7, 7, 8]);
    expect(all).toEqual(range(1, 144));
  });
  it("先頭・末尾ページ", () => {
    expect(getExamPage(1).questions.map((q) => q.questionNo)).toEqual(range(1, 7));
    expect(getExamPage(20).questions.map((q) => q.questionNo)).toEqual(range(137, 144));
    expect(getExamPage(1)).toMatchObject({ step: 1, pageInStep: 1, isFirst: true, isLast: false });
    expect(getExamPage(20)).toMatchObject({ step: 4, pageInStep: 5, isFirst: false, isLast: true });
  });
  it.each([0, 21, 1.5])("範囲外 %s は RangeError", (pageNo) => {
    expect(() => getExamPage(pageNo)).toThrow(RangeError);
  });
});

describe("pageNo の変換と再開位置", () => {
  it("toStep / toPageInStep / toPageNo", () => {
    expect([toStep(1), toStep(5), toStep(6), toStep(20)]).toEqual([1, 1, 2, 4]);
    expect([toPageInStep(1), toPageInStep(5), toPageInStep(6), toPageInStep(20)]).toEqual([
      1, 5, 1, 5,
    ]);
    for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
      expect(toPageNo(toStep(pageNo), toPageInStep(pageNo))).toBe(pageNo);
    }
    expect(questionNosOfPage(21).size).toBe(0);
  });
  it("parseExamPageNo は 1〜20 の整数だけを受理する", () => {
    expect(parseExamPageNo("1")).toBe(1);
    expect(parseExamPageNo("20")).toBe(20);
    for (const raw of ["0", "21", "01", "1.5", "-1", "a", ""])
      expect(parseExamPageNo(raw)).toBeNull();
  });
  it("pageNoOfQuestion(64) === 9、範囲外は RangeError", () => {
    expect(pageNoOfQuestion(64)).toBe(9);
    expect(pageNoOfQuestion(1)).toBe(1);
    expect(pageNoOfQuestion(144)).toBe(20);
    expect(() => pageNoOfQuestion(145)).toThrow(RangeError);
    expect(() => pageNoOfQuestion(0)).toThrow(RangeError);
  });
  it("resolveResumePageNo", () => {
    expect(resolveResumePageNo(new Set())).toBe(1);
    expect(resolveResumePageNo(new Set(range(1, 144)))).toBe(20);
    expect(resolveResumePageNo(new Set([...range(1, 36), 40]))).toBe(6);
  });
  it("unansweredOnPage", () => {
    const page = getExamPage(1);
    expect(
      unansweredOnPage(
        page,
        new Map([
          [1, 1],
          [3, 5],
        ]),
      ),
    ).toEqual([2, 4, 5, 6, 7]);
  });
});
