// 在籍・退職の表示の規則（11-3 §2.13・§2.14・§2.16〜§2.18・§3.7・§5.1。lib/presentation/retention.ts）と画面の文言
// （classification-texts.ts の EMPLOYMENT_SCREEN_TEXTS。11-3 §2.13〜§2.16・§2.20・§2.23・7 章）。M7-zaiseki-12 completedMonths、
// M7-zaiseki-13 formatTenure・averageMonths、M7-zaiseki-14 tenureMonths、M7-zaiseki-15・16 analyzeRetention（数と表）、
// M7-zaiseki-17 注意書きと説明の先頭、M7-zaiseki-18 tabOf・タブの数・sortForTab。勤続の例と文言は 11-3 を読んで照合する
// （classification-view.test.ts と同じ書き方）。基準日は固定の暦日（基準日に左右される値は単体テストで確かめる。11-3 §5 の冒頭）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMPLOYMENT_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import { CHARACTER_CELLS } from "@/lib/presentation/classification-view";
import {
  analysisTeamPrefix,
  analyzeRetention,
  averageMonths,
  completedMonths,
  EMPLOYMENT_TABS,
  formatTenure,
  sortForTab,
  tabCounts,
  tabOf,
  tenureMonths,
  type EmploymentCarrier,
} from "@/lib/presentation/retention";
import type { AptitudeTypeKey } from "@/lib/scoring/types";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const SPEC = read("docs/基本設計/11_参照元の更新/11-3_在籍・退職と組織内分類.md");

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

/** 正規表現の捕捉（見つからなければ失敗させる） */
function capture(text: string, pattern: RegExp): readonly string[] {
  const m = pattern.exec(text);
  if (m === null) throw new Error(`見つからない: ${pattern}`);
  return m.slice(1);
}

const SECTION_2_13 = between(SPEC, "### 2.13 ", "### 2.14 ");
const SECTION_2_14 = between(SPEC, "### 2.14 ", "### 2.15 ");
const SECTION_2_15 = between(SPEC, "### 2.15 ", "### 2.16 ");
const SECTION_2_16 = between(SPEC, "### 2.16 ", "### 2.17 ");
const SECTION_2_17 = between(SPEC, "### 2.17 ", "### 2.18 ");
const SECTION_2_23 = between(SPEC, "### 2.23 ", "## 3. ");
const CHAPTER_7 = SPEC.slice(SPEC.indexOf("## 7. 依頼主の確認が必要な文言"));

const TODAY = "2026-11-10";
const TEXTS = EMPLOYMENT_SCREEN_TEXTS;

/** 人（架空の値）。並びの「元の順」は渡した配列の順（retention.ts は submittedAt を見ない） */
function person(
  id: string,
  aptitudeType: AptitudeTypeKey,
  overrides: Partial<EmploymentCarrier> = {},
): EmploymentCarrier {
  return {
    resultId: `Res${id}`,
    aptitudeType,
    employmentStatus: "employed",
    submittedAt: "2026-10-01T00:00:00.000Z",
    teamCode: null,
    name: `テストテスト ${id}`,
    hiredOn: null,
    leftOn: null,
    ...overrides,
  };
}

/** 同じタイプ・区分の人を n 人（入社日なし） */
function many(
  prefix: string,
  n: number,
  aptitudeType: AptitudeTypeKey,
  employmentStatus: EmploymentCarrier["employmentStatus"],
): EmploymentCarrier[] {
  return Array.from({ length: n }, (_, i) =>
    person(`${prefix}${String(i).padStart(2, "0")}`, aptitudeType, { employmentStatus }),
  );
}

describe("M7-zaiseki-12 completedMonths（11-3 §2.17）", () => {
  // §2.17 の例の表（入社日・終点・月数・表示）
  const EXAMPLES = [
    ...SECTION_2_17.matchAll(
      /^\| (\d{4}-\d{2}-\d{2}) \| (\d{4}-\d{2}-\d{2}) \| (\d+) \| (\S+) \|$/gm,
    ),
  ].map((m) => ({ from: m[1]!, to: m[2]!, months: Number(m[3]), label: m[4]! }));

  it("§2.17 の表は 9 件", () => {
    expect(EXAMPLES).toHaveLength(9);
  });

  it.each(EXAMPLES)("$from → $to は $months か月（「$label」）", ({ from, to, months, label }) => {
    expect(completedMonths(from, to)).toBe(months);
    expect(formatTenure(completedMonths(from, to))).toBe(label);
  });

  it("終点が入社日より前は null、同じ日は 0", () => {
    expect(completedMonths("2026-10-29", "2026-10-14")).toBeNull();
    expect(completedMonths("2026-01-01", "2025-12-31")).toBeNull();
    expect(completedMonths("2026-10-14", "2026-10-14")).toBe(0);
  });

  it("形が YYYY-MM-DD でなければ null", () => {
    expect(completedMonths("2026-1-01", "2026-10-14")).toBeNull();
    expect(completedMonths("2026-01-01", "")).toBeNull();
  });
});

