// 回答一覧の表示の規則（11-2 §2.5〜§2.9・§2.12・§2.19・§2.21・§3.11・§5.1。lib/presentation/result-list-view.ts）。
// M7-list-04 computeListStats、M7-list-05 のうち isOneYearOrMorePassed（addOneYearInTokyo の分は tests/unit/utils/tokyo-time.test.ts）、
// M7-list-06〜11・14・16・17、M7-list-49 employmentMenuPosition と、⋮メニュー・リンクのメニューの位置 popupMenuPosition
import { describe, expect, it } from "vitest";

import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import {
  clearFilters,
  computeListStats,
  DEFAULT_LIST_FILTER,
  emptyStateKind,
  employmentMenuPosition,
  filterAndSortRows,
  hasActiveFilters,
  isOneYearOrMorePassed,
  normalizeSearchText,
  parseStoredFilter,
  popupMenuPosition,
  rowChips,
  rowMenuModel,
  typeDot,
  usedTeamCodes,
  type ListFilterState,
} from "@/lib/presentation/result-list-view";
import { APTITUDE_TYPE_KEYS, type AptitudeTypeKey } from "@/lib/scoring/types";
import type { ResultListExamDto, ResultListRowDto } from "@/lib/services/dto/admin";

/** 基準時刻（東京 2026-11-10 12:00） */
const NOW = new Date("2026-11-10T03:00:00.000Z");
/** 基準時刻より 1 年以上前の受験と、1 年たっていない受験 */
const OLD_AT = "2025-06-01T00:00:00.000Z";
const RECENT_AT = "2026-11-01T00:00:00.000Z";

function exam(id: string, submittedAt: string, hasLongitudinalReport = false): ResultListExamDto {
  return {
    resultId: `Res${id}`,
    respondentId: `Rsp${id}`,
    submittedAt,
    hasLongitudinalReport,
  };
}

/** 回答一覧の 1 行（架空の値）。exams を渡さなければ代表だけの 1 件のつながり */
function row(
  id: string,
  overrides: Partial<Omit<ResultListRowDto, "resultId" | "respondentId">> = {},
): ResultListRowDto {
  const submittedAt = overrides.submittedAt ?? RECENT_AT;
  return {
    resultId: `Res${id}`,
    respondentId: `Rsp${id}`,
    name: `テストテスト ${id}`,
    phoneNumber: `090-0000-00${id.padStart(2, "0").slice(-2)}`,
    occupationCode: 1,
    teamCode: null,
    isExcluded: false,
    employmentStatus: "candidate",
    hiredOn: null,
    leftOn: null,
    staffRole: null,
    aptitudeType: "attendant",
    submittedAt,
    exams: [exam(id, submittedAt)],
    ...overrides,
  };
}

/** つながりの行（submittedAts[0] が代表。前回・前々回…の順） */
function chainRow(
  id: string,
  submittedAts: readonly string[],
  overrides: Partial<
    Omit<ResultListRowDto, "resultId" | "respondentId" | "submittedAt" | "exams">
  > = {},
  longitudinal: readonly boolean[] = [],
): ResultListRowDto {
  const exams = submittedAts.map((at, i) =>
    exam(i === 0 ? id : `${id}p${i}`, at, longitudinal[i] ?? false),
  );
  return row(id, { ...overrides, submittedAt: submittedAts[0]!, exams });
}

const ids = (rows: readonly ResultListRowDto[]) => rows.map((r) => r.resultId);
const state = (patch: Partial<ListFilterState> = {}): ListFilterState => ({
  ...DEFAULT_LIST_FILTER,
  ...patch,
});

