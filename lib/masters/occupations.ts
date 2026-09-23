// 職業マスタ（00 §1.10）。occupation_code は要件定義書 §6.1 U-02 の記載順

export const OCCUPATION_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type OccupationCode = (typeof OCCUPATION_CODES)[number];

export interface OccupationDefinition {
  readonly code: OccupationCode;
  readonly key: string;
  readonly label: string;
}

export const OCCUPATIONS: readonly OccupationDefinition[] = Object.freeze([
  { code: 1, key: "dentist", label: "歯科医師" },
  { code: 2, key: "dental_hygienist", label: "歯科衛生士" },
  { code: 3, key: "dental_assistant_reception", label: "歯科助手(アシスタント・受付)" },
  { code: 4, key: "assistant", label: "アシスタント" },
  { code: 5, key: "reception", label: "受付" },
  { code: 6, key: "treatment_coordinator", label: "TC" },
  { code: 7, key: "office_staff", label: "事務スタッフ" },
  { code: 8, key: "dental_technician", label: "技工士" },
  { code: 9, key: "other", label: "その他" },
] as const satisfies readonly OccupationDefinition[]);

const LABEL_BY_CODE: ReadonlyMap<number, string> = new Map(
  OCCUPATIONS.map((o) => [o.code, o.label]),
);

export function isOccupationCode(value: unknown): value is OccupationCode {
  return typeof value === "number" && LABEL_BY_CODE.has(value);
}

/** 職業コード → 表示名（07 §2.3 の AI 入力、06 の回答一覧で使う）。未知のコードは RangeError */
export function getOccupationLabel(code: number): string {
  const label = LABEL_BY_CODE.get(code);
  if (label === undefined) throw new RangeError(`未知の職業コードです: ${code}`);
  return label;
}