describe("M7-zaiseki-13 formatTenure・averageMonths（11-3 §2.17）", () => {
  it.each([
    [0, "0か月"],
    [1, "1か月"],
    [11, "11か月"],
    [12, "1年"],
    [13, "1年1か月"],
    [24, "2年"],
    [28, "2年4か月"],
    [60, "5年"],
    [102, "8年6か月"],
    [null, "—"],
  ] as const)("formatTenure(%s) →「%s」", (months, label) => {
    expect(formatTenure(months)).toBe(label);
  });

  it("平均は Math.round(合計 ÷ 人数)（.5 は切り上げ）。人数 0 は null（「—」）", () => {
    expect(averageMonths([1, 2])).toBe(2);
    expect(averageMonths([0, 1])).toBe(1);
    expect(averageMonths([5, 6])).toBe(6);
    expect(formatTenure(averageMonths([5, 6]))).toBe("6か月");
    expect(averageMonths([11, 12])).toBe(12);
    expect(formatTenure(averageMonths([11, 12]))).toBe("1年");
    expect(averageMonths([])).toBeNull();
    expect(formatTenure(averageMonths([]))).toBe("—");
    expect(averageMonths([0])).toBe(0);
    expect(averageMonths([1, 1, 2])).toBe(1); // 1.33…
    expect(averageMonths([11, 23])).toBe(17);
  });
});

describe("M7-zaiseki-14 tenureMonths（11-3 §2.14・§2.17）", () => {
  it("退職は退職日まで、在籍・求職者は基準日まで（求職者も入社日があれば基準日まで。参照元どおり）", () => {
    const left = person("01", "conductor", {
      employmentStatus: "left",
      hiredOn: "2024-04-01",
      leftOn: "2026-03-31",
    });
    expect(tenureMonths(left, TODAY)).toBe(23);
    const employed = person("02", "conductor", { hiredOn: "2024-04-01" });
    expect(tenureMonths(employed, TODAY)).toBe(31);
    const candidate = person("03", "conductor", {
      employmentStatus: "candidate",
      hiredOn: "2025-04-01",
    });
    expect(tenureMonths(candidate, TODAY)).toBe(19);
    // 基準日で変わる（在籍中の勤続は基準日に左右される）
    expect(tenureMonths(employed, "2026-03-31")).toBe(23);
    expect(tenureMonths(employed, "2026-04-01")).toBe(24);
  });

  it("入社日なし・退職した人の退職日なし・終点が入社日より前（入社日が基準日より後）は null", () => {
    for (const employmentStatus of ["employed", "left", "candidate"] as const) {
      expect(tenureMonths(person("01", "conductor", { employmentStatus }), TODAY)).toBeNull();
    }
    expect(
      tenureMonths(
        person("02", "conductor", { employmentStatus: "left", hiredOn: "2024-04-01" }),
        TODAY,
      ),
    ).toBeNull();
    expect(tenureMonths(person("03", "conductor", { hiredOn: "2026-11-11" }), TODAY)).toBeNull();
    expect(
      tenureMonths(
        person("04", "conductor", { employmentStatus: "candidate", hiredOn: "2026-11-11" }),
        TODAY,
      ),
    ).toBeNull();
    expect(
      tenureMonths(
        person("05", "conductor", {
          employmentStatus: "left",
          hiredOn: "2026-04-01",
          leftOn: "2026-03-31",
        }),
        TODAY,
      ),
    ).toBeNull();
    // 入社日が基準日と同じ日は 0 か月
    expect(tenureMonths(person("06", "conductor", { hiredOn: TODAY }), TODAY)).toBe(0);
  });
});