describe("M7-list-04 computeListStats（集計カードと区分タブの数）", () => {
  const rows = [
    // 今月の 1 日 0:00（東京。UTC では前日 15:00）ちょうど → 今月
    row("01", { employmentStatus: "candidate", submittedAt: "2026-10-31T15:00:00.000Z" }),
    // 代表は今月の 1 日 0:00 の 1 ミリ秒前 → 先月。前回は 1 年以上前で、どちらの月でもない
    chainRow(
      "02",
      ["2026-10-31T14:59:59.999Z", "2025-09-01T00:00:00.000Z"],
      { employmentStatus: "employed" },
      [true, false],
    ),
    // 先月の 1 日 0:00 ちょうど → 先月
    row("03", { employmentStatus: "left", submittedAt: "2026-09-30T15:00:00.000Z" }),
    // 先月の 1 日 0:00 の 1 ミリ秒前 → どちらでもない
    row("04", { employmentStatus: "candidate", submittedAt: "2026-09-30T14:59:59.999Z" }),
    // 受験からちょうど 1 年 → 受験から1年以上
    row("05", { employmentStatus: "employed", submittedAt: "2025-11-10T03:00:00.000Z" }),
    // 3 件のつながり（今月・先月・1 年以上前）。経年比較ありは代表と前回
    chainRow(
      "06",
      ["2026-11-05T00:00:00.000Z", "2026-10-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"],
      { employmentStatus: "candidate" },
      [true, true, false],
    ),
  ];

  it("行数・受験の件数・区分ごとの行数・今月・先月・受験から1年以上・経年比較レポート・2 回以上の人数", () => {
    expect(computeListStats(rows, NOW)).toEqual({
      rowCount: 6,
      examCount: 9,
      candidateRows: 3,
      employedRows: 2,
      leftRows: 1,
      thisMonthExams: 2,
      lastMonthExams: 3,
      oneYearRows: 1,
      longitudinalReports: 3,
      multiExamRows: 2,
    });
  });

  it("退職の行は受講者（求職者）にも既存スタッフ（在籍）にも数えない", () => {
    const stats = computeListStats([row("01", { employmentStatus: "left" })], NOW);
    expect(stats).toMatchObject({ rowCount: 1, candidateRows: 0, employedRows: 0, leftRows: 1 });
  });

  it("年の境目: 1 月の基準時刻では、前の年の 12 月が先月", () => {
    const january = new Date("2027-01-05T00:00:00.000Z"); // 東京 2027-01-05 09:00
    const stats = computeListStats(
      [
        row("01", { submittedAt: "2026-12-31T15:00:00.000Z" }), // 東京 2027-01-01 0:00 → 今月
        row("02", { submittedAt: "2026-12-31T14:59:59.999Z" }), // 東京 2026-12-31 → 先月
        row("03", { submittedAt: "2026-11-30T15:00:00.000Z" }), // 東京 2026-12-01 0:00 → 先月
        row("04", { submittedAt: "2026-11-30T14:59:59.999Z" }), // 東京 2026-11-30 → どちらでもない
      ],
      january,
    );
    expect(stats).toMatchObject({ thisMonthExams: 1, lastMonthExams: 2 });
  });

  it("0 行ならすべて 0", () => {
    expect(computeListStats([], NOW)).toEqual({
      rowCount: 0,
      examCount: 0,
      candidateRows: 0,
      employedRows: 0,
      leftRows: 0,
      thisMonthExams: 0,
      lastMonthExams: 0,
      oneYearRows: 0,
      longitudinalReports: 0,
      multiExamRows: 0,
    });
  });
});

describe("M7-list-05 isOneYearOrMorePassed（受験から1年以上。≤）", () => {
  it("1 年後のちょうど同じ時刻は真（ちょうどを含む）、1 ミリ秒前は偽", () => {
    const at = "2025-11-10T03:00:00.000Z";
    expect(isOneYearOrMorePassed(at, new Date("2026-11-10T03:00:00.000Z"))).toBe(true);
    expect(isOneYearOrMorePassed(at, new Date("2026-11-10T02:59:59.999Z"))).toBe(false);
  });

  it("2024-02-29 の受験（東京 10:00）は 2025-03-01 の同じ時刻から真", () => {
    const at = "2024-02-29T01:00:00.000Z";
    expect(isOneYearOrMorePassed(at, new Date("2025-02-28T01:00:00.000Z"))).toBe(false);
    expect(isOneYearOrMorePassed(at, new Date("2025-03-01T00:59:59.999Z"))).toBe(false);
    expect(isOneYearOrMorePassed(at, new Date("2025-03-01T01:00:00.000Z"))).toBe(true);
  });

  it("東京 2024-03-01 05:00（UTC では 2 月 29 日 20:00）は東京 2025-03-01 05:00 から真", () => {
    const at = "2024-02-29T20:00:00.000Z";
    expect(isOneYearOrMorePassed(at, new Date("2025-02-28T19:59:59.999Z"))).toBe(false);
    expect(isOneYearOrMorePassed(at, new Date("2025-02-28T20:00:00.000Z"))).toBe(true);
  });
});

