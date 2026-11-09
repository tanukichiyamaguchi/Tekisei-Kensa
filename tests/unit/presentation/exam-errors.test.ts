// M7-exam-10 受検者 API のエラー → 画面の動作（11-1 §2.1.5・§2.2.6・§2.3・§2.4.5〜§2.4.7・§3.5）
import { describe, expect, it } from "vitest";

import { examErrorAction, issuePaths } from "@/lib/presentation/exam-errors";

const fail = (code: string, status = 400, details: Record<string, unknown> = {}) => ({
  status,
  code,
  details,
});
const issues = (...paths: string[]) => ({ issues: paths.map((path) => ({ path, message: "x" })) });

/** 通信の失敗・タイムアウト（status 0）と 5xx・そのほかの 4xx */
const OTHER_FAILURES = [
  fail("NETWORK_ERROR", 0),
  fail("TIMEOUT", 0),
  fail("INTERNAL_ERROR", 500),
  fail("SERVICE_UNAVAILABLE", 503),
  fail("INVALID_JSON", 400),
  fail("UNSUPPORTED_MEDIA_TYPE", 415),
];

const SESSION_UNAVAILABLE = [
  fail("RESPONDENT_TOKEN_INVALID", 401),
  fail("RESPONDENT_TOKEN_EXPIRED", 401),
  fail("NOT_FOUND", 404),
  fail("SESSION_NOT_FOUND", 404),
];

describe("M7-exam-10 登録（「診断に進む」）", () => {
  it("404 ORGANIZATION_NOT_FOUND・404 NOT_FOUND・422（path が organizationId）は R-07 の R7-02", () => {
    expect(examErrorAction("register", fail("ORGANIZATION_NOT_FOUND", 404))).toEqual({
      kind: "alert",
      textId: "R7-02",
    });
    expect(examErrorAction("register", fail("NOT_FOUND", 404))).toEqual({
      kind: "alert",
      textId: "R7-02",
    });
    expect(
      examErrorAction("register", fail("VALIDATION_ERROR", 422, issues("organizationId"))),
    ).toEqual({ kind: "alert", textId: "R7-02" });
    // organizationId と項目の両方が不正でも、リンクの誤りを先に知らせる
    expect(
      examErrorAction("register", fail("VALIDATION_ERROR", 422, issues("name", "organizationId"))),
    ).toEqual({ kind: "alert", textId: "R7-02" });
  });

  it("422 で path の先頭が登録の項目なら、その path で赤枠（ほかの path は落とす）", () => {
    expect(
      examErrorAction(
        "register",
        fail("VALIDATION_ERROR", 422, {
          issues: [{ path: "phoneNumber", message: "x" }, { path: "name" }, { bad: 1 }],
        }),
      ),
    ).toEqual({ kind: "registration_issues", paths: ["phoneNumber", "name"] });
    expect(
      examErrorAction(
        "register",
        fail("VALIDATION_ERROR", 422, issues("occupationCode", "kind", "diagnosisExperience")),
      ),
    ).toEqual({ kind: "registration_issues", paths: ["occupationCode", "diagnosisExperience"] });
  });

  it("そのほかの 422・400・415・5xx・通信の失敗・タイムアウトは E-01、429 は E-06、オフラインは E-07", () => {
    expect(examErrorAction("register", fail("VALIDATION_ERROR", 422, issues("kind")))).toEqual({
      kind: "alert",
      textId: "E-01",
    });
    expect(examErrorAction("register", fail("VALIDATION_ERROR", 422))).toEqual({
      kind: "alert",
      textId: "E-01",
    });
    for (const failure of OTHER_FAILURES) {
      expect(examErrorAction("register", failure), failure.code).toEqual({
        kind: "alert",
        textId: "E-01",
      });
    }
    expect(examErrorAction("register", fail("RATE_LIMITED", 429))).toEqual({
      kind: "alert",
      textId: "E-06",
    });
    expect(examErrorAction("register", fail("OFFLINE", 0))).toEqual({
      kind: "alert",
      textId: "E-07",
    });
  });
});

describe("M7-exam-10 開始（「開始する」）", () => {
  it("409 は完了画面、401・404 は R-06、429 は E-06、オフラインは E-07、そのほかは E-01", () => {
    expect(examErrorAction("start", fail("SESSION_ALREADY_SUBMITTED", 409))).toEqual({
      kind: "complete",
    });
    for (const failure of SESSION_UNAVAILABLE) {
      expect(examErrorAction("start", failure)).toEqual({ kind: "session_unavailable" });
    }
    expect(examErrorAction("start", fail("RATE_LIMITED", 429))).toEqual({
      kind: "alert",
      textId: "E-06",
    });
    expect(examErrorAction("start", fail("OFFLINE", 0))).toEqual({
      kind: "alert",
      textId: "E-07",
    });
    for (const failure of OTHER_FAILURES) {
      expect(examErrorAction("start", failure)).toEqual({ kind: "alert", textId: "E-01" });
    }
  });
});