describe("M7-zaiseki-15 analyzeRetention の数（11-3 §2.16）", () => {
  it("退職 2・在籍 42 で全体の 5%（2 ÷ 44 = 4.5… を 5）。在籍 + 退職が 0 なら 0%", () => {
    const people = [
      ...many("L", 2, "conductor", "left"),
      ...many("S", 42, "freelancer", "employed"),
    ];
    const a = analyzeRetention(people, TODAY);
    expect([a.leftCount, a.stayCount, a.leftRatePercent]).toEqual([2, 42, 5]);
    expect(analyzeRetention([], TODAY).leftRatePercent).toBe(0);
    const onlyCandidates = analyzeRetention(many("C", 5, "conductor", "candidate"), TODAY);
    expect([onlyCandidates.leftCount, onlyCandidates.stayCount]).toEqual([0, 0]);
    expect(onlyCandidates.leftRatePercent).toBe(0);
    expect(onlyCandidates.rows).toEqual([]);
  });

  it("求職者は何人足しても人数・割合の分母・未入力・表に入らない（退職の割合の分母は在籍 + 退職）", () => {
    const base = [
      person("01", "conductor", { employmentStatus: "left" }),
      person("02", "conductor"),
      person("03", "pioneer"),
    ];
    const candidates = [
      ...many("C", 7, "conductor", "candidate"),
      person("90", "reviewer", { employmentStatus: "candidate", hiredOn: "2020-04-01" }),
    ];
    expect(analyzeRetention([...base, ...candidates], TODAY)).toEqual(
      analyzeRetention(base, TODAY),
    );
    expect(analyzeRetention(base, TODAY).leftRatePercent).toBe(33);
  });

  it("参照元の画面の例: 在籍 42 人が入社日なし、退職 2 人のうち 1 人が入社日なし・1 人は 0か月 → 未入力 43（入社日 43・退職日 0）", () => {
    const people = [
      ...many("S", 42, "conductor", "employed"),
      person("L1", "conductor", { employmentStatus: "left", leftOn: "2026-10-30" }),
      person("L2", "conductor", {
        employmentStatus: "left",
        hiredOn: "2026-10-14",
        leftOn: "2026-10-29",
      }),
    ];
    const a = analyzeRetention(people, TODAY);
    expect(a.missingHireCount).toBe(43);
    expect(a.missingLeaveCount).toBe(0);
    expect(a.missingHireCount + a.missingLeaveCount).toBe(43);
    expect(a.leftTenure).toEqual({ average: 0, count: 1 });
    expect(formatTenure(a.leftTenure.average)).toBe("0か月");
    expect(a.stayTenure).toEqual({ average: null, count: 0 });
    expect(formatTenure(a.stayTenure.average)).toBe("—");
  });

  it("入社日はあり退職日の無い退職した人は退職日の未入力。在籍中の人は退職日が要らない", () => {
    const a = analyzeRetention(
      [
        person("01", "conductor", { employmentStatus: "left", hiredOn: "2024-04-01" }),
        person("02", "conductor", { hiredOn: "2024-04-01" }),
      ],
      TODAY,
    );
    expect([a.missingHireCount, a.missingLeaveCount]).toEqual([0, 1]);
    expect(a.leftTenure).toEqual({ average: null, count: 0 });
    expect(a.stayTenure).toEqual({ average: 31, count: 1 });
  });

  it("退職日 < 入社日の人・入社日が基準日より後の在籍の人は、未入力にも平均にも入らず、人数には入る", () => {
    const a = analyzeRetention(
      [
        person("01", "conductor", {
          employmentStatus: "left",
          hiredOn: "2026-04-01",
          leftOn: "2026-03-31",
        }),
        person("02", "conductor", { hiredOn: "2026-11-11" }),
        person("03", "conductor", {
          employmentStatus: "left",
          hiredOn: "2025-04-01",
          leftOn: "2026-03-31",
        }),
        person("04", "conductor", { hiredOn: "2024-04-01" }),
      ],
      TODAY,
    );
    expect([a.leftCount, a.stayCount]).toEqual([2, 2]);
    expect([a.missingHireCount, a.missingLeaveCount]).toEqual([0, 0]);
    expect(a.leftTenure).toEqual({ average: 11, count: 1 });
    expect(a.stayTenure).toEqual({ average: 31, count: 1 });
    expect(a.rows).toEqual([
      expect.objectContaining({
        aptitudeType: "conductor",
        leftTenureAverage: 11,
        stayTenureAverage: 31,
      }),
    ]);
  });

  it("平均は退職した人と在籍中の人で分け、月の整数に丸める（退職 11 と 23 か月 →「1年5か月」）", () => {
    const a = analyzeRetention(
      [
        person("01", "conductor", {
          employmentStatus: "left",
          hiredOn: "2025-04-01",
          leftOn: "2026-03-31",
        }),
        person("02", "pioneer", {
          employmentStatus: "left",
          hiredOn: "2024-04-01",
          leftOn: "2026-03-31",
        }),
        person("03", "pioneer", { hiredOn: "2020-04-01" }),
      ],
      TODAY,
    );
    expect(a.leftTenure).toEqual({ average: 17, count: 2 });
    expect(formatTenure(a.leftTenure.average)).toBe("1年5か月");
    expect(a.stayTenure).toEqual({ average: 79, count: 1 });
    expect(a.leftRatePercent).toBe(67);
  });

  it("未入力が 0 なら勤続未入力者のカードの条件（入社日と退職日の未入力の合計が 1 以上）を満たさない", () => {
    const a = analyzeRetention(
      [
        person("01", "conductor", {
          employmentStatus: "left",
          hiredOn: "2025-04-01",
          leftOn: "2026-03-31",
        }),
        person("02", "pioneer", { hiredOn: "2020-04-01" }),
      ],
      TODAY,
    );
    expect(a.missingHireCount + a.missingLeaveCount).toBe(0);
  });

  it("基準日で在籍中の平均が変わる（基準日に左右される値）", () => {
    const people = [person("01", "conductor", { hiredOn: "2025-11-11" })];
    expect(analyzeRetention(people, "2026-11-10").stayTenure.average).toBe(11);
    expect(analyzeRetention(people, "2026-11-11").stayTenure.average).toBe(12);
  });
});