describe("M7-list-06 normalizeSearchText と検索", () => {
  it("小文字にし、半角・全角の空白と「-」「‐」「ー」「－」を取り除く", () => {
    expect(normalizeSearchText("TestTEST")).toBe("testtest");
    expect(normalizeSearchText(" テスト\u3000テスト\t")).toBe("テストテスト");
    expect(normalizeSearchText("a-b\u2010c\u30FCd\uFF0De")).toBe("abcde");
    expect(normalizeSearchText("090-0000-0001")).toBe("09000000001");
  });

  const rows = [
    row("01", { name: "テストテスト ルーシー", phoneNumber: "00011112222" }),
    row("02", { name: "テストテスト ABC", phoneNumber: "090-0000-0002" }),
    row("03", { name: "テストテスト 三郎", phoneNumber: "080 0000 0003" }),
  ];
  const search = (q: string) => ids(filterAndSortRows(rows, state({ q }), NOW));

  it("ハイフン・空白を入れた電話番号で一致する（000-1111 → 00011112222）", () => {
    expect(search("000-1111")).toEqual(["Res01"]);
    expect(search("080-0000")).toEqual(["Res03"]);
    expect(search("０")).toEqual([]); // 全角の数字は変換しない
  });

  it("長音を含む氏名に長音なしの語で一致し、大文字小文字を区別しない", () => {
    expect(search("ルシ")).toEqual(["Res01"]);
    expect(search("ルーシー")).toEqual(["Res01"]);
    expect(search("abc")).toEqual(["Res02"]);
    expect(search("テストテスト\u3000三郎")).toEqual(["Res03"]);
  });

  it("正規化して空になる検索語では絞らない", () => {
    expect(search(" -\u2010\u30FC\uFF0D\u3000")).toEqual(["Res01", "Res02", "Res03"]);
  });
});

describe("M7-list-07 filterAndSortRows（絞り込み。代表の値で判定）", () => {
  const rows = [
    row("01", {
      employmentStatus: "candidate",
      teamCode: "A",
      submittedAt: "2026-11-05T00:00:00.000Z",
    }),
    // 代表は最近で、前回は 1 年以上前（受験から1年以上には入らない）
    chainRow("02", ["2026-11-04T00:00:00.000Z", "2024-01-01T00:00:00.000Z"], {
      employmentStatus: "employed",
      teamCode: "A",
    }),
    row("03", {
      employmentStatus: "left",
      teamCode: null,
      submittedAt: "2026-11-03T00:00:00.000Z",
    }),
    row("04", {
      employmentStatus: "candidate",
      teamCode: null,
      submittedAt: "2025-06-02T00:00:00.000Z",
    }),
    row("05", {
      employmentStatus: "employed",
      teamCode: "B",
      submittedAt: "2025-06-01T00:00:00.000Z",
    }),
  ];

  it.each<[Partial<ListFilterState>, readonly string[]]>([
    [{}, ["Res01", "Res02", "Res03", "Res04", "Res05"]],
    [{ seg: "cand" }, ["Res01", "Res04"]],
    [{ seg: "exec" }, ["Res02", "Res05"]],
    [{ seg: "left" }, ["Res03"]],
    [{ seg: "old" }, ["Res04", "Res05"]],
    [{ team: "none" }, ["Res03", "Res04"]],
    [{ team: "A" }, ["Res01", "Res02"]],
    [{ team: "C" }, []],
    [{ seg: "cand", team: "none" }, ["Res04"]],
    [{ seg: "cand", team: "A" }, ["Res01"]],
    [{ seg: "exec", team: "B" }, ["Res05"]],
    [{ seg: "old", team: "none" }, ["Res04"]],
    [{ seg: "exec", q: "テストテスト 02" }, ["Res02"]],
    [{ seg: "exec", team: "A", q: "05" }, []],
    [{ seg: "old", q: "0000-0005" }, ["Res05"]],
    [{ team: "A", q: "0001" }, ["Res01"]],
  ])("%j → %j", (patch, expected) => {
    expect(ids(filterAndSortRows(rows, state(patch), NOW))).toEqual(expected);
  });

  it("渡した行の配列を変えない", () => {
    const before = ids(rows);
    filterAndSortRows(rows, state({ sort: "old" }), NOW);
    expect(ids(rows)).toEqual(before);
  });
});

