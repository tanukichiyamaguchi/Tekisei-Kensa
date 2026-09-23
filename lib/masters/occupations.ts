// 職業マスタ（00 §1.10）。アイリストのサロン向けの選択肢（10 K-19。既存システムの歯科向け 9 項目から置き換え）

export const OCCUPATION_CODES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type OccupationCode = (typeof OCCUPATION_CODES)[number];

export interface OccupationDefinition {
  readonly code: OccupationCode;
  readonly key: string;
  readonly label: string;
}

export const OCCUPATIONS: readonly OccupationDefinition[] = Object.freeze([
  { code: 1, key: "eyelist", label: "アイリスト" },
  { code: 2, key: "eyelist_assistant", label: "アイリスト（アシスタント・見習い）" },
  { code: 3, key: "nailist", label: "ネイリスト" },
  { code: 4, key: "hairdresser", label: "美容師" },
  { code: 5, key: "esthetician", label: "エステティシャン" },
  { code: 6, key: "reception", label: "受付" },
  { code: 7, key: "office_staff", label: "事務スタッフ" },
  { code: 8, key: "other", label: "その他" },
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
