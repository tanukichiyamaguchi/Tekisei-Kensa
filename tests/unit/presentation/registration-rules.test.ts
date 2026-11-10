// M7-exam-05 p と prev の判定、M7-exam-07 入力の規則（11-1 §2.2.1・§2.2.5・§2.2.8・§3.5、K-42）。
// U-03 の登録の入力規則と電話番号の部分は、この 2 つに置き換えた（11-1 §5.5）
import { describe, expect, it } from "vitest";

import { docIdSchema } from "@/lib/db/schemas/values";
import { OCCUPATIONS } from "@/lib/masters/occupations";
import { CHOICE_OPTIONS, isChoiceCode } from "@/lib/presentation/exam-choices";
import {
  isOverLimit,
  isRegistrationFilled,
  issuePathToErrorCode,
  kindFromLinkParam,
  NAME_MAX_LENGTH,
  normalizeText,
  OCCUPATION_OPTIONS,
  PHONE_MAX_LENGTH,
  previousResultIdFromParam,
  validateRegistration,
  validateRegistrationField,
  type RegistrationDraft,
  type RegistrationErrorCode,
} from "@/lib/presentation/registration-rules";
import { registerRespondentInputSchema } from "@/lib/services/schemas/respondent";

const valid: RegistrationDraft = {
  name: "見本 花子",
  phoneNumber: "00000000000",
  occupationCode: 2,
  diagnosisExperience: "first_time",
};

describe("M7-exam-05 p の判定（kindFromLinkParam）", () => {
  it("「executives」と完全に一致するときだけ executive", () => {
    expect(kindFromLinkParam("executives")).toBe("executive");
  });
  it.each([["user"], [undefined], [""], ["EXECUTIVES"], ["x"], ["executive"], [" executives"]])(
    "%s は applicant（null を返さない）",
    (p) => {
      expect(kindFromLinkParam(p)).toBe("applicant");
    },
  );
});

describe("M7-exam-05 prev の判定（previousResultIdFromParam。11-1 §2.2.8）", () => {
  /** 文書 ID の形の見本（架空の ID） */
  const accepted = ["ResExample0000000001", "a", "Z9", "a".repeat(128)];
  /** 形の違う見本と、その説明 */
  const rejected: ReadonlyArray<readonly [string | undefined, string]> = [
    [undefined, "無い"],
    ["", "空"],
    ["a/b", "区切りの記号"],
    ["a".repeat(129), "129 文字"],
    ["bad-id", "記号"],
    ["Res Example", "空白"],
    ["Res%2FExample", "符号化した記号"],
    ["結果0000000001", "全角の文字"],
    ["ＲｅｓＥｘａｍｐｌｅ", "全角の英字"],
  ];

  it("英数字 1〜128 文字だけをそのまま返す", () => {
    for (const prev of accepted) expect(previousResultIdFromParam(prev)).toBe(prev);
  });

  it("無い・空・a/b・129 文字・記号や空白や全角を含む値は undefined", () => {
    for (const [prev, label] of rejected) {
      expect(previousResultIdFromParam(prev), label).toBeUndefined();
    }
  });

  it("サーバの docIdSchema（04 §2.1）と同じ判定（同じ見本の値で一致）", () => {
    for (const prev of accepted) expect(docIdSchema.safeParse(prev).success, prev).toBe(true);
    for (const [prev, label] of rejected) {
      if (prev !== undefined) expect(docIdSchema.safeParse(prev).success, label).toBe(false);
    }
  });
});

