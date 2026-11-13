// 組織内分類の表示の規則（11-3 §2.4・§2.6〜§2.12・§3.7）。画面（components/admin/classification/）が使う純関数と定数で、
// React・window・Next.js・Firebase に触れない（Client Component から import する）。人は GET /api/v1/admin/classification の
// ClassificationPersonDto（値は代表の受験とその受検者。11-3 §2.2）。集計と絞り込みは画面で行う（参照元どおり）。
// 人の分類はタイプの所属分類（APTITUDE_TYPE_DEFINITIONS の socialStyle）で決め、results.socialStyle を使わない（06 D06-19）
import { CLASSIFICATION_SCREEN_TEXTS } from "./classification-texts";
import { TEAM_CODES, teamLabel } from "./comparison-scope-params";
import type { EmploymentStatus } from "./employment";
import { formatDateSlashPadded } from "./format-datetime";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { CLASSIFICATION_TEXTS, TYPE_TEXTS } from "@/lib/masters/texts";
import type { AptitudeTypeDefinition } from "@/lib/masters/types";
import {
  APTITUDE_TYPE_KEYS,
  type AptitudeTypeKey,
  type SocialStyleKey,
  type TeamCode,
} from "@/lib/scoring/types";

/** 集計の対象（§2.8）。all = 全員、stay = 在籍、left = 退職 */
export type ClassificationMode = "all" | "stay" | "left";
/** チームの絞り込み（§2.7）。"" = すべて、"none" = 未設定 */
export type TeamFilter = "" | "none" | TeamCode;

/** 分類の色（§2.4 の 2 つの表）。すべて大文字の 6 桁の HEX（透明度を使わない） */
export interface QuadrantColors {
  // §2.4 の 1 つ目の表（参照元の色）
  readonly main: string; // 主色（割合バーの帯・凡例の四角・ミニ図の本人のマス）
  readonly dark: string; // 濃い色
  readonly bg: string; // 背景（象限の地・詳細パネルの上部の地）
  readonly mid: string; // 中間（いちばん濃い枠の地・見出しのマウスのときの地・ミニ図の同じ分類のマス）
  // K-49（§2.4 の 2 つ目の表）。文字と白い文字の地に使う色。マウスで地が変わる文字も 1 つの色（§2.22）
  readonly text: string; // 白の上の文字（凡例の %・適性・枠の印）、典型の印の地
  readonly onMid: string; // 象限の見出し（背景と、マウスのときの中間色の上）・人数のピルの地・枠の人数（中間色の上）
  readonly label: string; // 詳細パネルの丸いラベルの地（白い文字）
  readonly typeCount: string; // 4 タイプのボタンの人数（白と、マウスのときの #F7F9FA の上）
  readonly pos: string; // 位置の箱の印（#F9FAFB の上）
  readonly cellSub: string; // 人数 1 以上のキャラクターの枠の短縮名（中間色の上）
}

export interface QuadrantDefinition {
  readonly key: SocialStyleKey;
  readonly katakana: string; // アナリティカル など（SOCIAL_STYLE_DEFINITIONS の labelKatakana）
  readonly labelJa: string; // 分析型 など（同 labelJa）
  readonly x: 0 | 1; // 0 = 意見を聞く、1 = 意見を主張する
  readonly y: 0 | 1; // 0 = 感情表現を抑える、1 = 感情を表す
  readonly colors: QuadrantColors;
}

/** 印（§2.4）。典型・{隣の分類}寄り・中央寄り */
export interface Lean {
  readonly kind: "core" | "center" | "neighbor";
  readonly label: string; // 典型／{カタカナ名}寄り／中央寄り（矢印を付けない）
  readonly color: string; // キャラクターの枠の印の色（印の分類の text、中央寄りは #5F6B78）
  readonly posColor: string; // 位置の箱の印の色（印の分類の pos、中央寄りは #5F6B78）
  readonly arrow: "→" | "←" | "↓" | "↑" | "↘" | "↙" | "↗" | "↖" | null;
}

/** キャラクターの枠 1 つ（§2.4 の 16 キャラクターの表の 1 行） */
export interface CharacterCell {
  readonly type: AptitudeTypeKey;
  readonly quadrant: SocialStyleKey;
  readonly column: 0 | 1; // 分類の中の列（0 = 左、1 = 右）
  readonly row: 0 | 1; // 分類の中の行（0 = 上、1 = 下）
  readonly hiragana: string; // APTITUDE_TYPE_DEFINITIONS の characterNameHiragana
  readonly shortLabel: string; // 同 shortLabel
  readonly positionDescription: string; // 位置の説明（付録C §8。CLASSIFICATION_TEXTS[].characters）
  readonly lean: Lean;
}