describe("M7-list-08 filterAndSortRows（並び順）", () => {
  const rows = [
    row("01", { name: "テストテスト い", submittedAt: "2026-10-01T00:00:00.000Z" }),
    row("02", { name: "テストテスト ア", submittedAt: "2026-11-01T00:00:00.000Z" }),
    row("03", { name: "テストテスト B", submittedAt: "2025-01-01T00:00:00.000Z" }), // 1 年以上
    row("04", { name: "テストテスト a", submittedAt: "2025-06-01T00:00:00.000Z" }), // 1 年以上
    row("05", { name: "テストテスト い", submittedAt: "2026-11-05T00:00:00.000Z" }),
  ];
  const sorted = (sort: ListFilterState["sort"], source = rows) =>
    ids(filterAndSortRows(source, state({ sort }), NOW));

  it("new は代表の受験日の新しい順、old は古い順", () => {
    expect(sorted("new")).toEqual(["Res05", "Res02", "Res01", "Res04", "Res03"]);
    expect(sorted("old")).toEqual(["Res03", "Res04", "Res01", "Res02", "Res05"]);
  });

  it("name は氏名の localeCompare（ja）で、同じ氏名は新しい順", () => {
    // ja の照合では a < B < ア < い（文字コードの順の B < a < い < ア とは違う）
    expect(sorted("name")).toEqual(["Res04", "Res03", "Res02", "Res05", "Res01"]);
  });

  it("due は受験から1年以上の行を先にし、各群は古い順", () => {
    expect(sorted("due")).toEqual(["Res03", "Res04", "Res01", "Res02", "Res05"]);
  });

  it("どの並びでも、最後まで同じなら resultId の昇順", () => {
    const ties = [
      row("13", { name: "テストテスト 同じ", submittedAt: RECENT_AT }),
      row("11", { name: "テストテスト 同じ", submittedAt: RECENT_AT }),
      row("12", { name: "テストテスト 同じ", submittedAt: RECENT_AT }),
    ];
    for (const sort of ["new", "old", "name", "due"] as const) {
      expect(sorted(sort, ties), sort).toEqual(["Res11", "Res12", "Res13"]);
    }
  });
});

describe("M7-list-09 usedTeamCodes・hasActiveFilters・clearFilters", () => {
  it("usedTeamCodes は代表のチームに使われているチームだけを重複なしで A→Z", () => {
    const rows = [
      row("01", { teamCode: "C" }),
      row("02", { teamCode: "A" }),
      row("03", { teamCode: null }),
      row("04", { teamCode: "A" }),
      row("05", { teamCode: "Z" }),
    ];
    expect(usedTeamCodes(rows)).toEqual(["A", "C", "Z"]);
    expect(usedTeamCodes([row("01")])).toEqual([]);
    expect(usedTeamCodes([])).toEqual([]);
  });

  it("hasActiveFilters は検索語（空白だけでも）・チーム・受験から1年以上のどれかで真", () => {
    expect(hasActiveFilters(DEFAULT_LIST_FILTER)).toBe(false);
    expect(hasActiveFilters(state({ q: " " }))).toBe(true);
    expect(hasActiveFilters(state({ q: "テスト" }))).toBe(true);
    expect(hasActiveFilters(state({ team: "none" }))).toBe(true);
    expect(hasActiveFilters(state({ team: "A" }))).toBe(true);
    expect(hasActiveFilters(state({ seg: "old" }))).toBe(true);
    expect(hasActiveFilters(state({ seg: "cand", sort: "due" }))).toBe(false);
  });

  it("clearFilters は検索語とチームを空にし、受験から1年以上は「すべて」に、求職者はそのまま。並び順は保つ（K-32 ④）", () => {
    expect(clearFilters({ seg: "old", q: "テスト", team: "A", sort: "due" })).toEqual({
      seg: "all",
      q: "",
      team: "",
      sort: "due",
    });
    expect(clearFilters({ seg: "cand", q: " ", team: "none", sort: "name" })).toEqual({
      seg: "cand",
      q: "",
      team: "",
      sort: "name",
    });
    expect(clearFilters(DEFAULT_LIST_FILTER)).toEqual(DEFAULT_LIST_FILTER);
  });
});