describe("M7-zaiseki-16 analyzeRetention の表（11-3 §2.16）", () => {
  // 参照元の画面の例（在籍 42・退職 2）。コンダクターの退職 2 人は 1 人が 0か月・1 人が入社日なし
  const SAMPLE: ReadonlyArray<readonly [AptitudeTypeKey, number, number]> = [
    ["conductor", 9, 2],
    ["freelancer", 6, 0],
    ["controller", 4, 0],
    ["pioneer", 3, 0],
    ["specialist", 3, 0],
    ["generalist", 3, 0],
    ["attendant", 3, 0],
    ["scientist", 2, 0],
    ["creator", 2, 0],
    ["promoter", 2, 0],
    ["receptionist", 2, 0],
    ["professional", 1, 0],
    ["artist", 1, 0],
    ["follower", 1, 0],
  ];
  const samplePeople = (): EmploymentCarrier[] => {
    const people: EmploymentCarrier[] = [];
    for (const [type, stay, left] of SAMPLE) {
      people.push(...many(`${type}-S`, stay, type, "employed"));
      if (left > 0) {
        people.push(
          person(`${type}-L0`, type, {
            employmentStatus: "left",
            hiredOn: "2026-10-14",
            leftOn: "2026-10-29",
          }),
          person(`${type}-L1`, type, { employmentStatus: "left", leftOn: "2026-10-30" }),
        );
      }
    }
    return people;
  };
  const EXPECTED_ORDER: readonly AptitudeTypeKey[] = [
    "conductor",
    "freelancer",
    "controller",
    "pioneer",
    "specialist",
    "generalist",
    "attendant",
    "scientist",
    "creator",
    "promoter",
    "receptionist",
    "professional",
    "artist",
    "follower",
  ];

  it("並びは 退職の割合 → 退職の人数 → 人数 → マップの順（入力の順に左右されない）", () => {
    const a = analyzeRetention(samplePeople(), TODAY);
    expect([a.stayCount, a.leftCount, a.leftRatePercent]).toEqual([42, 2, 5]);
    expect(a.rows.map((row) => row.aptitudeType)).toEqual(EXPECTED_ORDER);
    const reversed = analyzeRetention([...samplePeople()].reverse(), TODAY);
    expect(reversed.rows.map((row) => row.aptitudeType)).toEqual(EXPECTED_ORDER);
  });

  it("在籍 + 退職が 0 のタイプ（レビュワー・アクター）は行にならない（求職者だけのタイプも）", () => {
    const people = [...samplePeople(), ...many("C", 3, "reviewer", "candidate")];
    const types = analyzeRetention(people, TODAY).rows.map((row) => row.aptitudeType);
    expect(types).toHaveLength(14);
    expect(types).not.toContain("reviewer");
    expect(types).not.toContain("actor");
  });

  it("コンダクターは 在籍 9・退職 2・18%（2 ÷ 11 を四捨五入）・勤続（退職した人）0か月・勤続（在籍中）—", () => {
    const [conductor] = analyzeRetention(samplePeople(), TODAY).rows;
    expect(conductor).toEqual({
      aptitudeType: "conductor",
      stayCount: 9,
      leftCount: 2,
      ratio: 2 / 11,
      percent: 18,
      isReference: false,
      leftTenureAverage: 0,
      stayTenureAverage: null,
    });
  });

  it("「参考」は在籍 + 退職が 3 人未満のタイプだけ", () => {
    const rows = analyzeRetention(samplePeople(), TODAY).rows;
    expect(rows.filter((row) => row.isReference).map((row) => row.aptitudeType)).toEqual([
      "scientist",
      "creator",
      "promoter",
      "receptionist",
      "professional",
      "artist",
      "follower",
    ]);
    expect(rows.filter((row) => row.percent === 0)).toHaveLength(13);
  });

  it("割合は丸める前の値で並べ、同じ割合は退職の人数の多い順", () => {
    // 2 ÷ 13（15.4%）と 3 ÷ 20（15%）はどちらも 15% だが、丸める前の 2 ÷ 13 が先
    const rounded = [
      ...many("A", 11, "scientist", "employed"),
      ...many("B", 2, "scientist", "left"),
      ...many("C", 17, "artist", "employed"),
      ...many("D", 3, "artist", "left"),
    ];
    const r = analyzeRetention(rounded, TODAY).rows;
    expect(r.map((row) => [row.aptitudeType, row.percent])).toEqual([
      ["scientist", 15],
      ["artist", 15],
    ]);
    // 1 ÷ 2 と 2 ÷ 4 は同じ割合で、退職の人数の多い 2 ÷ 4 が先
    const same = [
      ...many("E", 1, "scientist", "employed"),
      ...many("F", 1, "scientist", "left"),
      ...many("G", 2, "follower", "employed"),
      ...many("H", 2, "follower", "left"),
    ];
    expect(analyzeRetention(same, TODAY).rows.map((row) => row.aptitudeType)).toEqual([
      "follower",
      "scientist",
    ]);
  });

  it("同じ割合・退職の人数・人数ならマップの順（CHARACTER_CELLS の順。00 §1.6 の sort_order ではない）", () => {
    const types: AptitudeTypeKey[] = ["freelancer", "attendant", "reviewer", "scientist"];
    const people = types.flatMap((type) => [
      ...many(`${type}-S`, 1, type, "employed"),
      ...many(`${type}-L`, 1, type, "left"),
    ]);
    const mapOrder = CHARACTER_CELLS.map((cell) => cell.type).filter((t) => types.includes(t));
    expect(mapOrder).toEqual(["scientist", "reviewer", "attendant", "freelancer"]);
    expect(analyzeRetention(people, TODAY).rows.map((row) => row.aptitudeType)).toEqual(mapOrder);
  });

  it("タイプごとの平均（退職した人・在籍中の人で分ける）", () => {
    const rows = analyzeRetention(
      [
        person("01", "pioneer", {
          employmentStatus: "left",
          hiredOn: "2025-04-01",
          leftOn: "2026-03-31",
        }),
        person("02", "pioneer", {
          employmentStatus: "left",
          hiredOn: "2024-04-01",
          leftOn: "2026-03-31",
        }),
        person("03", "pioneer", { hiredOn: "2020-04-01" }),
        person("04", "scientist", { hiredOn: "2025-11-10" }),
        person("05", "scientist", { hiredOn: "2024-11-10" }),
      ],
      TODAY,
    ).rows;
    expect(
      rows.map((row) => [row.aptitudeType, row.leftTenureAverage, row.stayTenureAverage]),
    ).toEqual([
      ["pioneer", 17, 79],
      ["scientist", null, 18],
    ]);
  });
});

