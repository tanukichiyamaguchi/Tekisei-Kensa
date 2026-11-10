// 組織内分類の表示の規則（11-3 §2.4・§2.6〜§2.12・§3.7・§5.1。lib/presentation/classification-view.ts）と画面の文言
// （classification-texts.ts）。M7-zaiseki-04 QUADRANTS・CHARACTER_CELLS、M7-zaiseki-05 leanOf、M7-zaiseki-06 miniMapColors、
// M7-zaiseki-07 mixHex・cellBackground、M7-zaiseki-08 percentOf、M7-zaiseki-09 チームの関数、M7-zaiseki-10 summarizeClassification、
// M7-zaiseki-11 panelMembers・回答者の一覧の値、M7-zaiseki-23 aptitudeHeadingPlain。
// 色と印の期待値は 11-3 §2.4 の 3 つの表を読んで作る（文言マスタの M7-zaiseki-02 と同じ書き方）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { CLASSIFICATION_TEXTS, TYPE_TEXTS } from "@/lib/masters/texts";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  aptitudeHeadingPlain,
  cellBackground,
  CHARACTER_CELLS,
  filterByTeam,
  leanOf,
  miniMapColors,
  mixHex,
  normalizeTeamFilter,
  panelMemberCells,
  panelMembers,
  percentOf,
  QUADRANT_ORDER,
  QUADRANTS,
  summarizeClassification,
  teamChoices,
  teamLabelOf,
  type ClassifiablePerson,
  type QuadrantColors,
  type TeamCarrier,
} from "@/lib/presentation/classification-view";
import {
  APTITUDE_TYPE_KEYS,
  SOCIAL_STYLE_KEYS,
  type AptitudeTypeKey,
  type SocialStyleKey,
  type TeamCode,
} from "@/lib/scoring/types";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const SPEC = read("docs/基本設計/11_参照元の更新/11-3_在籍・退職と組織内分類.md");
const C = read("docs/付録C_表示文言マスタ.md");

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

const SECTION_2_4 = between(SPEC, "### 2.4 ", "### 2.5 ");
const STYLE_BY_KATAKANA = new Map(SOCIAL_STYLE_DEFINITIONS.map((s) => [s.labelKatakana, s.key]));
const TYPE_BY_SHORT_LABEL = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.shortLabel, t.key]));
const CELLS: Readonly<Record<string, readonly [0 | 1, 0 | 1]>> = {
  左上: [0, 0],
  右上: [1, 0],
  左下: [0, 1],
  右下: [1, 1],
};
const HEX = /#[0-9A-F]{6}/g;

/** §2.4 の 1 つ目の表（分類の順・位置・参照元の色） */
const TABLE_1 = [
  ...SECTION_2_4.matchAll(
    /^\| \d \| `(\w+)` \| (\S+) \| (\S+) \| \S+ \| (\d)(?:（[^）]+）)? \| (\d)(?:（[^）]+）)? \| (.+) \|$/gm,
  ),
].map((m) => ({
  key: m[1] as SocialStyleKey,
  katakana: m[2]!,
  labelJa: m[3]!,
  x: Number(m[4]),
  y: Number(m[5]),
  colors: m[6]!.match(HEX) ?? [],
}));

/** §2.4 の 2 つ目の表（K-49 の 6 つの色） */
const TABLE_2 = [
  ...between(SECTION_2_4, "白の上の文字 `text`", "- 使う場所").matchAll(
    /^\| \d \| `(\w+)` \| (.+) \|$/gm,
  ),
].map((m) => ({ key: m[1] as SocialStyleKey, colors: m[2]!.match(HEX) ?? [] }));