describe("M7-list-10 rowChips（§2.9 の順と条件）", () => {
  const kinds = (r: ResultListRowDto) => rowChips(r, NOW).map((c) => c.kind);
  const labels = (r: ResultListRowDto) => rowChips(r, NOW).map((c) => c.label);

  it("すべての条件に合う行は 役職 → 区分 → 入社 → 退職 → n回目 → 経年比較あり → 受験から1年以上 → meta の順", () => {
    const full = chainRow(
      "01",
      [OLD_AT, "2024-06-01T00:00:00.000Z", "2023-06-01T00:00:00.000Z"],
      {
        staffRole: "leader",
        employmentStatus: "left",
        hiredOn: "2025-04-01",
        leftOn: "2026-10-31",
        occupationCode: 3,
        phoneNumber: "090-0000-0001",
      },
      [true, false, false],
    );
    expect(rowChips(full, NOW)).toEqual([
      { kind: "role", role: "leader", label: "幹部" },
      { kind: "status", status: "left", label: "退職 ▾" },
      { kind: "hired", label: "入社 2025/4/1" },
      { kind: "left", label: "退職 2026/10/31" },
      { kind: "nth", label: "3回目" },
      { kind: "longitudinal", label: "経年比較あり" },
      { kind: "one_year", label: "受験から1年以上" },
      { kind: "meta", label: "ネイリスト ・ 090-0000-0001" },
    ]);
  });

  it("区分のチップは常に出し、1 回だけの最近の受験はそれと meta だけ", () => {
    expect(labels(row("01"))).toEqual(["求職者 ▾", "アイリスト ・ 090-0000-0001"]);
    expect(labels(row("02", { employmentStatus: "employed" }))[0]).toBe("在籍 ▾");
  });

  it("役職の札: 保存された役職、未設定で職業 10 は責任者、スタッフと未設定（職業 10 以外）は出さない", () => {
    expect(rowChips(row("01", { staffRole: "manager" }), NOW)[0]).toEqual({
      kind: "role",
      role: "manager",
      label: "責任者",
    });
    expect(rowChips(row("02", { staffRole: null, occupationCode: 10 }), NOW)[0]).toEqual({
      kind: "role",
      role: "manager",
      label: "責任者",
    });
    expect(kinds(row("03", { staffRole: "staff", occupationCode: 10 }))).not.toContain("role");
    expect(kinds(row("04", { staffRole: null, occupationCode: 1 }))).not.toContain("role");
    // 保存された役職が職業より優先する（職業 10 でも幹部）
    expect(labels(row("05", { staffRole: "leader", occupationCode: 10 }))[0]).toBe("幹部");
  });

  it("退職のチップは区分が退職で退職日があるときだけ", () => {
    expect(kinds(row("01", { employmentStatus: "left", leftOn: "2026-10-31" }))).toContain("left");
    expect(kinds(row("02", { employmentStatus: "left", leftOn: null }))).not.toContain("left");
    expect(kinds(row("03", { employmentStatus: "employed", leftOn: "2026-10-31" }))).not.toContain(
      "left",
    );
  });

  it("入社のチップは入社日があるとき（区分を問わない）。日付は時間帯の変換をしない", () => {
    expect(labels(row("01", { hiredOn: "2026-01-01" }))).toContain("入社 2026/1/1");
    expect(kinds(row("02", { hiredOn: null }))).not.toContain("hired");
  });

  it("n回目はつながりが 2 件以上、経年比較ありは代表の受験だけで判定する", () => {
    expect(labels(chainRow("01", [RECENT_AT, OLD_AT]))).toContain("2回目");
    expect(kinds(row("02"))).not.toContain("nth");
    // 前回だけが経年比較ありでも、代表が経年比較ありでなければ出さない
    expect(kinds(chainRow("03", [RECENT_AT, OLD_AT], {}, [false, true]))).not.toContain(
      "longitudinal",
    );
  });

  it("受験から1年以上は代表の受験日で判定する（前回が 1 年以上前でも代表が最近なら出さない）", () => {
    expect(kinds(row("01", { submittedAt: OLD_AT }))).toContain("one_year");
    expect(kinds(chainRow("02", [RECENT_AT, OLD_AT]))).not.toContain("one_year");
  });

  it("電話番号は ASCII の数字が 6 けた以上のときだけ meta に入る。職業だけ・電話番号だけ・どちらも無い", () => {
    const meta = (r: ResultListRowDto) => rowChips(r, NOW).find((c) => c.kind === "meta")?.label;
    expect(meta(row("01", { phoneNumber: "12-34-56" }))).toBe("アイリスト ・ 12-34-56");
    expect(meta(row("02", { phoneNumber: "12345" }))).toBe("アイリスト"); // 5 けた
    expect(meta(row("03", { phoneNumber: "０９０００００００００" }))).toBe("アイリスト"); // 全角の数字
    expect(meta(row("04", { phoneNumber: "" }))).toBe("アイリスト");
    // 旧コード 9 は「その他」、未知のコードは職業なし
    expect(meta(row("05", { occupationCode: 9 }))).toBe("その他 ・ 090-0000-0005");
    expect(meta(row("06", { occupationCode: 99 }))).toBe("090-0000-0006");
    expect(meta(row("07", { occupationCode: 99, phoneNumber: "123" }))).toBeUndefined();
  });
});