describe("M7-zaiseki-17 注意書きと分析の説明の先頭（11-3 §2.16・§2.18）", () => {
  it("退職 0 → no_left、1・2 → few_left（人数）、3 以上 → null", () => {
    const withLeft = (n: number) =>
      analyzeRetention(
        [...many("S", 3, "conductor", "employed"), ...many("L", n, "conductor", "left")],
        TODAY,
      ).note;
    expect(withLeft(0)).toEqual({ kind: "no_left" });
    expect(withLeft(1)).toEqual({ kind: "few_left", count: 1 });
    expect(withLeft(2)).toEqual({ kind: "few_left", count: 2 });
    expect(withLeft(3)).toBeNull();
    expect(withLeft(10)).toBeNull();
    expect(analyzeRetention([], TODAY).note).toEqual({ kind: "no_left" });
  });

  it("チームで絞っているとき説明の先頭が「Aチームの」「未設定の」、絞っていなければ付かない", () => {
    expect(analysisTeamPrefix("A")).toBe("Aチームの");
    expect(analysisTeamPrefix("Z")).toBe("Zチームの");
    expect(analysisTeamPrefix("none")).toBe("未設定の");
    expect(analysisTeamPrefix("")).toBe("");
  });
});

describe("M7-zaiseki-18 tabOf・タブの数・sortForTab（11-3 §2.13・§2.14）", () => {
  it("タブは 分析・在籍者・退職者・求職者 の順。在籍 → 在籍者、退職 → 退職者、求職者 → 求職者", () => {
    expect(EMPLOYMENT_TABS).toEqual(["an", "stay", "left", "seek"]);
    expect(Object.isFrozen(EMPLOYMENT_TABS)).toBe(true);
    expect(tabOf("employed")).toBe("stay");
    expect(tabOf("left")).toBe("left");
    expect(tabOf("candidate")).toBe("seek");
  });

  it("タブの数は区分ごとの人数（チームで絞った後の人を渡す）", () => {
    const people = [
      ...many("S", 4, "conductor", "employed"),
      ...many("L", 2, "pioneer", "left"),
      ...many("C", 3, "freelancer", "candidate"),
    ];
    expect(tabCounts(people)).toEqual({ stay: 4, left: 2, seek: 3 });
    expect(tabCounts([])).toEqual({ stay: 0, left: 0, seek: 0 });
  });

  it("勤続の長い順。同じ勤続は元の順（代表の受験日時の新しい順）", () => {
    const people = [
      person("01", "conductor", { hiredOn: "2025-11-10" }), // 12 か月
      person("02", "conductor", { hiredOn: "2020-04-01" }), // 79 か月
      person("03", "conductor", { hiredOn: "2025-11-01" }), // 12 か月
      person("04", "conductor", { hiredOn: "2026-10-14" }), // 0 か月
    ];
    expect(sortForTab(people, TODAY).map((p) => p.resultId)).toEqual([
      "Res02",
      "Res01",
      "Res03",
      "Res04",
    ]);
  });

  it("勤続が出ない人（入社日なし・退職日なし・終点が入社日より前）は後ろで、その中はお名前の日本語順（同じ名前は元の順）", () => {
    const people = [
      person("01", "conductor", { name: "テストテスト う" }), // 入社日なし
      person("02", "conductor", {
        employmentStatus: "left",
        hiredOn: "2024-04-01",
        leftOn: "2025-04-01",
      }), // 12 か月
      person("03", "conductor", {
        name: "テストテスト イ",
        employmentStatus: "left",
        hiredOn: "2024-04-01",
      }), // 退職日なし
      person("04", "conductor", { name: "テストテスト あ", hiredOn: "2026-11-11" }), // 終点が入社日より前
      person("05", "conductor", { name: "テストテスト う" }), // 01 と同じ名前
      person("06", "conductor", { hiredOn: "2026-10-10" }), // 1 か月
    ];
    // 文字コードの順なら「う」が「イ」より前になるが、日本語順は あ → イ → う
    expect(sortForTab(people, TODAY).map((p) => p.resultId)).toEqual([
      "Res02",
      "Res06",
      "Res04",
      "Res03",
      "Res01",
      "Res05",
    ]);
  });

  it("渡した配列を変えない", () => {
    const people = [
      person("01", "conductor"),
      person("02", "conductor", { hiredOn: "2020-04-01" }),
    ];
    const before = people.map((p) => p.resultId);
    const sorted = sortForTab(people, TODAY);
    expect(sorted.map((p) => p.resultId)).toEqual(["Res02", "Res01"]);
    expect(people.map((p) => p.resultId)).toEqual(before);
    expect(sorted).not.toBe(people);
  });
});

