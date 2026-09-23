import type { ComparisonScope, QuestionNo } from "./types";

/** 回答が不完全または不正（03 §2.3）。API 層で 422 に変換する */
export class InvalidAnswerMapError extends Error {
  override readonly name = "InvalidAnswerMapError";
  constructor(
    /** 欠落した設問番号（昇順） */
    readonly missing: readonly QuestionNo[],
    /** 不正な値 */
    readonly invalid: ReadonlyArray<{ readonly questionNo: QuestionNo; readonly value: unknown }>,
  ) {
    super("回答が不完全または不正です");
  }
}

/** 比較母集団が 0 件（03 §7.2、D3-08）。API 層で「比較不能」応答に変換する */
export class EmptyPopulationError extends Error {
  override readonly name = "EmptyPopulationError";
  constructor(readonly scope: ComparisonScope) {
    super("比較母集団が 0 件です");
  }
}
