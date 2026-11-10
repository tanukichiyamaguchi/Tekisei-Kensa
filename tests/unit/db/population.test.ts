// M7-compare-01 母集団の選び方（11-5 §2.1.2・§3.2、00 §1.11 の 3・10、10 K-39 Q-10）。純関数のため Firebase 不要
import { describe, expect, it } from "vitest";

import {
  selectPopulation,
  supersededResultIds,
  type PopulationSourceRow,
} from "@/lib/db/population";
import { COMPATIBILITY_KEYS, TRAIT_KEYS, type ComparisonScope } from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

const ORGANIZATION: ComparisonScope = { kind: "organization" };
const teamOf = (teamCode: "A" | "B"): ComparisonScope => ({ kind: "team", teamCode });

/** 母集団を選ぶ前の 1 件（指標は value で埋める。既定は除外なし・今の版・チームなし・前回なし） */
function row(
  resultId: string,
  overrides: Partial<Omit<PopulationSourceRow, "resultId">> = {},
  value = 10,
): PopulationSourceRow {
  return {
    resultId,
    isExcluded: false,
    scoringVersion: SCORING_VERSION,
    teamCode: null,
    previousResultId: null,
    traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, value])) as PopulationSourceRow["traits"],
    compatibility: Object.fromEntries(
      COMPATIBILITY_KEYS.map((k) => [k, value]),
    ) as PopulationSourceRow["compatibility"],
    ...overrides,
  };
}

const idsOf = (rows: ReadonlyArray<{ readonly resultId: string }>) => rows.map((r) => r.resultId);

describe("M7-compare-01 supersededResultIds", () => {
  it("ほかの結果の前回になっている結果の ID を集め、null と自分自身を指す値は数えない", () => {
    const ids = supersededResultIds([
      row("R1"),
      row("R2", { previousResultId: "R1" }),
      row("R3", { previousResultId: "R2" }),
      row("S", { previousResultId: "S" }),
      row("T", { previousResultId: "Gone" }),
    ]);
    expect([...ids].sort()).toEqual(["Gone", "R1", "R2"]);
  });
});

describe("M7-compare-01 selectPopulation", () => {
  it("R2 の前回が R1 なら、R1 は入らず R2 は入る（再受験した人は新しい受験だけを数える）", () => {
    const rows = [row("R1"), row("S"), row("R2", { previousResultId: "R1" })];
    expect(idsOf(selectPopulation(rows, ORGANIZATION, SCORING_VERSION))).toEqual(["S", "R2"]);
  });

  it("R2 が除外でも R1 は入らない（置き換わったかは除外で絞る前の全件で判定する）", () => {
    const rows = [row("R1"), row("S"), row("R2", { previousResultId: "R1", isExcluded: true })];
    expect(idsOf(selectPopulation(rows, ORGANIZATION, SCORING_VERSION))).toEqual(["S"]);
  });

  it("R2 が rows に無い（論理削除した）なら R1 が入る（つながりが切れる。K-39 Q-35）", () => {
    const rows = [row("R1"), row("S")];
    expect(idsOf(selectPopulation(rows, ORGANIZATION, SCORING_VERSION))).toEqual(["R1", "S"]);
  });

  it("自分自身を指す前回は無視する（その結果は入る）", () => {
    const rows = [row("S", { previousResultId: "S" })];
    expect(idsOf(selectPopulation(rows, ORGANIZATION, SCORING_VERSION))).toEqual(["S"]);
  });

  it("チーム A を選ぶと、チーム B の R2 の前回であるチーム A の R1 は入らない（チームで絞る前の全件で判定する）", () => {
    const rows = [
      row("R1", { teamCode: "A" }),
      row("S", { teamCode: "A" }),
      row("R2", { teamCode: "B", previousResultId: "R1" }),
    ];
    expect(idsOf(selectPopulation(rows, teamOf("A"), SCORING_VERSION))).toEqual(["S"]);
    expect(idsOf(selectPopulation(rows, teamOf("B"), SCORING_VERSION))).toEqual(["R2"]);
  });

  it("今の条件（除外・採点版・チーム）は変わらない: 除外・ほかの版・チーム外の結果は入らず、組織全体はチームを問わない", () => {
    const rows = [
      row("A1", { teamCode: "A" }),
      row("B1", { teamCode: "B" }),
      row("N1"),
      row("X1", { isExcluded: true }),
      row("V1", { scoringVersion: "0.9.9" }),
      row("V2", { scoringVersion: "" }),
    ];
    expect(idsOf(selectPopulation(rows, ORGANIZATION, SCORING_VERSION))).toEqual([
      "A1",
      "B1",
      "N1",
    ]);
    expect(idsOf(selectPopulation(rows, teamOf("A"), SCORING_VERSION))).toEqual(["A1"]);
    // 採点版で絞る前の全件で判定する: 今の版の R2 の前回であるほかの版の V1 は、その版を選んでも入らない
    expect(
      idsOf(
        selectPopulation(
          [row("V1", { scoringVersion: "0.9.9" }), row("R2", { previousResultId: "V1" })],
          ORGANIZATION,
          "0.9.9",
        ),
      ),
    ).toEqual([]);
  });

  it("戻り値は rows の順のまま、各行のキーは resultId・traits・compatibility だけで、値は rows のまま", () => {
    const rows = [row("Z", {}, 1), row("M", { teamCode: "A" }, 2), row("A", {}, 3)];
    const selected = selectPopulation(rows, ORGANIZATION, SCORING_VERSION);
    expect(idsOf(selected)).toEqual(["Z", "M", "A"]);
    for (const [i, r] of selected.entries()) {
      expect(Object.keys(r).sort()).toEqual(["compatibility", "resultId", "traits"]);
      expect(r.traits).toBe(rows[i]!.traits);
      expect(r.compatibility).toBe(rows[i]!.compatibility);
    }
    expect(selectPopulation([], ORGANIZATION, SCORING_VERSION)).toEqual([]);
  });
});
