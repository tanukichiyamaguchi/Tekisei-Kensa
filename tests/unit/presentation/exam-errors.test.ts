// 受検者 API のエラー → 画面の動作（05 §5.1.6、§5.2.2、§5.3.7、§5.4.2、§7.1。05/T-06・T-15・T-15a・T-15b の単体部分）
import { describe, expect, it } from "vitest";

import { examPageNoOf } from "@/lib/masters/question-layout";
import { examErrorAction, issuePaths, type ExamApiOperation } from "@/lib/presentation/exam-errors";
import { pageNoOfQuestion } from "@/lib/presentation/exam-pages";
import { EXAM_TEXTS } from "@/lib/presentation/exam-texts";

const fail = (code: string, status = 400, details: Record<string, unknown> = {}) => ({
  status,
  code,
  details,
});

const sessionOps: ExamApiOperation[] = ["start", "save", "submit"];

describe("examErrorAction", () => {
  it.each(sessionOps)(
    "%s: 401 両コード・404 NOT_FOUND・SESSION_NOT_FOUND は E-04 全面、409 は完了画面へ",
    (op) => {
      for (const code of [
        "RESPONDENT_TOKEN_INVALID",
        "RESPONDENT_TOKEN_EXPIRED",
        "NOT_FOUND",
        "SESSION_NOT_FOUND",
      ]) {
        expect(examErrorAction(op, fail(code))).toEqual({ kind: "session_unavailable" });
      }
      expect(examErrorAction(op, fail("SESSION_ALREADY_SUBMITTED", 409))).toEqual({
        kind: "complete",
      });
    },
  );

  it("429 は E-06、オフラインは E-07（いずれも再試行あり）", () => {
    for (const op of ["register", ...sessionOps] as ExamApiOperation[]) {
      expect(examErrorAction(op, fail("RATE_LIMITED", 429))).toEqual({
        kind: "banner",
        text: "E-06",
        retry: true,
      });
      expect(examErrorAction(op, fail("OFFLINE", 0))).toEqual({
        kind: "banner",
        text: "E-07",
        retry: true,
      });
    }
  });

  it("保存の失敗（5xx・通信断・422）は E-02 と再試行、開始・送信は E-01 と再試行", () => {
    for (const code of ["INTERNAL_ERROR", "NETWORK_ERROR", "TIMEOUT", "VALIDATION_ERROR"]) {
      expect(examErrorAction("save", fail(code))).toEqual({
        kind: "banner",
        text: "E-02",
        retry: true,
      });
      expect(examErrorAction("start", fail(code))).toEqual({
        kind: "banner",
        text: "E-01",
        retry: true,
      });
    }
    expect(examErrorAction("submit", fail("SERVICE_UNAVAILABLE", 503))).toEqual({
      kind: "banner",
      text: "E-01",
      retry: true,
    });
  });

  it("05/T-15b: 送信の ANSWERS_INCOMPLETE は missing[0]（無ければ invalid[0]）の設問へ", () => {
    expect(
      examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, { missing: [141, 142] })),
    ).toEqual({ kind: "unanswered", questionNo: 141 });
    expect(
      examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, { missing: [], invalid: [7] })),
    ).toEqual({ kind: "unanswered", questionNo: 7 });
    expect(examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, {}))).toEqual({
      kind: "banner",
      text: "E-01",
      retry: true,
    });
    expect(examPageNoOf(141)).toBe(20);
  });

  it("登録: 404 は E-05（再試行なし）、422 は項目の path、それ以外は E-01", () => {
    expect(examErrorAction("register", fail("ORGANIZATION_NOT_FOUND", 404))).toEqual({
      kind: "banner",
      text: "E-05",
      retry: false,
    });
    expect(
      examErrorAction(
        "register",
        fail("VALIDATION_ERROR", 422, {
          issues: [{ path: "phoneNumber", message: "x" }, { path: "name" }, { bad: 1 }],
        }),
      ),
    ).toEqual({ kind: "registration_issues", paths: ["phoneNumber", "name"] });
    for (const code of ["INTERNAL_ERROR", "NETWORK_ERROR", "TIMEOUT", "INVALID_JSON"]) {
      expect(examErrorAction("register", fail(code))).toEqual({
        kind: "banner",
        text: "E-01",
        retry: true,
      });
    }
  });

  it("issuePaths は形の違う details を空配列にする", () => {
    expect(issuePaths({})).toEqual([]);
    expect(issuePaths({ issues: "x" })).toEqual([]);
  });
});

describe("examPageNoOf（ブラウザ用。設問文を読み込まない）", () => {
  it("1〜144 のすべてで pageNoOfQuestion と一致し、範囲外は RangeError", () => {
    for (let q = 1; q <= 144; q += 1) expect(examPageNoOf(q)).toBe(pageNoOfQuestion(q));
    expect(() => examPageNoOf(145)).toThrow(RangeError);
    expect(() => examPageNoOf(0)).toThrow(RangeError);
  });
});

describe("exam-texts（05 §9）", () => {
  it("§9 の ID がそろい、文言が空でない", () => {
    const ids = [
      ...["H-01", "L-01", "L-02", "L-03"],
      ...Array.from({ length: 10 }, (_, i) => `B-${String(i + 1).padStart(2, "0")}`),
      ...Array.from({ length: 11 }, (_, i) => `R1-${String(i + 1).padStart(2, "0")}`),
      "R3-01",
      "R3-02",
      ...Array.from({ length: 7 }, (_, i) => `V-0${i}`),
      ...Array.from({ length: 5 }, (_, i) => `R2-0${i + 1}`),
      "Q-00",
      "Q-02",
      "Q-05",
      "S-01",
      "S-02",
      "C-01",
      "C-02",
      ...Array.from({ length: 9 }, (_, i) => `X-0${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `E-0${i + 1}`),
    ];
    for (const id of ids) {
      expect(EXAM_TEXTS[id as keyof typeof EXAM_TEXTS], id).toMatch(/\S/);
    }
  });
});