/** チームを持つ人（§2.7） */
export interface TeamCarrier {
  readonly teamCode: TeamCode | null;
}

/** 集計と絞り込みに使う人の値（ClassificationPersonDto の一部。在籍・退職の人も同じ形を持つ） */
export interface ClassifiablePerson extends TeamCarrier {
  readonly resultId: string;
  readonly aptitudeType: AptitudeTypeKey;
  readonly employmentStatus: EmploymentStatus;
  readonly submittedAt: string; // 代表の受験の送信日時（ISO 8601）
}

/** 集計カード・マップの値（§2.6〜§2.11） */
export interface ClassificationSummary {
  readonly totalLabel: string; // 回答者／在籍中の人／退職した人
  readonly total: number; // チーム・対象で絞った後の人数
  readonly byQuadrant: Readonly<Record<SocialStyleKey, number>>;
  readonly byType: Readonly<Record<AptitudeTypeKey, number>>; // 16 タイプすべて（0 人を含む）
  readonly maxTypeCount: number; // byType の最大値（0 人なら 0）
  readonly modeCounts: Readonly<Record<ClassificationMode, number>>; // チームで絞った後、対象で絞る前
}

/** 回答者の一覧の 1 行の元になる人の値（ClassificationPersonDto の一部） */
export interface PanelMemberSource extends TeamCarrier {
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationLabel: string | null;
  readonly submittedAt: string;
}

/** 回答者の一覧の 1 行に出す値（§2.12 の表の「値」） */
export interface PanelMemberCells {
  readonly name: string; // 氏名。空なら「（未入力）」
  readonly occupation: string; // 職業の表示名。無ければ「—」
  readonly team: string; // 「{X}チーム」。未設定は「—」
  readonly submittedAt: string; // 受験日 YYYY/MM/DD（ゼロ埋め・Asia/Tokyo）
  readonly phoneNumber: string; // 空なら「—」
}

const TEXTS = CLASSIFICATION_SCREEN_TEXTS;

/** 中央寄りの印の色（§2.4。キャラクターの枠でも位置の箱でも同じ） */
const CENTER_LEAN_COLOR = "#5F6B78";
/** ミニ図のほかの分類の 12 マス（§2.4） */
const MINI_MAP_OTHER_COLOR = "#E9EDF1";
/** 人数 0 のキャラクターの枠の背景（§2.11） */
const EMPTY_CELL_BACKGROUND = "#F7F9FA";
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** 分類の順（凡例・割合バー・マップ・分析の同点の順。参照元の並び「A・D・M・E」。§2.4）。00 §1.7 の sortOrder・chartOrder とは別 */
export const QUADRANT_ORDER: readonly SocialStyleKey[] = Object.freeze([
  "analytical",
  "driving",
  "amiable",
  "expressive",
]);

function quadrant(
  key: SocialStyleKey,
  x: 0 | 1,
  y: 0 | 1,
  colors: QuadrantColors,
): QuadrantDefinition {
  const style = SOCIAL_STYLE_DEFINITIONS.find((s) => s.key === key);
  if (style === undefined) throw new RangeError(`ソーシャルスタイルの定義がありません: ${key}`);
  return Object.freeze({
    key,
    katakana: style.labelKatakana,
    labelJa: style.labelJa,
    x,
    y,
    colors: Object.freeze(colors),
  });
}

/**
 * 4 分類の位置と色（§2.4 の 2 つの表）。主色は SOCIAL_STYLE_DEFINITIONS[].color と同じ値
 * （zaiseki-29）。濃い色・背景・中間と K-49 の 6 つの色は新しい色
 */
