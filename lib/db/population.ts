// 比較の母集団の選び方（00 §1.11 の 3・10、11-5 §2.1.2・§3.2）。純関数（Firestore・Next.js に依存しない）。
// 条件 1（同じ組織・論理削除されていない）は呼び出し元のクエリ（results-repository の fetchPopulation()。Q1（改））が担い、
// 本ファイルは条件 2〜5 で絞る。母集団の条件を置くのは fetchPopulation() と selectPopulation() の組だけ
import type {
  ComparisonScope,
  CompatibilityScores,
  PopulationMember,
  TeamCode,
  TraitScores,
} from "@/lib/scoring/types";

export interface PopulationRow extends PopulationMember {
  readonly resultId: string;
}

/** 母集団を選ぶ前の 1 件（同じ組織の論理削除されていない結果） */
export interface PopulationSourceRow {
  readonly resultId: string;
  readonly isExcluded: boolean;
  readonly scoringVersion: string;
  readonly teamCode: TeamCode | null;
  readonly previousResultId: string | null;
  readonly traits: TraitScores;
  readonly compatibility: CompatibilityScores;
}

/** ほかの結果の前回になっている結果の ID。自分自身を指す値は数えない（11-5 §2.1.2 の条件 2） */
export function supersededResultIds(
  rows: ReadonlyArray<Pick<PopulationSourceRow, "resultId" | "previousResultId">>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.previousResultId !== null && row.previousResultId !== row.resultId) {
      ids.add(row.previousResultId);
    }
  }
  return ids;
}

/**
 * 11-5 §2.1.2 の条件 2〜5 で絞る（条件 1 は呼び出し元のクエリ）: 置き換わっていない・除外されていない・採点の版が scoringVersion・
 * 組織全体なら全員／チームなら teamCode が一致。置き換わったかの判定は、除外・採点版・チームで絞る前の rows の全件で行う
 * （再受験した人は新しい受験だけを数える。10 K-39 Q-10）。戻り値は rows の順のまま、各行は resultId・traits・compatibility だけ
 * （PopulationRow は compareWithPopulation() にそのまま渡せる）
 */
export function selectPopulation(
  rows: readonly PopulationSourceRow[],
  scope: ComparisonScope,
  scoringVersion: string,
): readonly PopulationRow[] {
  const superseded = supersededResultIds(rows);
  return rows
    .filter(
      (row) =>
        !superseded.has(row.resultId) &&
        !row.isExcluded &&
        row.scoringVersion === scoringVersion &&
        (scope.kind === "organization" || row.teamCode === scope.teamCode),
    )
    .map((row) => ({
      resultId: row.resultId,
      traits: row.traits,
      compatibility: row.compatibility,
    }));
}
