// 在籍・退職の表示の規則（11-3 §2.13・§2.14・§2.16〜§2.18・§3.7）。画面（components/admin/employment/）が使う純関数と定数で、
// React・window・Next.js・Firebase に触れない（Client Component から import する）。人は GET /api/v1/admin/employment の
// EmploymentPersonDto（値は代表の受験とその受検者。組織内分類と同じ人。11-3 §2.2）。タブの振り分け・勤続・分析は画面で行う
// （参照元どおり）。入社日・退職日・基準日はすべて暦日 YYYY-MM-DD の文字列で扱い、時間帯の変換をしない（11-3 §2.17）。
// 基準日（today）は GET /api/v1/admin/employment の today（データをサーバで読んだ時刻の Asia/Tokyo の日付。11-3 §3.3）。
// 人の分類（表の行の並びの同点の順）はマップの順（CHARACTER_CELLS。11-3 §2.4）で、00 §1.6 の sort_order は使わない
import { EMPLOYMENT_SCREEN_TEXTS } from "./classification-texts";
import {
  CHARACTER_CELLS,
  percentOf,
  teamLabelOf,
  type ClassifiablePerson,
  type TeamFilter,
} from "./classification-view";
import type { EmploymentStatus } from "./employment";
import type { AptitudeTypeKey } from "@/lib/scoring/types";

/** 在籍・退職のタブ（§2.13）。an = 分析、stay = 在籍者、left = 退職者、seek = 求職者 */
export type EmploymentTab = "an" | "stay" | "left" | "seek";

/** タブの並び（§2.13。分析・在籍者・退職者・求職者） */
export const EMPLOYMENT_TABS: readonly EmploymentTab[] = Object.freeze([
  "an",
  "stay",
  "left",
  "seek",
]);

/** 在籍・退職の人の値（EmploymentPersonDto の一部。組織内分類の人の値に氏名・入社日・退職日を足したもの） */
export interface EmploymentCarrier extends ClassifiablePerson {
  readonly name: string;
  readonly hiredOn: string | null; // 入社日 YYYY-MM-DD
  readonly leftOn: string | null; // 退職日 YYYY-MM-DD
}

/** 分析の表の 1 行（§2.16 の 4） */
export interface RetentionRow {
  readonly aptitudeType: AptitudeTypeKey;
  readonly stayCount: number;
  readonly leftCount: number;
  readonly ratio: number; // 退職 ÷ (在籍 + 退職)。丸める前（並びに使う）
  readonly percent: number; // Math.round(ratio × 100)
  readonly isReference: boolean; // 在籍 + 退職 < 3（「参考」を付ける）
  readonly leftTenureAverage: number | null; // そのタイプの退職した人の勤続の平均（月。平均に入る人がいなければ null）
  readonly stayTenureAverage: number | null; // そのタイプの在籍中の人の勤続の平均（月）
}

/** 分析の値（§2.16） */
export interface RetentionAnalysis {
  readonly leftCount: number;
  readonly stayCount: number;
  readonly leftRatePercent: number; // 退職 ÷ (在籍 + 退職) の %（整数。分母に求職者を入れない。在籍 + 退職が 0 なら 0）
  readonly leftTenure: { readonly average: number | null; readonly count: number }; // 平均と、平均に入った人数
  readonly stayTenure: { readonly average: number | null; readonly count: number };
  readonly missingHireCount: number; // 入社日の未入力
  readonly missingLeaveCount: number; // 入社日はあり、退職した人で退職日の未入力
  /** 注意書き（退職 0 人と 1〜2 人。3 人以上は null） */
  readonly note:
    { readonly kind: "no_left" } | { readonly kind: "few_left"; readonly count: number } | null;
  readonly rows: readonly RetentionRow[]; // §2.16 の並び
}

const TEXTS = EMPLOYMENT_SCREEN_TEXTS;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** マップの順（表の並びの最後の同点の順。§2.4・§2.16） */
const MAP_ORDER: ReadonlyMap<AptitudeTypeKey, number> = new Map(
  CHARACTER_CELLS.map((cell, index) => [cell.type, index]),
);

