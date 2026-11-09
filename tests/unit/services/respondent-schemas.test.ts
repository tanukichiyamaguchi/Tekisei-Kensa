// U-06 のうち受検者 API の入力（04 §4.1）、M7-exam-08 登録のスキーマ・M7-exam-09 保存のスキーマ（11-1 §3.4.1・§3.4.2）。
// M7-exam-08 の previousResultId の観点は PR-7.4
import { describe, expect, it } from "vitest";

import {
  assessmentLinkQuerySchema,
  examStepNoSchema,
  registerRespondentInputSchema,
  saveAnswersInputSchema,
} from "@/lib/services/schemas/respondent";

const valid = {
  organizationId: "OrgExample0000000001",
  kind: "applicant",
  name: "見本 花子",
  phoneNumber: "00000000000",
  occupationCode: 2,
  diagnosisExperience: "first_time",
};

const pathsOf = (result: { success: boolean; error?: { issues: Array<{ path: unknown[] }> } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.path.join("."));

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const answersOf = (questionNos: readonly number[]) =>
  questionNos.map((questionNo) => ({ questionNo, choiceCode: 3 }));

describe("M7-exam-08 registerRespondentInputSchema", () => {
  it("お名前・電話番号は前後の空白だけを除いた値のまま（電話番号を正規化しない）", () => {
    expect(
      registerRespondentInputSchema.parse({
        ...valid,
        name: "　見本 花子　",
        phoneNumber: " ０９０ーabc ",
      }),
    ).toMatchObject({ name: "見本 花子", phoneNumber: "０９０ーabc" });
    expect(
      registerRespondentInputSchema.parse({ ...valid, phoneNumber: "+81 (90) 0000" }).phoneNumber,
    ).toBe("+81 (90) 0000");
  });

  it("電話番号は 30 文字まで（書式・桁数を見ない）、お名前は 100 文字（コードポイント）まで", () => {
    for (const phoneNumber of ["0".repeat(30), "a", "０".repeat(30), `  ${"0".repeat(30)}  `]) {
      expect(registerRespondentInputSchema.safeParse({ ...valid, phoneNumber }).success).toBe(true);
    }
    expect(
      registerRespondentInputSchema.safeParse({ ...valid, name: "𠮷".repeat(100) }).success,
    ).toBe(true);
  });

  it("未知のキーは無視する（strict にしない。04 §2.3）", () => {
    expect(registerRespondentInputSchema.parse({ ...valid, extra: 1 })).not.toHaveProperty("extra");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["お名前が空白のみ", { name: " 　" }, "name"],
    ["お名前が 101 文字（コードポイント）", { name: "𠮷".repeat(101) }, "name"],
    ["電話番号が空白のみ", { phoneNumber: "　 " }, "phoneNumber"],
    ["電話番号が 31 文字", { phoneNumber: "0".repeat(31) }, "phoneNumber"],
    ["電話番号が数値", { phoneNumber: 9012345678 }, "phoneNumber"],
    ["職業 0", { occupationCode: 0 }, "occupationCode"],
    ["職業 1.5", { occupationCode: 1.5 }, "occupationCode"],
    ["職業 9（旧データの「その他」。欠番）", { occupationCode: 9 }, "occupationCode"],
    ["職業 11", { occupationCode: 11 }, "occupationCode"],
    ["診断経験の区分外", { diagnosisExperience: "yes" }, "diagnosisExperience"],
    ["区分の区分外", { kind: "executives" }, "kind"],
    ["組織 ID の形式不正", { organizationId: "" }, "organizationId"],
  ])("%s は拒否", (_, patch, path) => {
    expect(pathsOf(registerRespondentInputSchema.safeParse({ ...valid, ...patch }))).toContain(
      path,
    );
  });

  it("職業 10（責任者。K-21）は受理する", () => {
    expect(
      registerRespondentInputSchema.parse({ ...valid, occupationCode: 10 }).occupationCode,
    ).toBe(10);
  });
});

describe("M7-exam-09 saveAnswersInputSchema・examStepNoSchema", () => {
  it("stepNo 1〜4 を通し、0・5・1.5 を拒否する", () => {
    for (const stepNo of [1, 2, 3, 4])
      expect(examStepNoSchema.safeParse(stepNo).success).toBe(true);
    for (const stepNo of [0, 5, 1.5])
      expect(examStepNoSchema.safeParse(stepNo).success).toBe(false);
    expect(
      pathsOf(saveAnswersInputSchema.safeParse({ stepNo: 5, answers: answersOf([1]) })),
    ).toEqual(["stepNo"]);
  });

  it("answers 1〜41 件を通し、0 件・42 件を拒否する", () => {
    expect(saveAnswersInputSchema.safeParse({ stepNo: 4, answers: answersOf([144]) }).success).toBe(
      true,
    );
    expect(
      saveAnswersInputSchema.safeParse({ stepNo: 1, answers: answersOf(range(1, 41)) }).success,
    ).toBe(true);
    expect(pathsOf(saveAnswersInputSchema.safeParse({ stepNo: 1, answers: [] }))).toEqual([
      "answers",
    ]);
    expect(
      pathsOf(saveAnswersInputSchema.safeParse({ stepNo: 1, answers: answersOf(range(1, 42)) })),
    ).toEqual(["answers"]);
  });

  it("重複した設問番号は 2 件目の path が answers[{i}].questionNo（「設問番号が重複しています」）", () => {
    const result = saveAnswersInputSchema.safeParse({
      stepNo: 1,
      answers: [
        { questionNo: 1, choiceCode: 1 },
        { questionNo: 2, choiceCode: 1 },
        { questionNo: 1, choiceCode: 2 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["answers", 2, "questionNo"],
        message: "設問番号が重複しています",
      }),
    ]);
  });

  it("pageNo だけの本文（M7 より前の画面の形）は stepNo が無いので拒否する", () => {
    expect(
      pathsOf(saveAnswersInputSchema.safeParse({ pageNo: 1, answers: answersOf([1, 2]) })),
    ).toEqual(["stepNo"]);
  });

  it("設問番号 145・選択 6 は拒否する", () => {
    expect(
      pathsOf(
        saveAnswersInputSchema.safeParse({
          stepNo: 4,
          answers: [
            { questionNo: 145, choiceCode: 1 },
            { questionNo: 144, choiceCode: 6 },
          ],
        }),
      ),
    ).toEqual(["answers.0.questionNo", "answers.1.choiceCode"]);
  });
});

describe("assessmentLinkQuerySchema", () => {
  it("kind 省略時は applicant、区分外は拒否", () => {
    expect(assessmentLinkQuerySchema.parse({})).toEqual({ kind: "applicant" });
    expect(assessmentLinkQuerySchema.parse({ kind: "executive" })).toEqual({ kind: "executive" });
    expect(assessmentLinkQuerySchema.safeParse({ kind: "user" }).success).toBe(false);
  });
});