/** §2.4 の 16 キャラクターの表（マップの順） */
const TABLE_3 = [
  ...SECTION_2_4.matchAll(
    /^\| \d+ \| (\S+) \| (左上|右上|左下|右下) \| `(\w+)` \| (\S+) \| (\S+) \| (\S+) \| (#[0-9A-F]{6}) \| (#[0-9A-F]{6}) \| (\S+) \|$/gm,
  ),
].map((m) => ({
  quadrant: STYLE_BY_KATAKANA.get(m[1]!)!,
  column: CELLS[m[2]!]![0],
  row: CELLS[m[2]!]![1],
  type: m[3] as AptitudeTypeKey,
  hiragana: m[4]!,
  shortLabel: m[5]!,
  lean: m[6]!,
  color: m[7]!,
  posColor: m[8]!,
  arrow: m[9] === "なし" ? null : m[9]!,
}));

describe("M7-zaiseki-04 QUADRANTS・CHARACTER_CELLS（11-3 §2.4）", () => {
  it("分類の順は アナリティカル・ドライビング・エミアブル・エクスプレッシブ（参照元の並び「A・D・M・E」）", () => {
    expect(QUADRANT_ORDER).toEqual(["analytical", "driving", "amiable", "expressive"]);
    expect(TABLE_1.map((row) => row.key)).toEqual([...QUADRANT_ORDER]);
    expect([...Object.keys(QUADRANTS)].sort()).toEqual([...SOCIAL_STYLE_KEYS].sort());
  });

  it("4 分類の名前・位置と 16 色（主色・濃い色・背景・中間）が §2.4 の 1 つ目の表と一致する", () => {
    expect(TABLE_1).toHaveLength(4);
    for (const row of TABLE_1) {
      const q = QUADRANTS[row.key];
      expect([q.key, q.katakana, q.labelJa, q.x, q.y], row.key).toEqual([
        row.key,
        row.katakana,
        row.labelJa,
        row.x,
        row.y,
      ]);
      expect([q.colors.main, q.colors.dark, q.colors.bg, q.colors.mid], row.key).toEqual(
        row.colors,
      );
    }
    expect(QUADRANTS.analytical).toMatchObject({ x: 0, y: 0 });
    expect(QUADRANTS.driving).toMatchObject({ x: 1, y: 0 });
    expect(QUADRANTS.amiable).toMatchObject({ x: 0, y: 1 });
    expect(QUADRANTS.expressive).toMatchObject({ x: 1, y: 1 });
  });

  it("K-49 の 24 色（text・onMid・label・typeCount・pos・cellSub）が §2.4 の 2 つ目の表と一致する", () => {
    expect(TABLE_2.map((row) => row.key)).toEqual([...QUADRANT_ORDER]);
    const fields: readonly (keyof QuadrantColors)[] = [
      "text",
      "onMid",
      "label",
      "typeCount",
      "pos",
      "cellSub",
    ];
    for (const row of TABLE_2) {
      expect(row.colors, row.key).toHaveLength(6);
      expect(
        fields.map((field) => QUADRANTS[row.key].colors[field]),
        row.key,
      ).toEqual(row.colors);
    }
  });

  it("色はすべて大文字の 6 桁の HEX（透明度を使わない）で、凍結されている", () => {
    for (const key of QUADRANT_ORDER) {
      for (const color of Object.values(QUADRANTS[key].colors)) {
        expect(color, key).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(Object.isFrozen(QUADRANTS[key])).toBe(true);
      expect(Object.isFrozen(QUADRANTS[key].colors)).toBe(true);
    }
    expect(Object.isFrozen(QUADRANTS)).toBe(true);
  });

  it("主色は SOCIAL_STYLE_DEFINITIONS[].color（rgba の形）と赤・緑・青の値で同じ（zaiseki-29）", () => {
    const rgbOfHex = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const style of SOCIAL_STYLE_DEFINITIONS) {
      const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style.color);
      expect(rgb, style.key).not.toBeNull();
      expect(rgbOfHex(QUADRANTS[style.key].colors.main), style.key).toEqual(
        rgb!.slice(1, 4).map(Number),
      );
      expect(QUADRANTS[style.key].katakana).toBe(style.labelKatakana);
      expect(QUADRANTS[style.key].labelJa).toBe(style.labelJa);
    }
  });

  it("CHARACTER_CELLS は §2.4 の 16 キャラクターの表の順で、所属分類が APTITUDE_TYPE_DEFINITIONS と一致する", () => {
    expect(TABLE_3).toHaveLength(16);
    expect(CHARACTER_CELLS.map((c) => c.type)).toEqual(TABLE_3.map((row) => row.type));
    expect(CHARACTER_CELLS.map((c) => c.type)).toEqual([
      "scientist",
      "professional",
      "artist",
      "creator",
      "reviewer",
      "pioneer",
      "controller",
      "actor",
      "specialist",
      "conductor",
      "follower",
      "generalist",
      "attendant",
      "promoter",
      "receptionist",
      "freelancer",
    ]);
    expect([...CHARACTER_CELLS.map((c) => c.type)].sort()).toEqual([...APTITUDE_TYPE_KEYS].sort());
    for (const [i, row] of TABLE_3.entries()) {
      const cell = CHARACTER_CELLS[i]!;
      const definition = APTITUDE_TYPE_DEFINITIONS.find((t) => t.key === cell.type)!;
      expect(cell.quadrant, cell.type).toBe(definition.socialStyle);
      expect(
        [cell.quadrant, cell.column, cell.row, cell.hiragana, cell.shortLabel],
        cell.type,
      ).toEqual([row.quadrant, row.column, row.row, row.hiragana, row.shortLabel]);
      expect(TYPE_BY_SHORT_LABEL.get(row.shortLabel)).toBe(cell.type);
      expect([cell.hiragana, cell.shortLabel]).toEqual([
        definition.characterNameHiragana,
        definition.shortLabel,
      ]);
    }
  });

  it("位置の説明は付録C §8（CLASSIFICATION_TEXTS[].characters）のまま", () => {
    for (const cell of CHARACTER_CELLS) {
      const character = CLASSIFICATION_TEXTS[cell.quadrant].characters.find(
        (c) => c.aptitudeType === cell.type,
      )!;
      expect(cell.positionDescription).toBe(character.positionDescription);
      expect([cell.column, cell.row]).toEqual([character.column, character.row]);
    }
    expect(CHARACTER_CELLS.find((c) => c.type === "scientist")?.positionDescription).toBe(
      "論理的で、感情の起伏が小さい。人との関わりも必要な分だけ。分析型らしさが最も強いタイプです。",
    );
    expect(Object.isFrozen(CHARACTER_CELLS)).toBe(true);
    expect(Object.isFrozen(CHARACTER_CELLS[0])).toBe(true);
  });
});