/**
 * 満了の月数（§2.17）。(終点の年 − 入社の年) × 12 + (終点の月 − 入社の月) − (終点の日 < 入社の日 なら 1、そうでなければ 0)。
 * 終点 < 入社日（YYYY-MM-DD の文字列の比較）か、どちらかの形が YYYY-MM-DD でなければ null
 */
export function completedMonths(fromYmd: string, toYmd: string): number | null {
  const from = CALENDAR_DATE_PATTERN.exec(fromYmd);
  const to = CALENDAR_DATE_PATTERN.exec(toYmd);
  if (from === null || to === null || toYmd < fromYmd) return null;
  const [fy, fm, fd] = [Number(from[1]), Number(from[2]), Number(from[3])];
  const [ty, tm, td] = [Number(to[1]), Number(to[2]), Number(to[3])];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** 勤続の表示（§2.17）。null は「—」、12 未満は「{n}か月」、12 以上は「{n ÷ 12 の整数部}年」に、余りが 1 以上なら「{余り}か月」を続ける */
export function formatTenure(months: number | null): string {
  if (months === null) return TEXTS.tenure.none;
  if (months < 12) return TEXTS.tenure.months(months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest >= 1
    ? `${TEXTS.tenure.years(years)}${TEXTS.tenure.months(rest)}`
    : TEXTS.tenure.years(years);
}

/** 勤続の平均（§2.17）。Math.round(合計 ÷ 人数)（月の整数。.5 は切り上げ）。人数 0 は null */
export function averageMonths(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** 勤続の終点（§2.17）。退職した人は退職日（無ければ null）、在籍・求職者は基準日（求職者も基準日まで。参照元どおり） */
function tenureEnd(person: EmploymentCarrier, todayYmd: string): string | null {
  return person.employmentStatus === "left" ? person.leftOn : todayYmd;
}

/**
 * 一覧の勤続の月数（§2.14・§2.17）。退職は退職日まで、在籍・求職者は基準日まで。入社日なし・退職した人の退職日なし・
 * 終点が入社日より前（入社日が基準日より後を含む）は null
 */
export function tenureMonths(person: EmploymentCarrier, todayYmd: string): number | null {
  if (person.hiredOn === null) return null;
  const end = tenureEnd(person, todayYmd);
  if (end === null) return null;
  return completedMonths(person.hiredOn, end);
}

/** 区分のタブ（§2.13）。在籍 → 在籍者、退職 → 退職者、求職者 → 求職者 */
export function tabOf(status: EmploymentStatus): Exclude<EmploymentTab, "an"> {
  switch (status) {
    case "employed":
      return "stay";
    case "left":
      return "left";
    case "candidate":
      return "seek";
  }
}

/** タブの数（§2.13。チームで絞った後の人を渡す） */
export function tabCounts(
  people: readonly ClassifiablePerson[],
): Readonly<Record<Exclude<EmploymentTab, "an">, number>> {
  const counts = { stay: 0, left: 0, seek: 0 };
  for (const person of people) counts[tabOf(person.employmentStatus)] += 1;
  return counts;
}

/**
 * 一覧の並び（§2.14）。勤続の長い順（同じ勤続は元の順 = 代表の受験日時の新しい順）。勤続が出ない人（入社日なし・退職日なし・
 * 終点が入社日より前）は後ろで、その中はお名前の日本語順（localeCompare(…, "ja")。同じなら元の順）。渡した配列を変えない
 */
export function sortForTab<P extends EmploymentCarrier>(
  people: readonly P[],
  todayYmd: string,
): readonly P[] {
  return people
    .map((person, index) => ({ person, index, months: tenureMonths(person, todayYmd) }))
    .sort((a, b) => {
      if (a.months !== null && b.months !== null) {
        return b.months - a.months || a.index - b.index;
      }
      if (a.months !== null) return -1;
      if (b.months !== null) return 1;
      return a.person.name.localeCompare(b.person.name, "ja") || a.index - b.index;
    })
    .map(({ person }) => person);
}

/** タイプごと・全体の数え上げ（analyzeRetention の途中の値） */
interface Tally {
  stay: number;
  left: number;
  readonly stayMonths: number[];
  readonly leftMonths: number[];
}

const emptyTally = (): Tally => ({ stay: 0, left: 0, stayMonths: [], leftMonths: [] });

/**
 * 分析「辞めやすいタイプと勤続年数」（§2.16）。対象は区分が在籍・退職の人だけ（求職者は関数の中で除く）。人を 1 人ずつ見て、
 * 退職なら退職、在籍なら在籍の人数（全体とタイプ）に 1 を足す。入社日が無い人は入社日の未入力、入社日はあるが退職した人で
 * 退職日が無い人は退職日の未入力に数え、どちらも平均に入れない。終点（退職日、在籍中は基準日）が入社日より前の人は、
 * 未入力にも平均にも入れない（人数には入る）。それ以外は満了の月数を、退職なら退職の平均、在籍なら在籍中の平均に入れる。
 * 表の行は在籍 + 退職が 1 人以上のタイプだけで、退職の割合（丸める前）の高い順 → 退職の人数の多い順 → 在籍 + 退職の多い順 →
 * マップの順に並べる
 */
export function analyzeRetention(
  people: readonly EmploymentCarrier[],
  todayYmd: string,
): RetentionAnalysis {
  const total = emptyTally();
  const byType = new Map<AptitudeTypeKey, Tally>();
  let missingHireCount = 0;
  let missingLeaveCount = 0;
  for (const person of people) {
    if (person.employmentStatus === "candidate") continue;
    const isLeft = person.employmentStatus === "left";
    let tally = byType.get(person.aptitudeType);
    if (tally === undefined) {
      tally = emptyTally();
      byType.set(person.aptitudeType, tally);
    }
    for (const t of [total, tally]) {
      if (isLeft) t.left += 1;
      else t.stay += 1;
    }
    if (person.hiredOn === null) {
      missingHireCount += 1;
      continue;
    }
    const end = tenureEnd(person, todayYmd);
    if (end === null) {
      missingLeaveCount += 1;
      continue;
    }
    const months = completedMonths(person.hiredOn, end);
    if (months === null) continue; // 終点が入社日より前（未入力にも平均にも入れない）
    for (const t of [total, tally]) {
      if (isLeft) t.leftMonths.push(months);
      else t.stayMonths.push(months);
    }
  }

  const rows: RetentionRow[] = [];
  for (const [aptitudeType, tally] of byType) {
    const count = tally.stay + tally.left;
    const ratio = tally.left / count;
    rows.push({
      aptitudeType,
      stayCount: tally.stay,
      leftCount: tally.left,
      ratio,
      percent: Math.round(ratio * 100),
      isReference: count < 3,
      leftTenureAverage: averageMonths(tally.leftMonths),
      stayTenureAverage: averageMonths(tally.stayMonths),
    });
  }
  rows.sort(
    (a, b) =>
      b.ratio - a.ratio ||
      b.leftCount - a.leftCount ||
      b.stayCount + b.leftCount - (a.stayCount + a.leftCount) ||
      (MAP_ORDER.get(a.aptitudeType) ?? 0) - (MAP_ORDER.get(b.aptitudeType) ?? 0),
  );

  return {
    leftCount: total.left,
    stayCount: total.stay,
    leftRatePercent: percentOf(total.left, total.stay + total.left),
    leftTenure: { average: averageMonths(total.leftMonths), count: total.leftMonths.length },
    stayTenure: { average: averageMonths(total.stayMonths), count: total.stayMonths.length },
    missingHireCount,
    missingLeaveCount,
    note:
      total.left === 0
        ? { kind: "no_left" }
        : total.left <= 2
          ? { kind: "few_left", count: total.left }
          : null,
    rows,
  };
}

/** 分析の説明の先頭（§2.16 の 1・§2.18）。チームで絞っていなければ ""、絞っていれば「Aチームの」「未設定の」 */
export function analysisTeamPrefix(team: TeamFilter): string {
  return team === "" ? "" : TEXTS.analysis.teamPrefix(teamLabelOf(team));
}
