// U-03（登録の入力規則・選択肢）、05/T-03〜T-05 の単体部分（05 §10.2、§10.3、D05-16、D05-17）
import { describe, expect, it } from "vitest";

import { OCCUPATIONS } from "@/lib/masters/occupations";
import { CHOICE_OPTIONS, isChoiceCode } from "@/lib/presentation/exam-choices";
import * as rules from "@/lib/presentation/registration-rules";
import {
  isRegistrationFilled,
  issuePathToErrorCode,
  kindFromLinkParam,
  normalizeName,
  normalizePhoneNumber,
  OCCUPATION_OPTIONS,
  PHONE_PATTERN,
  validateRegistration,
  type RegistrationDraft,
} from "@/lib/presentation/registration-rules";
import { registerRespondentInputSchema } from "@/lib/services/schemas/respondent";
import * as phone from "@/lib/utils/phone-number";

const valid: RegistrationDraft = {
  name: "山田 太郎",
  phoneNumber: "090-1234-5678",
  occupationCode: 2,
  diagnosisExperience: "first_time",
};

describe("U-03 registration-rules", () => {
  it("電話番号の規則は lib/utils/phone-number.ts の再エクスポート（再定義しない。D05-16）", () => {
    expect(rules.normalizePhoneNumber).toBe(phone.normalizePhoneNumber);
    expect(rules.PHONE_PATTERN).toBe(phone.PHONE_PATTERN);
  });

  it("05 §10.3 の単体テストの例", () => {
    expect(normalizeName("　山田 太郎　")).toBe("山田 太郎");
    expect(normalizePhoneNumber("０９０－１２３４－５６７８")).toBe("090-1234-5678");
    expect(normalizePhoneNumber("090 1234 5678")).toBe("09012345678");
    expect(normalizePhoneNumber("+81 90 1234 5678")).toBe("+819012345678");
    for (const ok of [
      "090-1234-5678",
      "09012345678",
      "0312345678",
      "03(1234)5678",
      "+819012345678",
    ]) {
      expect(PHONE_PATTERN.test(ok)).toBe(true);
    }
    const phoneError = (raw: string) =>
      validateRegistration({ ...valid, phoneNumber: raw }).phoneNumber;
    expect(phoneError("12345")).toBe("V-04");
    expect(phoneError("1".repeat(21))).toBe("V-04");
    expect(phoneError("abc-1234-5678")).toBe("V-04");
    expect(phoneError("")).toBe("V-03");
    expect(phoneError("　 ")).toBe("V-03");
    expect(phoneError("０３－１２３４－５６７８")).toBeUndefined();
    expect(phoneError("+81 3 1234 5678")).toBeUndefined();
    expect(validateRegistration({ ...valid, name: "あ".repeat(101) }).name).toBe("V-02");
    expect(issuePathToErrorCode("phoneNumber")).toEqual({ field: "phoneNumber", code: "V-04" });
  });

  it("氏名: 空・空白のみは V-01、101 文字（コードポイント）は V-02、100 文字は可、改行は不可（D05-17）", () => {
    const nameError = (name: string) => validateRegistration({ ...valid, name }).name;
    expect(nameError("")).toBe("V-01");
    expect(nameError(" 　 ")).toBe("V-01");
    expect(nameError("𠮷".repeat(100))).toBeUndefined();
    expect(nameError("𠮷".repeat(101))).toBe("V-02");
    expect(nameError("山田\n太郎")).toBe("V-01");
  });

  it("職業・診断経験の未選択は V-05・V-06。全項目が妥当ならエラーなし", () => {
    expect(validateRegistration(valid)).toEqual({});
    expect(validateRegistration({ ...valid, occupationCode: null }).occupationCode).toBe("V-05");
    expect(validateRegistration({ ...valid, occupationCode: 10 }).occupationCode).toBe("V-05");
    expect(validateRegistration({ ...valid, diagnosisExperience: null }).diagnosisExperience).toBe(
      "V-06",
    );
    expect(
      validateRegistration({
        name: "",
        phoneNumber: "",
        occupationCode: null,
        diagnosisExperience: null,
      }),
    ).toEqual({
      name: "V-01",
      phoneNumber: "V-03",
      occupationCode: "V-05",
      diagnosisExperience: "V-06",
    });
  });

  it("画面で妥当とした値はサーバのスキーマ（04 §4.2）でも受理される（05/T-04）", () => {
    for (const raw of [
      "０９０－１２３４－５６７８",
      "090 1234 5678",
      "03(1234)5678",
      "+81 90 1234 5678",
    ]) {
      expect(validateRegistration({ ...valid, phoneNumber: raw })).toEqual({});
      expect(
        registerRespondentInputSchema.safeParse({
          organizationId: "Org1",
          kind: "applicant",
          ...valid,
          phoneNumber: normalizePhoneNumber(raw),
        }).success,
      ).toBe(true);
    }
  });

  it("「診断に進む」の有効化は全必須項目の入力で判定する（05 §5.1.5）", () => {
    expect(isRegistrationFilled(valid)).toBe(true);
    expect(isRegistrationFilled({ ...valid, name: "　" })).toBe(false);
    expect(isRegistrationFilled({ ...valid, phoneNumber: "" })).toBe(false);
    expect(isRegistrationFilled({ ...valid, occupationCode: null })).toBe(false);
    expect(isRegistrationFilled({ ...valid, diagnosisExperience: null })).toBe(false);
    // 入力済みでも形式不正はあり得る（押下時に検証する）
    expect(isRegistrationFilled({ ...valid, phoneNumber: "12" })).toBe(true);
  });

  it("issuePathToErrorCode は項目名の path だけを対応づける（name は常に V-01）", () => {
    expect(issuePathToErrorCode("name")).toEqual({ field: "name", code: "V-01" });
    expect(issuePathToErrorCode("occupationCode")).toEqual({
      field: "occupationCode",
      code: "V-05",
    });
    expect(issuePathToErrorCode("diagnosisExperience")).toEqual({
      field: "diagnosisExperience",
      code: "V-06",
    });
    expect(issuePathToErrorCode("organizationId")).toBeNull();
    expect(issuePathToErrorCode("kind")).toBeNull();
    expect(issuePathToErrorCode("answers[0].questionNo")).toBeNull();
  });

  it("05/T-05: p は user → applicant、executives → executive、それ以外は null", () => {
    expect(kindFromLinkParam("user")).toBe("applicant");
    expect(kindFromLinkParam("executives")).toBe("executive");
    expect(kindFromLinkParam("executive")).toBeNull();
    expect(kindFromLinkParam("")).toBeNull();
    expect(kindFromLinkParam(undefined)).toBeNull();
  });

  it("職業の選択肢はマスタ（00 §1.10）の順・表示名そのまま", () => {
    expect(OCCUPATION_OPTIONS).toEqual(OCCUPATIONS.map((o) => ({ code: o.code, label: o.label })));
    expect(OCCUPATION_OPTIONS.map((o) => o.label)).toEqual([
      "アイリスト",
      "アイリスト（アシスタント・見習い）",
      "ネイリスト",
      "美容師",
      "エステティシャン",
      "受付",
      "事務スタッフ",
      "その他",
    ]);
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