describe("M7-list-11 rowMenuModel（⋮メニュー）", () => {
  it("4 件のつながりは以前の受験が 3・2・1 回目（前回から順）と各日付、削除に「{Y/M/D}の分」", () => {
    const r = chainRow("01", [
      "2026-09-06T15:00:00.000Z", // 東京 2026-09-07
      "2025-03-31T15:30:00.000Z", // 東京 2025-04-01
      "2024-01-10T00:00:00.000Z",
      "2023-05-05T00:00:00.000Z",
    ]);
    expect(rowMenuModel(r)).toEqual({
      previous: [
        { k: 3, resultId: "Res01p1", dateLabel: "2025/4/1" },
        { k: 2, resultId: "Res01p2", dateLabel: "2024/1/10" },
        { k: 1, resultId: "Res01p3", dateLabel: "2023/5/5" },
      ],
      currentStatus: "candidate",
      currentRole: null,
      deleteNote: "2026/9/7の分",
    });
  });

  it("1 回だけの受験は以前の受験なし・削除の右端の文字なし", () => {
    const model = rowMenuModel(row("01", { employmentStatus: "left" }));
    expect(model.previous).toEqual([]);
    expect(model.deleteNote).toBeNull();
    expect(model.currentStatus).toBe("left");
  });

  it("現在の役職は表示上の役職（保存なし・職業 10 は責任者。K-32 ⑤）", () => {
    expect(rowMenuModel(row("01", { staffRole: null, occupationCode: 10 })).currentRole).toBe(
      "manager",
    );
    expect(rowMenuModel(row("02", { staffRole: "staff", occupationCode: 10 })).currentRole).toBe(
      "staff",
    );
    expect(rowMenuModel(row("03", { staffRole: "leader" })).currentRole).toBe("leader");
    expect(rowMenuModel(row("04", { staffRole: null, occupationCode: 1 })).currentRole).toBeNull();
  });
});