describe("M7-exam-10 保存（選んだ時点の自動保存）", () => {
  it("401・404 は R-06、409 は完了画面、そのほか（通信の失敗・5xx・429・オフライン）は通知せず未送信のまま", () => {
    for (const failure of SESSION_UNAVAILABLE) {
      expect(examErrorAction("save", failure)).toEqual({ kind: "session_unavailable" });
    }
    expect(examErrorAction("save", fail("SESSION_ALREADY_SUBMITTED", 409))).toEqual({
      kind: "complete",
    });
    for (const failure of [
      ...OTHER_FAILURES,
      fail("RATE_LIMITED", 429),
      fail("OFFLINE", 0),
      fail("VALIDATION_ERROR", 422),
    ]) {
      expect(examErrorAction("save", failure), failure.code).toEqual({ kind: "retry_later" });
    }
  });
});

describe("M7-exam-10 「次へ」「送信する」の前の保存（flush）", () => {
  it("401・404 は R-06、409 は完了画面、429 は E-06、オフラインは E-07、そのほかは E-02", () => {
    for (const failure of SESSION_UNAVAILABLE) {
      expect(examErrorAction("flush", failure)).toEqual({ kind: "session_unavailable" });
    }
    expect(examErrorAction("flush", fail("SESSION_ALREADY_SUBMITTED", 409))).toEqual({
      kind: "complete",
    });
    expect(examErrorAction("flush", fail("RATE_LIMITED", 429))).toEqual({
      kind: "alert",
      textId: "E-06",
    });
    expect(examErrorAction("flush", fail("OFFLINE", 0))).toEqual({
      kind: "alert",
      textId: "E-07",
    });
    for (const failure of [...OTHER_FAILURES, fail("VALIDATION_ERROR", 422)]) {
      expect(examErrorAction("flush", failure)).toEqual({ kind: "alert", textId: "E-02" });
    }
  });
});

describe("M7-exam-10 送信", () => {
  it("409 は完了画面（成功と同じ）", () => {
    expect(examErrorAction("submit", fail("SESSION_ALREADY_SUBMITTED", 409))).toEqual({
      kind: "complete",
    });
  });
  it("422 ANSWERS_INCOMPLETE は missing[0]（無ければ invalid[0]）の設問へ", () => {
    expect(
      examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, { missing: [141, 142] })),
    ).toEqual({ kind: "unanswered", questionNo: 141 });
    expect(
      examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, { missing: [], invalid: [7] })),
    ).toEqual({ kind: "unanswered", questionNo: 7 });
    expect(examErrorAction("submit", fail("ANSWERS_INCOMPLETE", 422, {}))).toEqual({
      kind: "alert",
      textId: "E-01",
    });
  });
  it("401・404 NOT_FOUND・404 SESSION_NOT_FOUND は R-06、429 は E-06、オフラインは E-07、5xx・通信の失敗・タイムアウトは E-01", () => {
    for (const failure of SESSION_UNAVAILABLE) {
      expect(examErrorAction("submit", failure)).toEqual({ kind: "session_unavailable" });
    }
    expect(examErrorAction("submit", fail("RATE_LIMITED", 429))).toEqual({
      kind: "alert",
      textId: "E-06",
    });
    expect(examErrorAction("submit", fail("OFFLINE", 0))).toEqual({
      kind: "alert",
      textId: "E-07",
    });
    for (const failure of OTHER_FAILURES) {
      expect(examErrorAction("submit", failure)).toEqual({ kind: "alert", textId: "E-01" });
    }
  });
});

describe("issuePaths", () => {
  it("details.issues[].path の文字列だけを返し、形の違う details は空配列にする", () => {
    expect(issuePaths(issues("name", "answers[0].questionNo"))).toEqual([
      "name",
      "answers[0].questionNo",
    ]);
    expect(issuePaths({})).toEqual([]);
    expect(issuePaths({ issues: "x" })).toEqual([]);
    expect(issuePaths({ issues: [null, { path: 1 }, { path: "phoneNumber" }] })).toEqual([
      "phoneNumber",
    ]);
  });
});
