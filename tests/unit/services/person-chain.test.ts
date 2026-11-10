// M7-list-01〜03 同じ人の受験を 1 行にまとめる buildPersonRows（11-2 §2.2・§5.1、K-31 ①）と findPersonRow。
// M7-zaiseki-20 組織内分類と在籍・退職で数える人の代表 selectCountedHeads（11-3 §2.2・§5.1、K-39 Q-10・Q-24）
import { describe, expect, it } from "vitest";

import {
  buildPersonRows,
  findPersonRow,
  selectCountedHeads,
  type PersonChainNode,
  type PersonRow,
} from "@/lib/services/person-chain";

const exam = (
  resultId: string,
  submittedAt: string,
  previousResultId: string | null = null,
): PersonChainNode => ({ resultId, previousResultId, submittedAt: new Date(submittedAt) });

const chains = (rows: readonly PersonRow<PersonChainNode>[]) =>
  rows.map((row) => row.chain.map((node) => node.resultId));

describe("M7-list-01 buildPersonRows", () => {
  it("1 回だけの受験は 1 行ずつ。行は代表の submittedAt の降順", () => {
    const rows = buildPersonRows([
      exam("R1", "2026-01-01T00:00:00Z"),
      exam("R3", "2026-03-01T00:00:00Z"),
      exam("R2", "2026-02-01T00:00:00Z"),
    ]);
    expect(chains(rows)).toEqual([["R3"], ["R2"], ["R1"]]);
    expect(rows.map((row) => row.head.resultId)).toEqual(["R3", "R2", "R1"]);
  });

  it("A→B→C（C の前回が B、B の前回が A）は 1 行で chain = [C, B, A]、代表は C", () => {
    const a = exam("A", "2024-01-01T00:00:00Z");
    const b = exam("B", "2025-01-01T00:00:00Z", "A");
    const c = exam("C", "2026-01-01T00:00:00Z", "B");
    const rows = buildPersonRows([a, c, b]);
    expect(chains(rows)).toEqual([["C", "B", "A"]]);
    expect(rows[0]!.head).toBe(c);
  });

  it("前回が入力に無い・自分自身なら、そこで止まる", () => {
    const rows = buildPersonRows([
      exam("B", "2026-02-01T00:00:00Z", "Missing"),
      exam("S", "2026-01-01T00:00:00Z", "S"),
    ]);
    expect(chains(rows)).toEqual([["B"], ["S"]]);
  });

  it("代表の submittedAt が同じ行は resultId の昇順（文字コードの順）", () => {
    const at = "2026-01-01T00:00:00Z";
    // 文字コードでは "RB"（B = 66）が "Ra"（a = 97）より前。localeCompare では逆になる
    const rows = buildPersonRows([exam("Ra", at), exam("R2", at), exam("RB", at)]);
    expect(chains(rows)).toEqual([["R2"], ["RB"], ["Ra"]]);
  });

  it("空の入力は空の行", () => {
    expect(buildPersonRows([])).toEqual([]);
  });
});

describe("M7-list-02 buildPersonRows（閲覧範囲で切れる）", () => {
  // R3 の前回が R2、R2 の前回が R1。R2 だけが既存スタッフの受験
  const r1 = exam("R1", "2024-01-01T00:00:00Z");
  const r2 = exam("R2", "2025-01-01T00:00:00Z", "R1");
  const r3 = exam("R3", "2026-01-01T00:00:00Z", "R2");

  it("オーナー以外の入力（R2 を含まない）では R3 と R1 の 2 行", () => {
    expect(chains(buildPersonRows([r1, r3]))).toEqual([["R3"], ["R1"]]);
  });

  it("オーナーの入力では 1 行（chain = [R3, R2, R1]）", () => {
    expect(chains(buildPersonRows([r1, r2, r3]))).toEqual([["R3", "R2", "R1"]]);
  });
});