describe("M7-list-14 emptyStateKind（§2.19 の判定の順。K-32 ⑥）", () => {
  it.each<[Partial<ListFilterState>, string]>([
    [{ seg: "exec", q: "テスト" }, "no_match"],
    [{ seg: "cand", q: " " }, "no_match"],
    [{ seg: "all", team: "none" }, "no_match"],
    [{ seg: "old" }, "no_match"],
    [{ seg: "exec" }, "no_employed"],
    [{ seg: "cand" }, "no_candidate"],
    [{ seg: "left" }, "no_left"],
    [{ seg: "all" }, "no_results"],
    [{ seg: "all", sort: "due" }, "no_results"],
  ])("%j → %s", (patch, expected) => {
    expect(emptyStateKind(state(patch))).toBe(expected);
  });

  it("種類ごとの見出し・本文・ボタン（§2.19 の表。求職者・退職は 11-2 7 章の案）", () => {
    expect(RESULT_LIST_TEXTS.empty).toEqual({
      no_match: {
        title: "条件に合う受験者がいません",
        body: "検索や絞り込みを変えてみてください。",
        button: "絞り込みを解除",
      },
      no_employed: {
        title: "既存スタッフの受験はまだありません",
        body: "既存スタッフ用の回答リンクを送ると、ここに表示されます。",
        button: "既存スタッフ用リンクをコピー",
      },
      no_candidate: {
        title: "求職者の受験はまだありません",
        body: "求職者用の回答リンクを送ると、ここに表示されます。",
        button: "求職者用リンクをコピー",
      },
      no_left: {
        title: "退職した人はいません",
        body: "区分を「退職」にした人が、ここに表示されます。",
        button: null,
      },
      no_results: {
        title: "受験はまだありません",
        body: "求職者用の回答リンクを送ると、回答した人がここに表示されます。",
        button: "求職者用リンクをコピー",
      },
    });
  });
});

describe("M7-list-16 parseStoredFilter（sessionStorage の ad-filter）", () => {
  it("正しい JSON は戻す", () => {
    const stored = { seg: "old", q: "テスト 090", team: "none", sort: "due" };
    expect(parseStoredFilter(JSON.stringify(stored))).toEqual(stored);
    expect(parseStoredFilter('{"seg":"exec","q":"","team":"Z","sort":"name"}')).toEqual({
      seg: "exec",
      q: "",
      team: "Z",
      sort: "name",
    });
  });

  it.each([null, "", "{", "not json", "null", "[]", '["all"]', '"all"', "123", "true"])(
    "読めない値・オブジェクトでない値（%j）は既定",
    (raw) => {
      expect(parseStoredFilter(raw)).toEqual(DEFAULT_LIST_FILTER);
    },
  );

  it("決まった値でない項目だけを既定にする", () => {
    expect(parseStoredFilter('{"seg":"bogus","q":5,"team":"AA","sort":"name"}')).toEqual({
      seg: "all",
      q: "",
      team: "",
      sort: "name",
    });
    expect(parseStoredFilter('{"seg":"cand","team":"a","sort":"desc"}')).toEqual({
      seg: "cand",
      q: "",
      team: "",
      sort: "new",
    });
    expect(parseStoredFilter('{"q":"テスト","team":null}')).toEqual({
      seg: "all",
      q: "テスト",
      team: "",
      sort: "new",
    });
  });

  it("表示の上限など、4 項目のほかは戻さない", () => {
    expect(
      parseStoredFilter('{"seg":"left","q":"x","team":"B","sort":"old","limit":300,"page":2}'),
    ).toEqual({ seg: "left", q: "x", team: "B", sort: "old" });
  });
});

describe("M7-list-17 typeDot（タイプの点の色と所属分類の名前）", () => {
  /** 00 §1.6 の所属分類（11-2 §2.8 の表） */
  const STYLE_OF_TYPE: Readonly<Record<AptitudeTypeKey, string>> = {
    scientist: "analytical",
    professional: "analytical",
    creator: "analytical",
    artist: "analytical",
    pioneer: "driving",
    controller: "driving",
    actor: "driving",
    reviewer: "driving",
    follower: "amiable",
    generalist: "amiable",
    specialist: "amiable",
    conductor: "amiable",
    attendant: "expressive",
    receptionist: "expressive",
    freelancer: "expressive",
    promoter: "expressive",
  };
  const DOT_OF_STYLE: Readonly<Record<string, { color: string; title: string }>> = {
    analytical: { color: "#3FA57A", title: "Analytical（分析型）" },
    driving: { color: "#9B72AA", title: "Driving（実行型）" },
    amiable: { color: "#3F8DA5", title: "Amiable（温和型）" },
    expressive: { color: "#D9A13B", title: "Expressive（直感型）" },
  };

  it("マスタの所属分類が 00 §1.6 の表と一致する", () => {
    for (const definition of APTITUDE_TYPE_DEFINITIONS) {
      expect(definition.socialStyle, definition.key).toBe(STYLE_OF_TYPE[definition.key]);
    }
  });

  it.each(APTITUDE_TYPE_KEYS.map((key) => [key]))("%s は所属分類の色と名前", (key) => {
    expect(typeDot(key)).toEqual(DOT_OF_STYLE[STYLE_OF_TYPE[key]]);
  });

  it("16 タイプが 4 色に 4 つずつ分かれる", () => {
    const counts = new Map<string, number>();
    for (const key of APTITUDE_TYPE_KEYS) {
      const { color } = typeDot(key);
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "#3FA57A": 4,
      "#9B72AA": 4,
      "#3F8DA5": 4,
      "#D9A13B": 4,
    });
  });

  it("タイプが無い・未知のキーは #AEB7C1 で title なし", () => {
    expect(typeDot(null)).toEqual({ color: "#AEB7C1", title: null });
    expect(typeDot("unknown" as AptitudeTypeKey)).toEqual({ color: "#AEB7C1", title: null });
  });
});

