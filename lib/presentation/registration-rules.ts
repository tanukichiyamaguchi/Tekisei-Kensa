// 受検者登録のクライアント側の入力チェック（05 §5.1.4、§10.3）。
// 規則の正は 04 §4.2 の registerRespondentInputSchema。電話番号の規則は lib/utils/phone-number.ts を共有し再定義しない（D05-16）
import type { RespondentKind } from "@/lib/db/types";
import { isOccupationCode, OCCUPATIONS } from "@/lib/masters/occupations";
import { normalizePhoneNumber, PHONE_PATTERN } from "@/lib/utils/phone-number";

export { normalizePhoneNumber, PHONE_PATTERN };

/** 02 の respondents.name 検証スキーマ、04 §2.3 requiredText(100) */
export const NAME_MAX_LENGTH = 100;

export type DiagnosisExperienceValue = "first_time" | "experienced";
export type RegistrationField = "name" | "phoneNumber" | "occupationCode" | "diagnosisExperience";
export type RegistrationErrorCode = "V-01" | "V-02" | "V-03" | "V-04" | "V-05" | "V-06";

/** 判定順（05 §10.3: 氏名 → 電話番号 → 職業 → 診断経験）。最初の不備項目へのフォーカスにも使う */
export const REGISTRATION_FIELDS: readonly RegistrationField[] = [
  "name",
  "phoneNumber",
  "occupationCode",
  "diagnosisExperience",
];

export interface RegistrationDraft {
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationCode: number | null;
  readonly diagnosisExperience: DiagnosisExperienceValue | null;
}

/** 前後の空白（半角・全角）を除く（String.prototype.trim は U+3000 も除く。04 §2.3 と同じ） */
export function normalizeName(raw: string): string {
  return raw.trim();
}

const cpLength = (s: string): number => Array.from(s).length;

/** 1 項目の最初のエラー。妥当なら null */
export function validateRegistrationField(
  field: RegistrationField,
  draft: RegistrationDraft,
): RegistrationErrorCode | null {
  switch (field) {
    case "name": {
      const name = normalizeName(draft.name);
      // 改行を含む値は画面側で拒否する（D05-17。type="text" の入力欄では通常入らない）
      if (name.length === 0 || /[\r\n]/.test(name)) return "V-01";
      return cpLength(name) > NAME_MAX_LENGTH ? "V-02" : null;
    }
    case "phoneNumber": {
      const phone = normalizePhoneNumber(draft.phoneNumber);
      if (phone.length === 0) return "V-03";
      return PHONE_PATTERN.test(phone) ? null : "V-04";
    }
    case "occupationCode":
      return isOccupationCode(draft.occupationCode) ? null : "V-05";
    case "diagnosisExperience":
      return draft.diagnosisExperience === "first_time" ||
        draft.diagnosisExperience === "experienced"
        ? null
        : "V-06";
  }
}

/** 項目ごとの最初のエラー。空なら妥当 */
export function validateRegistration(
  draft: RegistrationDraft,
): Readonly<Partial<Record<RegistrationField, RegistrationErrorCode>>> {
  const errors: Partial<Record<RegistrationField, RegistrationErrorCode>> = {};
  for (const field of REGISTRATION_FIELDS) {
    const code = validateRegistrationField(field, draft);
    if (code) errors[field] = code;
  }
  return errors;
}

/** 必須項目がすべて入力されているか（「診断に進む」の aria-disabled の判定。05 §5.1.5） */
export function isRegistrationFilled(draft: RegistrationDraft): boolean {
  return (
    normalizeName(draft.name).length > 0 &&
    normalizePhoneNumber(draft.phoneNumber).length > 0 &&
    draft.occupationCode !== null &&
    draft.diagnosisExperience !== null
  );
}

/**
 * 422 VALIDATION_ERROR の details.issues[].path（04 §2.3）→ 項目と V-xx。対応しない path は null（画面は E-05 として扱う）。
 * 文言は 05 §9 で固定するため、name は常に V-01、phoneNumber は常に V-04
 */
export function issuePathToErrorCode(
  path: string,
): { readonly field: RegistrationField; readonly code: RegistrationErrorCode } | null {
  const head = path.split(/[.[]/)[0];
  switch (head) {
    case "name":
      return { field: "name", code: "V-01" };
    case "phoneNumber":
      return { field: "phoneNumber", code: "V-04" };
    case "occupationCode":
      return { field: "occupationCode", code: "V-05" };
    case "diagnosisExperience":
      return { field: "diagnosisExperience", code: "V-06" };
    default:
      return null;
  }
}

/** 受検リンクの p（user / executives）→ 区分（00 D-12）。それ以外は null（organization_not_found） */
export function kindFromLinkParam(p: string | undefined): RespondentKind | null {
  if (p === "user") return "applicant";
  if (p === "executives") return "executive";
  return null;
}

/** 職業の選択肢（00 §1.10 の順、表示名そのまま。マスタ lib/masters/occupations.ts を正とする） */
export const OCCUPATION_OPTIONS: ReadonlyArray<{ readonly code: number; readonly label: string }> =
  OCCUPATIONS.map((o) => ({ code: o.code, label: o.label }));