export const QUADRANTS: Readonly<Record<SocialStyleKey, QuadrantDefinition>> = Object.freeze({
  analytical: quadrant("analytical", 0, 0, {
    main: "#41A67B",
    dark: "#2F8A63",
    bg: "#EAF5EF",
    mid: "#CBE8DA",
    text: "#2D845F",
    onMid: "#277151",
    label: "#338361",
    typeCount: "#2C805C",
    pos: "#2C825E",
    cellSub: "#596571",
  }),
  driving: quadrant("driving", 1, 0, {
    main: "#9570A1",
    dark: "#7A5788",
    bg: "#F3EEF5",
    mid: "#E2D6E7",
    text: "#7A5788", // 濃い色のまま
    onMid: "#745382",
    label: "#8F689C",
    typeCount: "#7A5788", // 濃い色のまま
    pos: "#7A5788", // 濃い色のまま
    cellSub: "#56616D",
  }),
  amiable: quadrant("amiable", 0, 1, {
    main: "#4194AF",
    dark: "#2F7C96",
    bg: "#E8F3F7",
    mid: "#CBE4ED",
    text: "#2F7C96", // 濃い色のまま
    onMid: "#286A81",
    label: "#377E95",
    typeCount: "#2E7A94",
    pos: "#2F7C96", // 濃い色のまま
    cellSub: "#58636F",
  }),
  expressive: quadrant("expressive", 1, 1, {
    main: "#E5B353",
    dark: "#A8791F",
    bg: "#FCF5E6",
    mid: "#F6E2B8",
    text: "#996E1C",
    onMid: "#835F18",
    label: "#9A6D17",
    typeCount: "#956B1B",
    pos: "#956B1B",
    cellSub: "#5C6774",
  }),
});

/** マップの位置 (x, y) の分類 */
function quadrantAt(x: 0 | 1, y: 0 | 1): QuadrantDefinition {
  for (const key of QUADRANT_ORDER) {
    const q = QUADRANTS[key];
    if (q.x === x && q.y === y) return q;
  }
  throw new RangeError(`マップの位置に分類がありません: (${x}, ${y})`);
}

const flip = (v: 0 | 1): 0 | 1 => (v === 0 ? 1 : 0);

/** 中央寄りの矢印（象限の位置で決まる。左上 ↘・右上 ↙・左下 ↗・右下 ↖） */
function centerArrow(x: 0 | 1, y: 0 | 1): Lean["arrow"] {
  if (y === 0) return x === 0 ? "↘" : "↙";
  return x === 0 ? "↗" : "↖";
}

/**
 * キャラクターの位置の印（§2.4 の規則）。象限の位置を (qx, qy)、分類の中の位置を (column, row) とする。
 * 両方同じ（マップの外側の角）は「典型」、両方違う（マップの中央の側）は「中央寄り」、片方だけ違えば、違う方の座標だけを
 * 反転した位置の分類の「{カタカナ名}寄り」。色は印の分類の text と pos（K-49）、中央寄りは #5F6B78
 */
export function leanOf(quadrantKey: SocialStyleKey, column: 0 | 1, row: 0 | 1): Lean {
  const own = QUADRANTS[quadrantKey];
  const sameX = column === own.x;
  const sameY = row === own.y;
  let lean: Lean;
  if (sameX && sameY) {
    lean = {
      kind: "core",
      label: TEXTS.lean.core,
      color: own.colors.text,
      posColor: own.colors.pos,
      arrow: null,
    };
  } else if (!sameX && !sameY) {
    lean = {
      kind: "center",
      label: TEXTS.lean.center,
      color: CENTER_LEAN_COLOR,
      posColor: CENTER_LEAN_COLOR,
      arrow: centerArrow(own.x, own.y),
    };
  } else {
    const neighbor = sameX ? quadrantAt(own.x, flip(own.y)) : quadrantAt(flip(own.x), own.y);
    lean = {
      kind: "neighbor",
      label: TEXTS.lean.neighbor(neighbor.katakana),
      color: neighbor.colors.text,
      posColor: neighbor.colors.pos,
      // 横が違うとき qx = 0 なら →・qx = 1 なら ←、縦が違うとき qy = 0 なら ↓・qy = 1 なら ↑
      arrow: sameX ? (own.y === 0 ? "↓" : "↑") : own.x === 0 ? "→" : "←",
    };
  }
  return Object.freeze(lean);
}