describe("M7-list-49 employmentMenuPosition（区分メニューの位置。K-43）", () => {
  const chip = (top: number, bottom: number, left = 100) => ({ left, top, bottom });

  it("画面の高さ 900・メニューの高さ 200: 下端 686 は下向き（上 692。ちょうど入りきる）", () => {
    expect(employmentMenuPosition(chip(662, 686), 200, 900)).toEqual({ left: 100, top: 692 });
  });

  it("画面の高さ 900: 下端 687・上端 663 は上向き（上 457 = 663 − 200 − 6）", () => {
    expect(employmentMenuPosition(chip(663, 687), 200, 900)).toEqual({ left: 100, top: 457 });
  });

  it("画面の高さ 400: 上端 214・下端 238 は上向きで上 8（ちょうど入りきる）", () => {
    expect(employmentMenuPosition(chip(214, 238), 200, 400)).toEqual({ left: 100, top: 8 });
  });

  it("画面の高さ 400: 上端 213・下端 237 も上向きで、上は 8（7 が 8 より小さい）", () => {
    expect(employmentMenuPosition(chip(213, 237), 200, 400)).toEqual({ left: 100, top: 8 });
  });

  it("左は向きにかかわらず max(8, チップの左端)", () => {
    expect(employmentMenuPosition(chip(100, 124, 3), 200, 900).left).toBe(8);
    expect(employmentMenuPosition(chip(663, 687, 3), 200, 900)).toEqual({ left: 8, top: 457 });
    expect(employmentMenuPosition(chip(100, 124, 8), 200, 900).left).toBe(8);
    expect(employmentMenuPosition(chip(100, 124, 1200), 200, 900).left).toBe(1200);
  });
});

describe("popupMenuPosition（⋮メニュー・リンクのメニューの位置。11-2 §2.12）", () => {
  it("右端をボタンの右にそろえ、ボタンの下 6px に出す", () => {
    expect(popupMenuPosition({ top: 100, bottom: 132, right: 500 }, 220, 300, 1440, 900)).toEqual({
      left: 280,
      top: 138,
    });
  });

  it("左が 8 未満なら 8、画面の幅 − w − 8 を超えるならそこに寄せる", () => {
    expect(popupMenuPosition({ top: 100, bottom: 132, right: 100 }, 220, 300, 1440, 900).left).toBe(
      8,
    );
    expect(popupMenuPosition({ top: 100, bottom: 132, right: 385 }, 220, 300, 390, 844).left).toBe(
      162,
    );
    expect(popupMenuPosition({ top: 100, bottom: 132, right: 382 }, 220, 300, 390, 844).left).toBe(
      162,
    );
  });

  it("下に入りきらなければボタンの上（上は 8 以上）", () => {
    // 下端 586: 592 + 300 = 892 = 900 − 8 で入りきる
    expect(popupMenuPosition({ top: 554, bottom: 586, right: 500 }, 220, 300, 1440, 900).top).toBe(
      592,
    );
    // 下端 587: 入りきらないので上に（555 − 300 − 6 = 249）
    expect(popupMenuPosition({ top: 555, bottom: 587, right: 500 }, 220, 300, 1440, 900).top).toBe(
      249,
    );
    // 上にも入りきらなければ 8
    expect(popupMenuPosition({ top: 100, bottom: 132, right: 500 }, 220, 300, 1440, 400).top).toBe(
      8,
    );
  });
});