describe("M7-zaiseki-05 leanOf（11-3 §2.4 の印の規則）", () => {
  it("16 件の印の文言・印の色・位置の箱の印の色・矢印が §2.4 の表と一致する", () => {
    for (const [i, row] of TABLE_3.entries()) {
      const lean = leanOf(row.quadrant, row.column, row.row);
      expect([lean.label, lean.color, lean.posColor, lean.arrow], row.type).toEqual([
        row.lean,
        row.color,
        row.posColor,
        row.arrow,
      ]);
      expect(CHARACTER_CELLS[i]!.lean).toEqual(lean);
    }
  });

  it("外側の角は典型（自分の text・pos）、中央の側は中央寄り（#5F6B78）、片方だけ違えば隣の分類寄り", () => {
    expect(leanOf("analytical", 0, 0)).toEqual({
      kind: "core",
      label: "典型",
      color: "#2D845F",
      posColor: "#2C825E",
      arrow: null,
    });
    expect(leanOf("expressive", 0, 0)).toEqual({
      kind: "center",
      label: "中央寄り",
      color: "#5F6B78",
      posColor: "#5F6B78",
      arrow: "↖",
    });
    // ドライビングの右下は、縦だけを反転した位置（右下）のエクスプレッシブ寄り
    expect(leanOf("driving", 1, 1)).toEqual({
      kind: "neighbor",
      label: "エクスプレッシブ寄り",
      color: "#996E1C",
      posColor: "#956B1B",
      arrow: "↓",
    });
    // エミアブルの左上は、縦だけを反転した位置（左上）のアナリティカル寄り
    expect(leanOf("amiable", 0, 0)).toMatchObject({
      kind: "neighbor",
      label: "アナリティカル寄り",
      arrow: "↑",
    });
    const kinds = CHARACTER_CELLS.map((c) => c.lean.kind);
    expect(kinds.filter((k) => k === "core")).toHaveLength(4);
    expect(kinds.filter((k) => k === "center")).toHaveLength(4);
    expect(kinds.filter((k) => k === "neighbor")).toHaveLength(8);
  });
});