describe("画面の文言（classification-texts.ts の EMPLOYMENT_SCREEN_TEXTS。11-3 §2.13〜§2.16・§2.20・§2.23・7 章）", () => {
  /** §2.23 の表の行（場所）の文言を「／」で分けたもの */
  const row = (place: string): readonly string[] =>
    capture(SECTION_2_23, new RegExp(`^\\| ${place} \\| (.+) \\|$`, "m"))[0]!.split("／");

  it("見出しと説明は §2.13 の文と一致する", () => {
    const [title] = capture(SECTION_2_13, /見出し `h1`「(.+?)」/);
    const [description] = capture(SECTION_2_13, /説明 `p\.pg-sub`「(.+?)」、タブ/);
    expect(TEXTS.title).toBe(title);
    expect(TEXTS.description).toBe(description);
    expect(row("在籍・退職の見出し")).toEqual([TEXTS.title, TEXTS.description]);
  });

  it("タブの名前は §2.13 の文言と一致する", () => {
    const names = capture(SECTION_2_13, /文言「(.+?)」「(.+?)\{n\}」「(.+?)\{n\}」「(.+?)\{n\}」/);
    expect(EMPLOYMENT_TABS.map((tab) => TEXTS.tabs[tab])).toEqual(names);
    expect(row("タブ")).toEqual(names);
  });

  it("一覧の 0 人の文 3 つと共通の 2 行目は §2.14 の文と一致する", () => {
    const [hint, stay, left, seek] = capture(
      SECTION_2_14,
      /共通の 2 行目「(.+?)」。1 行目は 在籍者「(.+?)」、退職者「(.+?)」、求職者「(.+?)」。/,
    );
    expect(TEXTS.empty).toEqual({ stay, left, seek, hint });
    expect(row("一覧の 0 人")).toEqual([stay, left, seek, hint]);
  });

  it("一覧の見出し・狭い幅のラベル・空の氏名・「—」・「変更」・「回答一覧を開く →」は §2.14 と §2.23 の文言と一致する", () => {
    const labels = capture(
      SECTION_2_14,
      /ラベル `span\.pg-lb`（「(.+?)」「(.+?)」「(.+?)」「(.+?)」。/,
    );
    expect([
      TEXTS.list.labels.hiredOn,
      TEXTS.list.labels.leftOn,
      TEXTS.list.labels.occupation,
      TEXTS.list.labels.tenure,
    ]).toEqual(labels);
    expect(TEXTS.list.noName).toBe(capture(SECTION_2_14, /空なら「(.+?)」 \|/)[0]);
    expect(TEXTS.list.goList).toBe(capture(SECTION_2_14, /リンク `a\.pg-go`「(.+?)」/)[0]);
    const h = TEXTS.list.headers;
    expect(row("一覧")).toEqual([
      h.name,
      h.type,
      h.hiredOn,
      h.leftOn,
      h.occupation,
      h.tenure,
      TEXTS.list.labels.hiredOn,
      `${TEXTS.list.labels.leftOn}（狭い幅のラベル）`,
      TEXTS.list.noName,
      TEXTS.list.none,
      TEXTS.list.edit,
      TEXTS.list.goList,
    ]);
  });

  it("変更ダイアログの説明・2 つのエラーは §2.15 の文と、日付の範囲のエラーは 7 章の文（案）と一致する", () => {
    const [description] = capture(SECTION_2_15, /^\| 説明 \| `div\.pgd-s`「(.+?)」 \|$/m);
    expect(TEXTS.edit.description).toBe(description);
    const [invalidDate] = capture(
      SECTION_2_15,
      /^3\. 入社日・退職日が .+?エラーの欄に「(.+?)」を出して保存しない/m,
    );
    const [leftBeforeHired] = capture(
      SECTION_2_15,
      /^4\. 入社日と退職日の両方があり.+?エラーの欄に「(.+?)」を出して保存しない/m,
    );
    expect(TEXTS.edit.invalidDate).toBe(invalidDate);
    expect(TEXTS.edit.leftBeforeHired).toBe(leftBeforeHired);
    const [proposal] = capture(
      CHAPTER_7,
      /^\| 1 \| 在籍・退職の変更ダイアログ（.+?） \| (.+?) \| なし（/m,
    );
    expect(TEXTS.edit.invalidDate).toBe(proposal);
    expect(row("変更ダイアログ")).toEqual([
      TEXTS.edit.title("{お名前}"),
      TEXTS.edit.description,
      ...TEXTS.edit.statuses.map((s) => s.label),
      TEXTS.edit.hiredOn,
      TEXTS.edit.leftOn,
      TEXTS.edit.cancel,
      TEXTS.edit.save,
      TEXTS.edit.leftBeforeHired,
      `${TEXTS.edit.invalidDate}（参照元に無い。7 章）`,
    ]);
  });

  it("変更ダイアログの区分は 在籍・退職・求職者 の順（区分の名前は EMPLOYMENT_STATUS_LABELS）", () => {
    expect(TEXTS.edit.statuses).toEqual([
      { status: "employed", label: "在籍" },
      { status: "left", label: "退職" },
      { status: "candidate", label: "求職者" },
    ]);
  });

  it("分析の見出し・説明・注意書き 2 つ・脚注は §2.16 の文と一致する", () => {
    const [title, lead] = capture(
      SECTION_2_16,
      /`h2`「(.+?)」、`p`「\{チーム\}の」（.+?）＋「(.+?)」/,
    );
    expect(TEXTS.analysis.title).toBe(title);
    expect(TEXTS.analysis.lead).toBe(lead);
    const [noLeft, fewLeft] = capture(
      SECTION_2_16,
      /退職が 0 人なら「(.+?)」、1〜2 人なら「(.+?)」、3 人以上なら出さない/,
    );
    expect(TEXTS.analysis.notes.noLeft).toBe(noLeft);
    expect(TEXTS.analysis.notes.fewLeft(2)).toBe(fewLeft!.replace("{n}", "2"));
    const [footnote] = capture(SECTION_2_16, /^5\. 脚注 `div\.ret-ft`（.+?）: 「(.+)」$/m);
    expect(TEXTS.analysis.footnote).toBe(footnote);
    expect(row("分析の注意書き")).toEqual([noLeft, fewLeft]);
    expect(row("分析の脚注")).toEqual([footnote]);
  });

  it("数字のカードの項目名と補足は §2.16 の表と一致する（差し込みは表の {…} に値を入れて比べる）", () => {
    const cards = [
      ...SECTION_2_16.matchAll(/^\| (\d) \| (.+?) \| .+? \| 「(.+?)」 \| .+ \|$/gm),
    ].map((m) => ({ name: m[2]!, note: m[3]! }));
    const c = TEXTS.analysis.cards;
    expect(cards.map((card) => card.name)).toEqual([
      c.left,
      c.stay,
      c.leftTenure,
      c.stayTenure,
      c.missing,
    ]);
    const [leftRate, stayNote, averageOf, averageOfToday, missingDetail] = cards.map(
      (card) => card.note,
    );
    expect(c.leftRate(5)).toBe(leftRate!.replace("{退職率}", "5"));
    expect(c.stayNote).toBe(stayNote);
    expect(c.averageOf(1)).toBe(averageOf!.replace("{平均に入った人数}", "1"));
    expect(c.averageOfToday(0)).toBe(averageOfToday!.replace("{平均に入った人数}", "0"));
    expect(c.missingDetail(43, 0)).toBe(missingDetail!.replace("{a}", "43").replace("{b}", "0"));
    expect(row("分析")).toEqual([
      TEXTS.analysis.title,
      "{チーム}の",
      TEXTS.analysis.lead,
      c.left,
      c.leftRate(5).replace("5", "{n}"),
      c.stay,
      c.stayNote,
      c.leftTenure,
      c.averageOf(1).replace("1", "{n}"),
      c.stayTenure,
      c.averageOfToday(0).replace("0", "{n}"),
      c.missing,
      // 「入社日{a}人／退職日{b}人が未入力」は「／」を含むので 2 つに分かれる
      ...c.missingDetail(43, 0).replace("43", "{a}").replace("0", "{b}").split("／"),
    ]);
    expect(TEXTS.analysis.teamPrefix("{チーム}")).toBe("{チーム}の");
  });

  it("分析の表の見出しと「回答者がいません」は §2.16 の文言と一致する", () => {
    const [headers] = capture(SECTION_2_16, /見出しの行（`div\.ret-r\.hd`）((?:「[^」]+」)+)/);
    const t = TEXTS.analysis.table;
    expect(headers).toBe(
      [t.type, t.stay, t.left, t.rate, t.leftTenure, t.stayTenure].map((s) => `「${s}」`).join(""),
    );
    expect(t.noRows).toBe(capture(SECTION_2_16, /1 行も無ければ「(.+?)」だけの行/)[0]);
    expect(row("分析の表")).toEqual([
      t.type,
      t.stay,
      t.left,
      t.rate,
      t.leftTenure,
      t.stayTenure,
      t.reference,
      t.noRows,
    ]);
  });

  it("通知の文は §2.15 の文と一致する", () => {
    const [saved] = capture(SECTION_2_15, /通知「(\{お名前\}さんを保存しました)」/);
    expect(TEXTS.toast.saved("テストテスト 01")).toBe(
      saved!.replace("{お名前}", "テストテスト 01"),
    );
    expect(row("通知")).toEqual([saved]);
  });

  it("差し込みの関数", () => {
    expect(TEXTS.analysis.cards.leftRate(5)).toBe("全体の 5%");
    expect(TEXTS.analysis.cards.averageOf(1)).toBe("1人の平均");
    expect(TEXTS.analysis.cards.averageOfToday(0)).toBe("0人の平均（今日まで）");
    expect(TEXTS.analysis.cards.missingDetail(43, 0)).toBe("入社日43人／退職日0人が未入力");
    expect(TEXTS.analysis.teamPrefix("Aチーム")).toBe("Aチームの");
    expect(TEXTS.analysis.notes.fewLeft(1)).toBe(
      "退職した人がまだ1人なので、割合は参考値です。人数が増えるほど、傾向が確かになります。",
    );
    expect(TEXTS.analysis.table.percent(18)).toBe("18%");
    expect(TEXTS.toast.saved("テストテスト 01")).toBe("テストテスト 01さんを保存しました");
    expect(TEXTS.edit.title("テストテスト 01")).toBe("テストテスト 01さん");
    expect(TEXTS.edit.title("")).toBe("さん"); // 氏名が空のとき（§2.15）
    expect(TEXTS.tenure.months(0)).toBe("0か月");
    expect(TEXTS.tenure.years(8)).toBe("8年");
  });
});