describe("M7-list-03 buildPersonRows（守りの規則）", () => {
  it("同じ前回 P を指す A（古い）と B（新しい）では、P は B の行だけに入り、A の行は [A]", () => {
    const rows = buildPersonRows([
      exam("P", "2024-01-01T00:00:00Z"),
      exam("A", "2025-01-01T00:00:00Z", "P"),
      exam("B", "2026-01-01T00:00:00Z", "P"),
    ]);
    expect(chains(rows)).toEqual([["B", "P"], ["A"]]);
  });

  it("同じ前回を指す 2 つが同じ時刻なら、resultId の昇順で先の方の行に前回が入る", () => {
    const at = "2026-01-01T00:00:00Z";
    const rows = buildPersonRows([
      exam("P", "2024-01-01T00:00:00Z"),
      exam("Y", at, "P"),
      exam("X", at, "P"),
    ]);
    expect(chains(rows)).toEqual([["X", "P"], ["Y"]]);
  });

  it("輪になったデータ（A の前回が B、B の前回が A）でも、両方がどこかの行に 1 回だけ入る", () => {
    const rows = buildPersonRows([
      exam("A", "2026-01-01T00:00:00Z", "B"),
      exam("B", "2025-01-01T00:00:00Z", "A"),
      exam("C", "2024-01-01T00:00:00Z"),
    ]);
    const all = chains(rows).flat();
    expect([...all].sort()).toEqual(["A", "B", "C"]);
    expect(chains(rows)).toEqual([["A", "B"], ["C"]]);
  });

  it("輪に入る受験を前回とする受験は、輪の受験をたどり済みの所で止まる", () => {
    // D の前回が A、A と B が輪。D が代表になり [D, A, B]。どの受験も 1 回だけ
    const rows = buildPersonRows([
      exam("A", "2025-01-01T00:00:00Z", "B"),
      exam("B", "2024-01-01T00:00:00Z", "A"),
      exam("D", "2026-01-01T00:00:00Z", "A"),
    ]);
    expect(chains(rows)).toEqual([["D", "A", "B"]]);
  });
});

describe("findPersonRow", () => {
  const rows = buildPersonRows([
    exam("A", "2024-01-01T00:00:00Z"),
    exam("B", "2025-01-01T00:00:00Z", "A"),
    exam("X", "2023-01-01T00:00:00Z"),
  ]);

  it("代表でも前回でも、その受験を含む行を返す", () => {
    expect(findPersonRow(rows, "B")?.head.resultId).toBe("B");
    expect(findPersonRow(rows, "A")?.head.resultId).toBe("B");
    expect(findPersonRow(rows, "X")?.chain.map((n) => n.resultId)).toEqual(["X"]);
  });

  it("無い resultId は null", () => {
    expect(findPersonRow(rows, "Missing")).toBeNull();
  });
});

describe("M7-zaiseki-20 selectCountedHeads", () => {
  const counted = (
    resultId: string,
    submittedAt: string,
    options: { readonly previousResultId?: string; readonly isExcluded?: boolean } = {},
  ) => ({
    resultId,
    previousResultId: options.previousResultId ?? null,
    submittedAt: new Date(submittedAt),
    isExcluded: options.isExcluded ?? false,
  });
  const heads = (nodes: Parameters<typeof selectCountedHeads>[0]) =>
    selectCountedHeads(nodes).map((node) => node.resultId);

  it("除外中の受験を先に除く（K-39 Q-24）", () => {
    expect(
      heads([
        counted("R1", "2026-01-01T00:00:00Z"),
        counted("X", "2026-02-01T00:00:00Z", { isExcluded: true }),
      ]),
    ).toEqual(["R1"]);
  });

  it("R2 の前回が R1 なら R2 だけ（前回は数えない。K-39 Q-10）", () => {
    const r1 = counted("R1", "2025-01-01T00:00:00Z");
    const r2 = counted("R2", "2026-01-01T00:00:00Z", { previousResultId: "R1" });
    const result = selectCountedHeads([r1, r2]);
    expect(result.map((node) => node.resultId)).toEqual(["R2"]);
    expect(result[0]).toBe(r2);
  });

  it("R2（前回 R1）が除外中なら R1", () => {
    expect(
      heads([
        counted("R1", "2025-01-01T00:00:00Z"),
        counted("R2", "2026-01-01T00:00:00Z", { previousResultId: "R1", isExcluded: true }),
      ]),
    ).toEqual(["R1"]);
  });

  it("同じ前回 P を指す A・B（枝分かれ）は A と B。P は入らない", () => {
    expect(
      heads([
        counted("P", "2024-01-01T00:00:00Z"),
        counted("A", "2025-01-01T00:00:00Z", { previousResultId: "P" }),
        counted("B", "2026-01-01T00:00:00Z", { previousResultId: "P" }),
      ]),
    ).toEqual(["B", "A"]);
  });

  it("戻り値は submittedAt の降順、同じ時刻は resultId の昇順（文字コードの順）", () => {
    const at = "2026-01-01T00:00:00Z";
    expect(
      heads([
        counted("Old", "2025-01-01T00:00:00Z"),
        counted("Ra", at),
        counted("New", "2026-06-01T00:00:00Z"),
        counted("RB", at),
      ]),
    ).toEqual(["New", "RB", "Ra", "Old"]);
  });

  it("空の入力は空", () => {
    expect(selectCountedHeads([])).toEqual([]);
  });
});
