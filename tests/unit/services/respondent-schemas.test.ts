// U-06 のうち受検者 API の入力（04 §4.1、§4.2、§4.4）
import { describe, expect, it } from "vitest";

import {
  assessmentLinkQuerySchema,
  examPageNoSchema,
  registerRespondentInputSchema,
  saveAnswersInputSchema,
} from "@/lib/services/schemas/respondent";

const valid = {
  organizationId: "Org7Kq2mN4pR8sT1vW3x",
  kind: "applicant",
  name: "山田 太郎",
  phoneNumber: "090-1234-5678",
  occupationCode: 2,
  diagnosisExperience: "first_time",
};

const pathsOf = (result: { success: boolean; error?: { issues: Array<{ path: unknown[] }> } }) =>
  result.success ? [] : (result.error?.issues ?? []).map((i) => i.path.join("."));

describe("registerRespondentInputSchema", () => {
  it("前後空白を除いた氏名と、正規化した電話番号を返す", () => {
    expect(
      registerRespondentInputSchema.parse({
        ...valid,
        name: "　山田 太郎　",
        phoneNumber: " ０９０－１２３４－５６７８ ",
      }),
    ).toMatchObject({ name: "山田 太郎", phoneNumber: "090-1234-5678" });
    expect(
      registerRespondentInputSchema.parse({ ...valid, phoneNumber: "+81 90 1234 5678" })
        .phoneNumber,
    ).toBe("+819012345678");
  });

  it("未知のキーは無視する（strict にしない。04 §2.3）", () => {
    expect(registerRespondentInputSchema.parse({ ...valid, extra: 1 })).not.toHaveProperty("extra");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["氏名が空白のみ", { name: " 　" }, "name"],
    ["氏名が 101 文字（コードポイント）", { name: "𠮷".repeat(101) }, "name"],
    ["電話番号が 21 文字", { phoneNumber: "1".repeat(21) }, "phoneNumber"],
    ["電話番号が数値", { phoneNumber: 9012345678 }, "phoneNumber"],
    ["職業 0", { occupationCode: 0 }, "occupationCode"],
    ["職業 1.5", { occupationCode: 1.5 }, "occupationCode"],
    ["診断経験の区分外", { diagnosisExperience: "yes" }, "diagnosisExperience"],
    ["区分の区分外", { kind: "executives" }, "kind"],
    ["組織 ID の形式不正", { organizationId: "" }, "organizationId"],
  ])("%s は拒否", (_, patch, path) => {
    expect(pathsOf(registerRespondentInputSchema.safeParse({ ...valid, ...patch }))).toContain(
      path,
    );
  });

  it("氏名 100 文字（コードポイント）は受理する", () => {
    expect(
      registerRespondentInputSchema.safeParse({ ...valid, name: "𠮷".repeat(100) }).success,
    ).toBe(true);
  });
});

describe("saveAnswersInputSchema・examPageNoSchema", () => {
  it("1〜8 件の回答と pageNo 1〜20 を受理する", () => {
    expect(
      saveAnswersInputSchema.safeParse({
        pageNo: 20,
        answers: [{ questionNo: 144, choiceCode: 5 }],
      }).success,
    ).toBe(true);
    expect(examPageNoSchema.safeParse(1).success).toBe(true);
    expect(examPageNoSchema.safeParse(20).success).toBe(true);
    expect(examPageNoSchema.safeParse(21).success).toBe(false);
    expect(examPageNoSchema.safeParse(1.5).success).toBe(false);
  });

  it("重複した設問番号は 2 件目の path に「設問番号が重複しています」", () => {
    const result = saveAnswersInputSchema.safeParse({
      pageNo: 1,
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
});

describe("assessmentLinkQuerySchema", () => {
  it("kind 省略時は applicant、区分外は拒否", () => {
    expect(assessmentLinkQuerySchema.parse({})).toEqual({ kind: "applicant" });
    expect(assessmentLinkQuerySchema.parse({ kind: "executive" })).toEqual({ kind: "executive" });
    expect(assessmentLinkQuerySchema.safeParse({ kind: "user" }).success).toBe(false);
  });
});
