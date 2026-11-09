// 職業マスタ（00 §1.10）。アイリストのサロン向けの選択肢 9 項目（10 K-19 で既存システムの歯科向け 9 項目から
// 置き換え、K-21 で末尾に 10「責任者」を足した。9 は欠番）

export const OCCUPATION_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 10] as const; // 9 は欠番（旧データの「その他」の表示用）
export type OccupationCode = (typeof OCCUPATION_CODES)[number];

/** 職業「責任者」（参照元: 院長。K-21）。役職の札の既定（11-2）と AI 解説の出し分け（11-6）はこの定数で判定する */
export const MANAGER_OCCUPATION_CODE = 10 as const;

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
  { code: 10, key: "manager", label: "責任者" },
] as const satisfies readonly OccupationDefinition[]);

const LABEL_BY_CODE: ReadonlyMap<number, string> = new Map(
  OCCUPATIONS.map((o) => [o.code, o.label]),
);

/**
 * K-19 より前（歯科向け 9 項目）に保存されたコードのうち、今の一覧に無いもの。表示のためだけに残す
 * （旧 9「その他」。新規の登録では受け付けない。旧 1〜8 は今の一覧の同じコードとして表示される）
 */
const LEGACY_LABEL_BY_CODE: ReadonlyMap<number, string> = new Map([[9, "その他"]]);

export function isOccupationCode(value: unknown): value is OccupationCode {
  return typeof value === "number" && LABEL_BY_CODE.has(value);
}

/** 職業コード → 表示名（07 §2.3 の AI 入力、06 の回答一覧で使う）。旧コード 9 も引ける。未知のコードは RangeError */
export function getOccupationLabel(code: number): string {
  const label = LABEL_BY_CODE.get(code) ?? LEGACY_LABEL_BY_CODE.get(code);
  if (label === undefined) throw new RangeError(`未知の職業コードです: ${code}`);
  return label;
}