const TYPE_DEFINITIONS: ReadonlyMap<AptitudeTypeKey, AptitudeTypeDefinition> = new Map(
  APTITUDE_TYPE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

function typeDefinitionOf(type: AptitudeTypeKey): AptitudeTypeDefinition {
  const definition = TYPE_DEFINITIONS.get(type);
  if (definition === undefined) throw new RangeError(`適性タイプの定義がありません: ${type}`);
  return definition;
}

/** マップの順の 16 件（§2.4 の表の順。分類の順に、分類の中は左上・右上・左下・右下）。CLASSIFICATION_TEXTS と QUADRANTS から作る */
export const CHARACTER_CELLS: readonly CharacterCell[] = Object.freeze(
  QUADRANT_ORDER.flatMap((key) =>
    CLASSIFICATION_TEXTS[key].characters.map((character) => {
      const definition = typeDefinitionOf(character.aptitudeType);
      return Object.freeze({
        type: character.aptitudeType,
        quadrant: key,
        column: character.column,
        row: character.row,
        hiragana: definition.characterNameHiragana,
        shortLabel: definition.shortLabel,
        positionDescription: character.positionDescription,
        lean: leanOf(key, character.column, character.row),
      });
    }),
  ),
);

/** タイプの所属分類（00 §1.6。D06-19） */
function quadrantOfType(type: AptitudeTypeKey): SocialStyleKey {
  return typeDefinitionOf(type).socialStyle;
}

/**
 * キャラクターのパネルの 4×4 のミニ図の 16 マスの色（§2.4）。上の行から左から順に並べ、マス (X, Y) は
 * X = qx × 2 + column、Y = qy × 2 + row。本人 = 自分の分類の主色、同じ分類のほかの 3 マス = 中間色、ほかの 12 マス = #E9EDF1
 */
export function miniMapColors(type: AptitudeTypeKey): readonly string[] {
  const cell = CHARACTER_CELLS.find((c) => c.type === type);
  if (cell === undefined) throw new RangeError(`キャラクターの枠がありません: ${type}`);
  const own = QUADRANTS[cell.quadrant];
  const colors: string[] = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (x === own.x * 2 + cell.column && y === own.y * 2 + cell.row) {
        colors.push(own.colors.main);
      } else if (Math.floor(x / 2) === own.x && Math.floor(y / 2) === own.y) {
        colors.push(own.colors.mid);
      } else {
        colors.push(MINI_MAP_OTHER_COLOR);
      }
    }
  }
  return Object.freeze(colors);
}