describe("M7-exam-07 入力の規則", () => {
  it("上限はお名前 100 文字・電話番号 30 文字（K-42）", () => {
    expect([NAME_MAX_LENGTH, PHONE_MAX_LENGTH]).toEqual([100, 30]);
  });

  it("normalizeText は前後の空白（全角を含む）だけを除く", () => {
    expect(normalizeText("　見本 花子　")).toBe("見本 花子");
    expect(normalizeText(" \t０９０ー１２３４　")).toBe("０９０ー１２３４");
    expect(normalizeText("見本　花子")).toBe("見本　花子");
  });

  it("お名前: 前後の空白を除いて判定。空白だけは V-01、100 文字（コードポイント）は通り 101 文字は V-02、改行は V-01", () => {
    const nameError = (name: string) => validateRegistrationField("name", { ...valid, name });
    expect(nameError("")).toBe("V-01");
    expect(nameError(" 　 ")).toBe("V-01");
    expect(nameError("𠮷".repeat(100))).toBeNull();
    expect(nameError("𠮷".repeat(101))).toBe("V-02");
    expect(nameError(`\u3000${"あ".repeat(100)}\u3000`)).toBeNull();
    expect(nameError("見本\n花子")).toBe("V-01");
  });

  it("電話番号: 書式・桁数・文字の種類を見ない。空白だけは V-03、30 文字は通り 31 文字は V-04", () => {
    const phoneError = (phoneNumber: string) =>
      validateRegistrationField("phoneNumber", { ...valid, phoneNumber });
    for (const ok of [
      "abc",
      "０９０－１２３４",
      "+81 (90)",
      "1",
      " 00000000000 ",
      "0".repeat(30),
    ]) {
      expect(phoneError(ok), ok).toBeNull();
    }
    expect(phoneError("")).toBe("V-03");
    expect(phoneError("　 ")).toBe("V-03");
    expect(phoneError("0".repeat(31))).toBe("V-04");
    expect(phoneError(`\u3000${"０".repeat(30)}\u3000`)).toBeNull();
  });

  it("職業は 1〜8・10（10 は通り 9 は V-05）、過去の診断経験は first_time・experienced", () => {
    const occupationError = (occupationCode: number | null) =>
      validateRegistrationField("occupationCode", { ...valid, occupationCode });
    expect(occupationError(10)).toBeNull();
    expect(occupationError(1)).toBeNull();
    expect(occupationError(9)).toBe("V-05");
    expect(occupationError(null)).toBe("V-05");
    expect(
      validateRegistrationField("diagnosisExperience", { ...valid, diagnosisExperience: null }),
    ).toBe("V-06");
    expect(
      validateRegistrationField("diagnosisExperience", {
        ...valid,
        diagnosisExperience: "experienced",
      }),
    ).toBeNull();
  });

  it("validateRegistration は項目の順（お名前 → 電話番号 → 職業 → 過去の診断経験）に最初のエラーを返す", () => {
    expect(validateRegistration(valid)).toEqual({});
    const empty = validateRegistration({
      name: "",
      phoneNumber: "",
      occupationCode: null,
      diagnosisExperience: null,
    });
    expect(empty).toEqual({
      name: "V-01",
      phoneNumber: "V-03",
      occupationCode: "V-05",
      diagnosisExperience: "V-06",
    });
    expect(Object.keys(empty)).toEqual([
      "name",
      "phoneNumber",
      "occupationCode",
      "diagnosisExperience",
    ]);
  });

  it("isRegistrationFilled は 4 項目がそろったときだけ true（上限を超えた値でもそろっていれば true）", () => {
    expect(isRegistrationFilled(valid)).toBe(true);
    expect(isRegistrationFilled({ ...valid, name: "　" })).toBe(false);
    expect(isRegistrationFilled({ ...valid, phoneNumber: " " })).toBe(false);
    expect(isRegistrationFilled({ ...valid, occupationCode: null })).toBe(false);
    expect(isRegistrationFilled({ ...valid, diagnosisExperience: null })).toBe(false);
    expect(isRegistrationFilled({ ...valid, phoneNumber: "0".repeat(31) })).toBe(true);
  });

  it("isOverLimit は V-02・V-04 だけ true", () => {
    const codes: RegistrationErrorCode[] = ["V-01", "V-02", "V-03", "V-04", "V-05", "V-06"];
    expect(codes.filter(isOverLimit)).toEqual(["V-02", "V-04"]);
  });

  it("issuePathToErrorCode は path の先頭を項目に写し、文言は今の入力の検査の結果（正しい値なら必須の文言）", () => {
    expect(issuePathToErrorCode("name", valid)).toEqual({ field: "name", code: "V-01" });
    expect(issuePathToErrorCode("phoneNumber", valid)).toEqual({
      field: "phoneNumber",
      code: "V-03",
    });
    expect(issuePathToErrorCode("occupationCode", valid)).toEqual({
      field: "occupationCode",
      code: "V-05",
    });
    expect(issuePathToErrorCode("diagnosisExperience", valid)).toEqual({
      field: "diagnosisExperience",
      code: "V-06",
    });
    expect(issuePathToErrorCode("phoneNumber", { ...valid, phoneNumber: "0".repeat(31) })).toEqual({
      field: "phoneNumber",
      code: "V-04",
    });
    expect(issuePathToErrorCode("name.0", { ...valid, name: "" })).toEqual({
      field: "name",
      code: "V-01",
    });
    for (const path of ["organizationId", "kind", "answers[0].questionNo", "", "names"]) {
      expect(issuePathToErrorCode(path, valid), path).toBeNull();
    }
  });

  it("画面で正しいとした値は、前後の空白を除いた値のままサーバのスキーマ（11-1 §3.4.1）でも通る。上限を超えた値は両方で拒否", () => {
    const draftOf = (phoneNumber: string, name = valid.name): RegistrationDraft => ({
      ...valid,
      name,
      phoneNumber,
    });
    const serverAccepts = (draft: RegistrationDraft) =>
      registerRespondentInputSchema.safeParse({
        organizationId: "OrgExample0000000001",
        kind: "applicant",
        name: normalizeText(draft.name),
        phoneNumber: normalizeText(draft.phoneNumber),
        occupationCode: draft.occupationCode,
        diagnosisExperience: draft.diagnosisExperience,
      }).success;
    for (const phone of ["０９０－１２３４", "+81 (90)", "abc", "0".repeat(30)]) {
      expect(validateRegistration(draftOf(phone))).toEqual({});
      expect(serverAccepts(draftOf(phone)), phone).toBe(true);
    }
    expect(validateRegistration(draftOf("0".repeat(31))).phoneNumber).toBe("V-04");
    expect(serverAccepts(draftOf("0".repeat(31)))).toBe(false);
    expect(validateRegistration(draftOf("0", "あ".repeat(101))).name).toBe("V-02");
    expect(serverAccepts(draftOf("0", "あ".repeat(101)))).toBe(false);
  });

  it("職業の選択肢はマスタ（00 §1.10）の順・表示名そのまま（10「責任者」が末尾）", () => {
    expect(OCCUPATION_OPTIONS).toEqual(OCCUPATIONS.map((o) => ({ code: o.code, label: o.label })));
    expect(OCCUPATION_OPTIONS.map((o) => o.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10]);
    expect(OCCUPATION_OPTIONS.at(-1)?.label).toBe("責任者");
  });
});

describe("U-03 exam-choices", () => {
  it("選択肢 5 件の表示順と choice_code の対応（05 §2.4、付録A）", () => {
    expect(CHOICE_OPTIONS).toEqual([
      { code: 1, label: "そう思う" },
      { code: 2, label: "どちらかと言えばそう思う" },
      { code: 3, label: "どちらでもない" },
      { code: 4, label: "どちらかと言えばそう思わない" },
      { code: 5, label: "そう思わない" },
    ]);
    expect([1, 2, 3, 4, 5].every(isChoiceCode)).toBe(true);
    expect([0, 6, "1", null, 1.5].some(isChoiceCode)).toBe(false);
  });
});