describe("M7-zaiseki-06 miniMapColors（11-3 §2.4 の 4×4 のミニ図）", () => {
  const cellsOf = (colors: readonly string[], color: string) =>
    colors.flatMap((c, i) => (c === color ? [[i % 4, Math.floor(i / 4)]] : []));

  it("あいり: 左上のマスが主色、分析型の残り 3 マスが中間色、ほかの 12 マスが #E9EDF1", () => {
    const colors = miniMapColors("scientist");
    expect(colors).toHaveLength(16);
    expect(colors[0]).toBe("#41A67B");
    expect(cellsOf(colors, "#41A67B")).toEqual([[0, 0]]);
    expect(cellsOf(colors, "#CBE8DA")).toEqual([
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(cellsOf(colors, "#E9EDF1")).toHaveLength(12);
  });

  it("のぞみ: 右下のマスが #E5B353。なつき: マス (2, 1) が #9570A1", () => {
    const nozomi = miniMapColors("freelancer");
    expect(nozomi[15]).toBe("#E5B353");
    expect(cellsOf(nozomi, "#F6E2B8")).toEqual([
      [2, 2],
      [3, 2],
      [2, 3],
    ]);
    const natsuki = miniMapColors("controller");
    expect(cellsOf(natsuki, "#9570A1")).toEqual([[2, 1]]);
    expect(natsuki[1 * 4 + 2]).toBe("#9570A1");
    expect(cellsOf(natsuki, "#E2D6E7")).toEqual([
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
  });

  it("16 タイプとも、主色 1・中間色 3・#E9EDF1 が 12 マス", () => {
    for (const cell of CHARACTER_CELLS) {
      const { main, mid } = QUADRANTS[cell.quadrant].colors;
      const colors = miniMapColors(cell.type);
      expect(cellsOf(colors, main), cell.type).toEqual([
        [QUADRANTS[cell.quadrant].x * 2 + cell.column, QUADRANTS[cell.quadrant].y * 2 + cell.row],
      ]);
      expect(cellsOf(colors, mid), cell.type).toHaveLength(3);
      expect(cellsOf(colors, "#E9EDF1"), cell.type).toHaveLength(12);
    }
  });
});

describe("M7-zaiseki-07 mixHex・cellBackground（11-3 §2.11）", () => {
  it("白と中間色を 0.25 + 0.75 × n ÷ max で混ぜ、各成分を Math.round する", () => {
    expect(cellBackground(2, 16, "#CBE8DA")).toBe("#EDF7F2");
    expect(cellBackground(5, 16, "#CBE8DA")).toBe("#E6F4ED");
    expect(cellBackground(16, 16, "#CBE4ED")).toBe("#CBE4ED"); // 最多は中間色そのもの
    expect(cellBackground(1, 16, "#CBE4ED")).toBe("#F0F7FA");
    expect(cellBackground(3, 5, "#E2D6E7")).toBe("#EBE2EE");
    expect(cellBackground(1, 3, "#CBE8DA")).toBe("#E5F4ED"); // 緑の 243.5 を 244 にする
  });

  it("人数 0 は #F7F9FA", () => {
    expect(cellBackground(0, 16, "#CBE8DA")).toBe("#F7F9FA");
    expect(cellBackground(0, 0, "#CBE8DA")).toBe("#F7F9FA");
  });

  it("mixHex は大文字の 6 桁の HEX（t = 0 は a、t = 1 は b。小文字の入力も読む）", () => {
    expect(mixHex("#FFFFFF", "#CBE8DA", 0.5)).toBe("#E5F4ED");
    expect(mixHex("#ffffff", "#cbe8da", 0)).toBe("#FFFFFF");
    expect(mixHex("#FFFFFF", "#cbe8da", 1)).toBe("#CBE8DA");
    expect(mixHex("#000000", "#0A0A0A", 0.5)).toBe("#050505");
    expect(() => mixHex("#FFF", "#CBE8DA", 0.5)).toThrow(RangeError);
  });
});

describe("M7-zaiseki-08 percentOf（11-3 §2.6・§2.10・§2.12）", () => {
  it("Math.round(n ÷ total × 100)。total 0 は 0", () => {
    expect(percentOf(11, 60)).toBe(18);
    expect(percentOf(24, 60)).toBe(40);
    expect(percentOf(1, 2)).toBe(50);
    expect(percentOf(2, 11)).toBe(18);
    expect(percentOf(1, 8)).toBe(13);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("M7-zaiseki-09 teamChoices・normalizeTeamFilter・filterByTeam・teamLabelOf（11-3 §2.7）", () => {
  const teams = (...codes: (TeamCode | null)[]): TeamCarrier[] =>
    codes.map((teamCode) => ({ teamCode }));

  it("使われているチームを A→Z の順に、未設定の人がいれば最後に none", () => {
    expect(teamChoices(teams("Y", null, "A", "J", "A", null))).toEqual(["A", "J", "Y", "none"]);
    expect(teamChoices(teams("B", "A"))).toEqual(["A", "B"]); // 未設定の人がいなければ none は無い
    expect(teamChoices(teams())).toEqual([]);
  });

  it("チームの種類が 1 つ以下（全員未設定・全員 A・0 人）なら「すべて」に戻す", () => {
    expect(normalizeTeamFilter("none", teams(null, null))).toBe("");
    expect(normalizeTeamFilter("A", teams("A", "A"))).toBe("");
    expect(normalizeTeamFilter("A", teams())).toBe("");
    expect(normalizeTeamFilter("", teams("A", "B"))).toBe("");
  });

  it("種類が 2 つ以上でも、選択肢に無いチーム（人がいなくなったチーム）は「すべて」に戻し、あれば保つ", () => {
    const people = teams("A", "B", null);
    expect(normalizeTeamFilter("C", people)).toBe("");
    expect(normalizeTeamFilter("A", people)).toBe("A");
    expect(normalizeTeamFilter("none", people)).toBe("none");
    expect(normalizeTeamFilter("none", teams("A", "B"))).toBe("");
  });

  it("filterByTeam: すべて・未設定（null）・チームの一致", () => {
    const people = [
      { id: 1, teamCode: "A" as const },
      { id: 2, teamCode: null },
      { id: 3, teamCode: "B" as const },
      { id: 4, teamCode: "A" as const },
    ];
    expect(filterByTeam(people, "").map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(filterByTeam(people, "none").map((p) => p.id)).toEqual([2]);
    expect(filterByTeam(people, "A").map((p) => p.id)).toEqual([1, 4]);
    expect(filterByTeam(people, "Z")).toEqual([]);
  });

  it("teamLabelOf: none は「未設定」、A は「Aチーム」", () => {
    expect(teamLabelOf("none")).toBe("未設定");
    expect(teamLabelOf("A")).toBe("Aチーム");
    expect(teamLabelOf("Z")).toBe("Zチーム");
  });
});

/** 人（架空の値）。submittedAt を渡さなければ resultId の番号で日時を作る */
function person(
  id: string,
  aptitudeType: AptitudeTypeKey,
  overrides: Partial<ClassifiablePerson> = {},
): ClassifiablePerson {
  return {
    resultId: `Res${id}`,
    aptitudeType,
    employmentStatus: "candidate",
    submittedAt: `2026-10-${id.padStart(2, "0")}T00:00:00.000Z`,
    teamCode: null,
    ...overrides,
  };
}

describe("M7-zaiseki-10 summarizeClassification（11-3 §2.6〜§2.8・§2.10・§2.11）", () => {
  const people: ClassifiablePerson[] = [
    person("01", "scientist", { employmentStatus: "employed", teamCode: "A" }),
    person("02", "scientist", { employmentStatus: "candidate", teamCode: "A" }),
    person("03", "pioneer", { employmentStatus: "left", teamCode: "A" }),
    person("04", "conductor", { employmentStatus: "employed", teamCode: "B" }),
    person("05", "conductor", { employmentStatus: "employed", teamCode: null }),
    person("06", "conductor", { employmentStatus: "candidate", teamCode: "B" }),
    person("07", "freelancer", { employmentStatus: "left", teamCode: "B" }),
  ];

  it("全員: ラベル「回答者」、人数・分類ごと・タイプごと（16 キー、0 を含む）・最大値", () => {
    const s = summarizeClassification(people, "", "all");
    expect(s.totalLabel).toBe("回答者");
    expect(s.total).toBe(7);
    expect(s.byQuadrant).toEqual({ analytical: 2, driving: 1, amiable: 3, expressive: 1 });
    expect(Object.keys(s.byType).sort()).toEqual([...APTITUDE_TYPE_KEYS].sort());
    expect(s.byType).toMatchObject({ scientist: 2, pioneer: 1, conductor: 3, freelancer: 1 });
    expect(Object.values(s.byType).reduce((a, b) => a + b, 0)).toBe(7);
    expect(s.byType.attendant).toBe(0);
    expect(s.maxTypeCount).toBe(3);
    expect(s.modeCounts).toEqual({ all: 7, stay: 3, left: 2 });
  });

  it("在籍: ラベル「在籍中の人」、区分が在籍の人だけ（求職者は入らない）", () => {
    const s = summarizeClassification(people, "", "stay");
    expect(s.totalLabel).toBe("在籍中の人");
    expect(s.total).toBe(3);
    expect(s.byQuadrant).toEqual({ analytical: 1, driving: 0, amiable: 2, expressive: 0 });
    expect(s.maxTypeCount).toBe(2);
    expect(s.modeCounts).toEqual({ all: 7, stay: 3, left: 2 }); // 対象で絞る前
  });

  it("退職: ラベル「退職した人」、区分が退職の人だけ（求職者は入らない）", () => {
    const s = summarizeClassification(people, "", "left");
    expect(s.totalLabel).toBe("退職した人");
    expect(s.total).toBe(2);
    expect(s.byQuadrant).toEqual({ analytical: 0, driving: 1, amiable: 0, expressive: 1 });
    expect(s.maxTypeCount).toBe(1);
  });

  it("modeCounts はチームで絞った後・対象で絞る前の数", () => {
    const a = summarizeClassification(people, "A", "left");
    expect(a.modeCounts).toEqual({ all: 3, stay: 1, left: 1 });
    expect(a.total).toBe(1);
    expect(a.byType.pioneer).toBe(1);
    const none = summarizeClassification(people, "none", "all");
    expect(none.modeCounts).toEqual({ all: 1, stay: 1, left: 0 });
    expect(none.byType.conductor).toBe(1);
  });

  it("分類はタイプの所属分類で数え、results の socialStyle を使わない（D06-19）", () => {
    // 受験の socialStyle がエクスプレッシブでも、タイプがサイエンティストならアナリティカル
    const mixed = [{ ...person("01", "scientist"), socialStyle: "expressive" as SocialStyleKey }];
    const s = summarizeClassification(mixed, "", "all");
    expect(s.byQuadrant).toEqual({ analytical: 1, driving: 0, amiable: 0, expressive: 0 });
  });

  it("0 人なら人数 0・最大値 0、16 タイプとも 0", () => {
    const s = summarizeClassification([], "", "all");
    expect(s.total).toBe(0);
    expect(s.maxTypeCount).toBe(0);
    expect(Object.values(s.byType).every((n) => n === 0)).toBe(true);
    expect(s.byQuadrant).toEqual({ analytical: 0, driving: 0, amiable: 0, expressive: 0 });
    expect(s.modeCounts).toEqual({ all: 0, stay: 0, left: 0 });
  });
});

describe("M7-zaiseki-11 panelMembers・回答者の一覧の値（11-3 §2.12）", () => {
  const at = "2026-10-05T00:00:00.000Z";
  const people: ClassifiablePerson[] = [
    person("01", "conductor", { employmentStatus: "employed", teamCode: "A" }),
    person("02", "follower", { employmentStatus: "candidate", teamCode: "A" }),
    person("Ra", "conductor", { employmentStatus: "employed", teamCode: "A", submittedAt: at }),
    person("RB", "conductor", { employmentStatus: "left", teamCode: "A", submittedAt: at }),
    person("03", "conductor", { employmentStatus: "employed", teamCode: "B" }),
    person("04", "scientist", { employmentStatus: "employed", teamCode: "A" }),
    person("09", "generalist", { employmentStatus: "employed", teamCode: "A" }),
  ];
  const ids = (list: readonly ClassifiablePerson[]) => list.map((p) => p.resultId);

  it("受験日時の新しい順、同じなら resultId の昇順（文字コードの順）", () => {
    expect(ids(panelMembers(people, "", "all", { type: "conductor" }))).toEqual([
      "ResRB",
      "ResRa",
      "Res03",
      "Res01",
    ]);
  });

  it("分類のパネルは所属分類の 4 タイプの人、キャラクターのパネルはそのタイプの人", () => {
    expect(ids(panelMembers(people, "", "all", { quadrant: "amiable" }))).toEqual([
      "Res09",
      "ResRB",
      "ResRa",
      "Res03",
      "Res02",
      "Res01",
    ]);
    expect(ids(panelMembers(people, "", "all", { quadrant: "analytical" }))).toEqual(["Res04"]);
    expect(panelMembers(people, "", "all", { quadrant: "expressive" })).toEqual([]);
  });

  it("今の絞り込み（チーム・対象）が効く", () => {
    expect(ids(panelMembers(people, "A", "stay", { quadrant: "amiable" }))).toEqual([
      "Res09",
      "ResRa",
      "Res01",
    ]);
    expect(ids(panelMembers(people, "A", "left", { type: "conductor" }))).toEqual(["ResRB"]);
    expect(ids(panelMembers(people, "B", "all", { type: "conductor" }))).toEqual(["Res03"]);
    expect(panelMembers(people, "none", "all", { type: "conductor" })).toEqual([]);
  });

  it("入力の配列を並べ替えない", () => {
    const before = ids(people);
    panelMembers(people, "", "all", { type: "conductor" });
    expect(ids(people)).toEqual(before);
  });

  it("表の値: 空の氏名は「（未入力）」、職業 null・チーム null・空の電話番号は「—」、チームは「Aチーム」", () => {
    expect(
      panelMemberCells({
        name: "",
        phoneNumber: "",
        occupationLabel: null,
        teamCode: null,
        submittedAt: "2026-09-06T14:59:59.999Z",
      }),
    ).toEqual({
      name: "（未入力）",
      occupation: "—",
      team: "—",
      submittedAt: "2026/09/06",
      phoneNumber: "—",
    });
    expect(
      panelMemberCells({
        name: "テストテスト 01",
        phoneNumber: "090-0000-0001",
        occupationLabel: "アイリスト",
        teamCode: "A",
        submittedAt: "2026-09-06T15:00:00.000Z",
      }),
    ).toEqual({
      name: "テストテスト 01",
      occupation: "アイリスト",
      team: "Aチーム",
      submittedAt: "2026/09/07", // UTC 15:00 以降は東京の翌日
      phoneNumber: "090-0000-0001",
    });
  });
});

describe("M7-zaiseki-23 aptitudeHeadingPlain（11-3 §2.12）", () => {
  // 付録C §1 の表の「適性（見出し）」（<…>に適性があります）
  const headings = new Map(
    [
      ...between(C, "## 1. ", "## 2. ").matchAll(
        /^\| (.+?)タイプ \| \w+ \| \S+ \| <([^<>]+)>に適性があります \|$/gm,
      ),
    ].map((m) => [TYPE_BY_SHORT_LABEL.get(m[1]!)!, m[2]!]),
  );

  it("16 件が「{適性}に適性があります」で山かっこを含まず、適性の部分が付録C §1 の見出しの山かっこの中と一致する", () => {
    expect(headings.size).toBe(16);
    for (const type of APTITUDE_TYPE_KEYS) {
      const plain = aptitudeHeadingPlain(type);
      expect(plain, type).toBe(`${headings.get(type)}に適性があります`);
      expect(plain, type).not.toMatch(/[<>＜＞〈〉]/);
      expect(TYPE_TEXTS[type].aptitudeHeading, type).toBe(
        `<${headings.get(type)}>に適性があります`,
      );
    }
    expect(aptitudeHeadingPlain("scientist")).toBe("学術分野の仕事に適性があります");
  });
});

describe("画面の文言（classification-texts.ts。11-3 §2.5・§2.9・§2.23）", () => {
  const TEXTS = CLASSIFICATION_SCREEN_TEXTS;

  it("「組織内分類とは」の本文は §2.5 の本文と空白・改行まで一字一句同じ", () => {
    const block = between(SPEC, "本文（空白・改行は原文どおり）:", "### 2.6 ");
    const body = /```text\n([\s\S]+?)\n```/.exec(block)?.[1];
    expect(body).toBeDefined();
    expect(TEXTS.about.body).toBe(body);
    expect(TEXTS.about.title).toBe("組織内分類とは");
  });

  it("説明文は §2.9 の文と一致する", () => {
    const quoted = /- 説明文 `p\.ob-note`（集計カードの下）: 「(.+)」$/m.exec(SPEC)?.[1];
    expect(TEXTS.note).toBe(quoted);
  });

  it("人数のラベル・全員／在籍／退職・軸・印・読み上げ名", () => {
    expect(TEXTS.summary.totalLabels).toEqual({
      all: "回答者",
      stay: "在籍中の人",
      left: "退職した人",
    });
    expect(TEXTS.summary.modes).toEqual({ all: "全員", stay: "在籍", left: "退職" });
    expect([TEXTS.axis.left, TEXTS.axis.right, TEXTS.axis.top, TEXTS.axis.bottom]).toEqual([
      "← 意見を聞く",
      "意見を主張する →",
      "感情表現を抑える",
      "感情を表す",
    ]);
    expect(TEXTS.quadrant.headingLabel("アナリティカル", "分析型", 11)).toBe(
      "アナリティカル（分析型）の説明 11人",
    );
    expect(TEXTS.quadrant.foldLabel("アナリティカル")).toBe("アナリティカルの一覧を開閉");
    expect(TEXTS.cell.label("あかり", "コンダクター", "中央寄り", 16)).toBe(
      "あかり コンダクタータイプ 中央寄り 16人",
    );
    expect(TEXTS.panel.share(11, 18)).toBe("11人（全体の18%）");
    expect(TEXTS.panel.typeName("あいり", "サイエンティスト")).toBe("あいり　サイエンティスト");
    expect(TEXTS.panel.quadrantTag("アナリティカル", "分析型")).toBe("アナリティカル（分析型）");
  });
});