function rgbOf(hex: string): readonly [number, number, number] {
  if (!HEX_PATTERN.test(hex)) throw new RangeError(`6 桁の HEX ではありません: ${hex}`);
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

/** 2 色を混ぜる（§2.11）。赤・緑・青のそれぞれを Math.round(a + (b − a) × t) にし、大文字の 6 桁の HEX にする */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  const mix = (from: number, to: number) => Math.round(from + (to - from) * t);
  const hex = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

/**
 * キャラクターの枠の背景（§2.11）。人数 0 は #F7F9FA、それ以外は白と中間色を 0.25 + 0.75 × count ÷ max で混ぜた色
 * （max = 今の絞り込みでの 16 タイプの人数の最大値。最多のキャラクターは中間色そのもの、1 人でも 25% は色が付く）
 */
export function cellBackground(count: number, max: number, mid: string): string {
  if (count === 0) return EMPTY_CELL_BACKGROUND;
  return mixHex("#FFFFFF", mid, 0.25 + (0.75 * count) / max);
}

/** 割合（§2.6・§2.10・§2.12）。Math.round(n ÷ total × 100)、total 0 は 0 */
export function percentOf(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

/** 付録C §1 の適性の見出しから山かっこを除いた「{適性}に適性があります」（§2.12。キャラクターのパネルの適性） */
export function aptitudeHeadingPlain(type: AptitudeTypeKey): string {
  return TYPE_TEXTS[type].aptitudeHeading.replace(/[<>]/g, "");
}

/** 使われているチーム（§2.7）。A→Z の順、チームが null の人がいれば最後に "none" */
export function teamChoices(people: readonly TeamCarrier[]): readonly Exclude<TeamFilter, "">[] {
  const used = new Set(people.map((person) => person.teamCode));
  const choices: Exclude<TeamFilter, "">[] = TEAM_CODES.filter((code) => used.has(code));
  if (used.has(null)) choices.push("none");
  return choices;
}

/**
 * チームの絞り込みを今の人に合わせる（§2.7・§2.18）。チームの種類が 1 つ以下、または team が teamChoices(people) に無ければ
 * ""（すべて）、それ以外は team のまま。保存している値の書き換えは呼び出し側が行う
 */
export function normalizeTeamFilter(team: TeamFilter, people: readonly TeamCarrier[]): TeamFilter {
  if (team === "") return "";
  const choices = teamChoices(people);
  return choices.length <= 1 || !choices.includes(team) ? "" : team;
}

/** チームで絞る（§2.7）。"" はすべて、"none" はチームが null の人、ほかはチームが一致する人 */
export function filterByTeam<P extends TeamCarrier>(
  people: readonly P[],
  team: TeamFilter,
): readonly P[] {
  if (team === "") return people;
  const code = team === "none" ? null : team;
  return people.filter((person) => person.teamCode === code);
}

/** チームの選択肢の名前（§2.7）。"none" は「未設定」、"A" は「Aチーム」 */
export function teamLabelOf(team: Exclude<TeamFilter, "">): string {
  return team === "none" ? TEXTS.summary.teamNone : teamLabel(team);
}

/** 対象に入るか（§2.8）。全員はすべて、在籍は区分が在籍、退職は区分が退職。求職者は全員だけに入る */
export function inMode(person: ClassifiablePerson, mode: ClassificationMode): boolean {
  switch (mode) {
    case "all":
      return true;
    case "stay":
      return person.employmentStatus === "employed";
    case "left":
      return person.employmentStatus === "left";
  }
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const key of keys) counts[key] = 0;
  return counts;
}

/**
 * 集計カードとマップの値（§2.6〜§2.11）。チームで絞ってから全員／在籍／退職の数を数え、対象で絞って人数・分類ごと・タイプごとの
 * 人数を数える。チームの正規化（normalizeTeamFilter）はしない（呼び出し側）
 */
export function summarizeClassification(
  people: readonly ClassifiablePerson[],
  team: TeamFilter,
  mode: ClassificationMode,
): ClassificationSummary {
  const teamPeople = filterByTeam(people, team);
  const modeCounts: Record<ClassificationMode, number> = {
    all: teamPeople.length,
    stay: teamPeople.filter((person) => inMode(person, "stay")).length,
    left: teamPeople.filter((person) => inMode(person, "left")).length,
  };
  const targets = teamPeople.filter((person) => inMode(person, mode));
  const byQuadrant = zeroCounts(QUADRANT_ORDER);
  const byType = zeroCounts(APTITUDE_TYPE_KEYS);
  for (const person of targets) {
    byType[person.aptitudeType] += 1;
    byQuadrant[quadrantOfType(person.aptitudeType)] += 1;
  }
  return {
    totalLabel: TEXTS.summary.totalLabels[mode],
    total: targets.length,
    byQuadrant,
    byType,
    maxTypeCount: Math.max(0, ...APTITUDE_TYPE_KEYS.map((key) => byType[key])),
    modeCounts,
  };
}

/** submittedAt の降順、同じなら resultId の昇順（文字コードの順。localeCompare は使わない） */
function newestFirst(a: ClassifiablePerson, b: ClassifiablePerson): number {
  const byTime = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
  if (byTime !== 0) return byTime;
  if (a.resultId === b.resultId) return 0;
  return a.resultId < b.resultId ? -1 : 1;
}

/**
 * 詳細パネルの回答者（§2.12）。今の絞り込み（チーム・対象）の後の、その分類（タイプの所属分類）またはタイプの人を、
 * 受験日時の新しい順（同じなら resultId の昇順）に並べる
 */
export function panelMembers<P extends ClassifiablePerson>(
  people: readonly P[],
  team: TeamFilter,
  mode: ClassificationMode,
  target: { readonly quadrant: SocialStyleKey } | { readonly type: AptitudeTypeKey },
): readonly P[] {
  const matches = (person: P): boolean =>
    "quadrant" in target
      ? quadrantOfType(person.aptitudeType) === target.quadrant
      : person.aptitudeType === target.type;
  return filterByTeam(people, team)
    .filter((person) => inMode(person, mode) && matches(person))
    .sort(newestFirst);
}

/**
 * 回答者の一覧の 1 行の値（§2.12 の表）。お名前は空なら「（未入力）」、職業・チーム・電話番号は無ければ「—」、
 * チームは「{X}チーム」、受験日は YYYY/MM/DD（ゼロ埋め・Asia/Tokyo）
 */
export function panelMemberCells(person: PanelMemberSource): PanelMemberCells {
  const none = TEXTS.members.none;
  return {
    name: person.name === "" ? TEXTS.members.noName : person.name,
    occupation: person.occupationLabel ?? none,
    team: person.teamCode === null ? none : teamLabel(person.teamCode),
    submittedAt: formatDateSlashPadded(person.submittedAt),
    phoneNumber: person.phoneNumber === "" ? none : person.phoneNumber,
  };
}
