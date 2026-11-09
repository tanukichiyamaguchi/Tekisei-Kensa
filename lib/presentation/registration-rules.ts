// 受験者登録の入力の規則（11-1 §2.2.1・§2.2.5・§3.5）。サーバの検証（lib/services/schemas/respondent.ts）も同じ規則で、
// お名前・電話番号の上限はここの定数を使う（値を 2 か所に置かない）。電話番号の書式・桁数は検査しない（K-39 Q-17）
import type { RespondentKind } from "@/lib/db/types";
import { isOccupationCode, OCCUPATIONS } from "@/lib/masters/occupations";

/** お名前の上限（コードポイント。K-42） */
export const NAME_MAX_LENGTH = 100;
/** 電話番号の上限（コードポイント。K-42） */
export const PHONE_MAX_LENGTH = 30;

export type DiagnosisExperienceValue = "first_time" | "experienced";
export type RegistrationField = "name" | "phoneNumber" | "occupationCode" | "diagnosisExperience";
export type RegistrationErrorCode = "V-01" | "V-02" | "V-03" | "V-04" | "V-05" | "V-06";

/** 判定順（お名前 → 電話番号 → 職業 → 過去の診断経験）。最初の不正な項目へのフォーカスにも使う */
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

/** 前後の空白（半角・全角）を除く（String.prototype.trim は U+3000 も除く。04 §2.3 の requiredText と同じ） */
export function normalizeText(raw: string): string {
  return raw.trim();
}

const cpLength = (s: string): number => Array.from(s).length;

/** 1 項目の最初のエラー。正しければ null（11-1 §2.2.5） */
export function validateRegistrationField(
  field: RegistrationField,
  draft: RegistrationDraft,
): RegistrationErrorCode | null {
  switch (field) {
    case "name": {
      const name = normalizeText(draft.name);
      // 改行を含む値は画面で拒否する（D05-17。type="text" の入力欄では通常入らない）
      if (name.length === 0 || /[\r\n]/.test(name)) return "V-01";
      return cpLength(name) > NAME_MAX_LENGTH ? "V-02" : null;
    }
    case "phoneNumber": {
      // 書式・桁数・文字の種類は見ない。正規化もしない（全角の数字・ハイフンもそのまま）
      const phone = normalizeText(draft.phoneNumber);
      if (phone.length === 0) return "V-03";
      return cpLength(phone) > PHONE_MAX_LENGTH ? "V-04" : null;
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

/** 項目ごとの最初のエラー。空なら正しい */
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

/**
 * 4 項目がそろっているか（「診断に進む」を押せない状態にする判定。11-1 §2.2.3）。
 * お名前・電話番号は前後の空白を除いて 1 文字以上、プルダウン 2 つは選択済み
 */
export function isRegistrationFilled(draft: RegistrationDraft): boolean {
  return (
    normalizeText(draft.name).length > 0 &&
    normalizeText(draft.phoneNumber).length > 0 &&
    draft.occupationCode !== null &&
    draft.diagnosisExperience !== null
  );
}

/** 上限を超えたエラー（V-02・V-04）か。「診断に進む」では赤枠に加えて R-07 も出す（11-1 §2.2.5） */
export function isOverLimit(code: RegistrationErrorCode): boolean {
  return code === "V-02" || code === "V-04";
}

/** 必須の文言（項目が空のときの文言） */
const REQUIRED_ERROR_CODES: Readonly<Record<RegistrationField, RegistrationErrorCode>> = {
  name: "V-01",
  phoneNumber: "V-03",
  occupationCode: "V-05",
  diagnosisExperience: "V-06",
};

/**
 * 422 VALIDATION_ERROR の details.issues[].path（04 §2.3）の先頭 → 項目と、読み上げの文言。登録の項目でない path は null。
 * 文言は今の入力の検査の結果で、画面の検査では正しい値（検査をすり抜けた場合）なら必須の文言にする（11-1 §2.2.6）
 */
export function issuePathToErrorCode(
  path: string,
  draft: RegistrationDraft,
): { readonly field: RegistrationField; readonly code: RegistrationErrorCode } | null {
  const head = path.split(/[.[]/)[0];
  const field = REGISTRATION_FIELDS.find((f) => f === head);
  if (field === undefined) return null;
  return { field, code: validateRegistrationField(field, draft) ?? REQUIRED_ERROR_CODES[field] };
}

/**
 * 受験リンクの p → 受検者区分（11-1 §2.2.1）。「executives」と完全に一致するときだけ既存スタッフ（executive）、
 * それ以外（user・無し・空・大文字小文字の違い・ほかの値）はすべて求職者（applicant）
 */
export function kindFromLinkParam(p: string | undefined): RespondentKind {
  return p === "executives" ? "executive" : "applicant";
}

/** 職業の選択肢（00 §1.10 の順、表示名そのまま。マスタ lib/masters/occupations.ts を正とする） */
export const OCCUPATION_OPTIONS: ReadonlyArray<{ readonly code: number; readonly label: string }> =
  OCCUPATIONS.map((o) => ({ code: o.code, label: o.label }));
