// 回答一覧の表示の規則（11-2 §2.2・§2.5〜§2.9・§2.12・§2.19・§2.21・§3.11）。画面（ResultsView と components/admin/results/）が使う
// 純関数で、React・window・Firebase に触れない。行は GET /api/v1/admin/results の ResultListRowDto（値は代表の受験とその受検者。
// exams はつながりの順で exams[0] が代表）。「受験から1年以上」と「今月」の基準時刻 now は、呼ぶ側が new Date(generatedAt) を渡す
import { TEAM_CODES } from "./comparison-scope-params";
import {
  effectiveStaffRole,
  STAFF_ROLE_LABELS,
  type EmploymentStatus,
  type StaffRole,
} from "./employment";
import { formatCalendarDate, formatYmd } from "./format-datetime";
import { RESULT_LIST_TEXTS } from "./result-list-texts";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { getOccupationLabel } from "@/lib/masters/occupations";
import type { AptitudeTypeKey, SocialStyleKey, TeamCode } from "@/lib/scoring/types";
import type { ResultListRowDto } from "@/lib/services/dto/admin";
import { addOneYearInTokyo } from "@/lib/utils/tokyo-time";

/** 区分タブ（§2.6）。cand = 求職者、exec = 在籍、left = 退職、old = 受験から1年以上 */
export type ListSegment = "all" | "cand" | "exec" | "left" | "old";
/** 並び順（§2.7）。new = 受験日が新しい順、old = 古い順、name = 氏名順、due = 1年以上たった人を先に */
export type ListSort = "new" | "old" | "name" | "due";
/** 絞り込みの状態（§2.21 で sessionStorage に保存する 4 項目。表示の上限は持たない） */
export interface ListFilterState {
  readonly seg: ListSegment;
  readonly q: string;
  readonly team: "" | "none" | TeamCode;
  readonly sort: ListSort;
}
/** 0 件の表示の種類（§2.19 の 1〜5） */
export type EmptyStateKind = "no_match" | "no_employed" | "no_candidate" | "no_left" | "no_results";

export const DEFAULT_LIST_FILTER: ListFilterState = Object.freeze({
  seg: "all",
  q: "",
  team: "",
  sort: "new",
});
/** 表示の上限の最初の値と、「さらに表示」で増やす数（§2.8） */
export const LIST_PAGE_STEP = 100;
/** 絞り込みの状態を保存する sessionStorage のキー（§2.21） */
export const LIST_FILTER_STORAGE_KEY = "ad-filter";
/** 最後の入力から検索語を当てて保存するまでの時間（§2.7） */
export const SEARCH_DEBOUNCE_MS = 150;

/** 集計カード（§2.5）と区分タブの数（§2.6）。すべて絞り込みの前の全行で数える */
export interface ListStats {
  readonly rowCount: number; // 受験した人・「すべて」のタブ
  readonly examCount: number; // つながりの件数の合計（受験は延べ n 回）
  readonly candidateRows: number; // 代表の区分が求職者（受講者 n・「求職者」のタブ）
  readonly employedRows: number; // 代表の区分が在籍（既存スタッフ n・「在籍」のタブ）
  readonly leftRows: number; // 代表の区分が退職（「退職」のタブ。カード 1 番の下には数えない）
  readonly thisMonthExams: number; // 全受験のうち今月（Asia/Tokyo）
  readonly lastMonthExams: number; // 全受験のうち先月
  readonly oneYearRows: number; // 代表が受験から1年以上（カード 3 番・「受験から1年以上」のタブ）
  readonly longitudinalReports: number; // 全受験のうち経年比較あり（カード 4 番）
  readonly multiExamRows: number; // つながりが 2 件以上（2回以上受験した人）
}

/** 氏名の下に並べるチップ（§2.9 の順）と、最後の小さい文字 meta（「{職業} ・ {電話番号}」。§2.8） */
export type ListChip =
  | { readonly kind: "role"; readonly role: "manager" | "leader"; readonly label: string }
  | { readonly kind: "status"; readonly status: EmploymentStatus; readonly label: string }
  | { readonly kind: "hired"; readonly label: string }
  | { readonly kind: "left"; readonly label: string }
  | { readonly kind: "nth"; readonly label: string }
  | { readonly kind: "longitudinal"; readonly label: string }
  | { readonly kind: "one_year"; readonly label: string }
  | { readonly kind: "meta"; readonly label: string };

/** ⋮メニューの中身（§2.12） */
export interface RowMenuModel {
  /** 以前の受験（前回から順にさかのぼる。k は前回が n−1、最も古い受験が 1。dateLabel は Y/M/D） */
  readonly previous: readonly {
    readonly k: number;
    readonly resultId: string;
    readonly dateLabel: string;
  }[];
  readonly currentStatus: EmploymentStatus; // 「現在の区分」を付ける項目
  readonly currentRole: StaffRole | null; // 「現在の役職」を付ける項目（表示上の役職。K-32 ⑤）。null はどれにも付けない
  readonly deleteNote: string | null; // 「この受験を削除」の右端の「{Y/M/D}の分」（つながりが 2 件以上のときだけ）
}

/** Asia/Tokyo は UTC+9 で固定（lib/utils/tokyo-time.ts と同じ扱い） */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
/** メニューを画面の端から離す幅と、押したボタン・チップとメニューの間（§2.12） */
const MENU_VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
/** 「{職業} ・ {電話番号}」に電話番号を出す、数字のけた数の下限（§2.8） */
const MIN_PHONE_DIGITS = 6;

const SEGMENT_STATUS: Readonly<Partial<Record<ListSegment, EmploymentStatus>>> = {
  cand: "candidate",
  exec: "employed",
  left: "left",
};
const LIST_SEGMENTS: readonly ListSegment[] = ["all", "cand", "exec", "left", "old"];
const LIST_SORTS: readonly ListSort[] = ["new", "old", "name", "due"];

/** 氏名順の比べ方（a.localeCompare(b, "ja") と同じ。並べるたびに作らない） */
const NAME_COLLATOR = new Intl.Collator("ja");

/** タイプの点の色（参照元の ad-app の分け方。所属分類は 00 §1.6。§2.8） */
const TYPE_DOT_COLORS: Readonly<Record<SocialStyleKey, string>> = {
  analytical: "#3FA57A",
  driving: "#9B72AA",
  amiable: "#3F8DA5",
  expressive: "#D9A13B",
};
const UNKNOWN_TYPE_DOT_COLOR = "#AEB7C1";
const TYPE_BY_KEY = new Map(APTITUDE_TYPE_DEFINITIONS.map((d) => [d.key, d]));
const STYLE_BY_KEY = new Map(SOCIAL_STYLE_DEFINITIONS.map((d) => [d.key, d]));

/** 検索の正規化（§2.7）。小文字にし、空白（全角を含む空白文字すべて）と「-」「‐」「ー」「－」を取り除く */
export function normalizeSearchText(s: string): string {
  return s.toLowerCase().replace(/[\s\u002D\u2010\u30FC\uFF0D]/g, "");
}

/**
 * 受験から1年以上（§2.9 の 7）。受験日時に Asia/Tokyo で 1 年を足した日時が now 以前（≤。1 年後の時刻ちょうどを含む）。
 * 結果詳細の 1 年経過の帯（11-6 の isOneYearPassed）は「<」で、境目は関数の名前で分ける（11 総論 8.3 の 2）
 */
export function isOneYearOrMorePassed(submittedAtIso: string, now: Date): boolean {
  return addOneYearInTokyo(new Date(submittedAtIso)).getTime() <= now.getTime();
}

/** at の月から monthOffset か月ずらした月の 1 日 0:00（Asia/Tokyo）の時刻（ミリ秒） */
function startOfTokyoMonth(at: Date, monthOffset: number): number {
  const tokyo = new Date(at.getTime() + TOKYO_OFFSET_MS);
  return Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + monthOffset, 1) - TOKYO_OFFSET_MS;
}

/**
 * 集計カード 4 枚（§2.5）と区分タブの数（§2.6）。人数は行の数、回数・件数は受験の数。
 * 今月 = submittedAt が now の月の 1 日 0:00（Asia/Tokyo）以降、先月 = そうでなく前の月の 1 日 0:00 以降
 */
export function computeListStats(rows: readonly ResultListRowDto[], now: Date): ListStats {
  const thisMonthStart = startOfTokyoMonth(now, 0);
  const lastMonthStart = startOfTokyoMonth(now, -1);
  let examCount = 0;
  let candidateRows = 0;
  let employedRows = 0;
  let leftRows = 0;
  let thisMonthExams = 0;
  let lastMonthExams = 0;
  let oneYearRows = 0;
  let longitudinalReports = 0;
  let multiExamRows = 0;
  for (const row of rows) {
    if (row.employmentStatus === "candidate") candidateRows += 1;
    else if (row.employmentStatus === "employed") employedRows += 1;
    else leftRows += 1;
    if (isOneYearOrMorePassed(row.submittedAt, now)) oneYearRows += 1;
    if (row.exams.length >= 2) multiExamRows += 1;
    for (const exam of row.exams) {
      examCount += 1;
      const at = Date.parse(exam.submittedAt);
      if (at >= thisMonthStart) thisMonthExams += 1;
      else if (at >= lastMonthStart) lastMonthExams += 1;
      if (exam.hasLongitudinalReport) longitudinalReports += 1;
    }
  }
  return {
    rowCount: rows.length,
    examCount,
    candidateRows,
    employedRows,
    leftRows,
    thisMonthExams,
    lastMonthExams,
    oneYearRows,
    longitudinalReports,
    multiExamRows,
  };
}

function compareResultId(a: ResultListRowDto, b: ResultListRowDto): number {
  return a.resultId < b.resultId ? -1 : a.resultId > b.resultId ? 1 : 0;
}

/**
 * 表示対象の行（§2.6・§2.7）。区分 → チーム → 検索語の順に、代表の値で絞って並べる（表示の上限で切るのは呼ぶ側）。
 * 並び順: new = 代表の submittedAt の降順、old = 昇順、name = 氏名（ja）で同じなら新しい順、
 * due = 受験から1年以上の行を先に、各群は古い順。どれも最後は resultId の昇順
 */
export function filterAndSortRows(
  rows: readonly ResultListRowDto[],
  state: ListFilterState,
  now: Date,
): readonly ResultListRowDto[] {
  const segmentStatus = SEGMENT_STATUS[state.seg];
  const query = normalizeSearchText(state.q);
  const picked = rows
    .filter((row) => {
      if (state.seg === "old") return isOneYearOrMorePassed(row.submittedAt, now);
      return segmentStatus === undefined || row.employmentStatus === segmentStatus;
    })
    .filter((row) => {
      if (state.team === "") return true;
      return state.team === "none" ? row.teamCode === null : row.teamCode === state.team;
    })
    .filter(
      (row) =>
        query === "" ||
        normalizeSearchText(row.name).includes(query) ||
        normalizeSearchText(row.phoneNumber).includes(query),
    )
    .map((row) => ({
      row,
      at: Date.parse(row.submittedAt),
      oneYear: state.sort === "due" && isOneYearOrMorePassed(row.submittedAt, now),
    }));
  type Keyed = (typeof picked)[number];
  const byOrder = (a: Keyed, b: Keyed): number => {
    switch (state.sort) {
      case "new":
        return b.at - a.at;
      case "old":
        return a.at - b.at;
      case "name":
        return NAME_COLLATOR.compare(a.row.name, b.row.name) || b.at - a.at;
      case "due":
        return Number(b.oneYear) - Number(a.oneYear) || a.at - b.at;
    }
  };
  return picked
    .sort((a, b) => byOrder(a, b) || compareResultId(a.row, b.row))
    .map((keyed) => keyed.row);
}

/** チームで絞り込むの選択肢（§2.7）。全行の代表のチームに使われているチームだけを A→Z の順に */
export function usedTeamCodes(rows: readonly ResultListRowDto[]): readonly TeamCode[] {
  const used = new Set(rows.map((row) => row.teamCode));
  return TEAM_CODES.filter((code) => used.has(code));
}

/** 「絞り込みを解除」を出すか（§2.7）。検索語（正規化する前の値。空白だけでも真）・チーム・受験から1年以上のどれか */
export function hasActiveFilters(state: ListFilterState): boolean {
  return state.q !== "" || state.team !== "" || state.seg === "old";
}

/** 絞り込みを解除（§2.7、K-32 ④）。検索語とチームを空にし、受験から1年以上は「すべて」に。ほかの区分と並び順は保つ */
export function clearFilters(state: ListFilterState): ListFilterState {
  return { ...state, q: "", team: "", seg: state.seg === "old" ? "all" : state.seg };
}

/** 「{職業} ・ {電話番号}」（§2.8）。職業は未知のコードなら無し、電話番号は数字が 6 けた以上のときだけ。どちらも無ければ null */
function rowMeta(row: ResultListRowDto): string | null {
  let occupation: string | null;
  try {
    occupation = getOccupationLabel(row.occupationCode);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    occupation = null;
  }
  const digits = row.phoneNumber.match(/[0-9]/g)?.length ?? 0;
  const phone = digits >= MIN_PHONE_DIGITS ? row.phoneNumber : null;
  const parts = [occupation, phone].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(RESULT_LIST_TEXTS.chips.metaSeparator);
}

/**
 * 氏名の下のチップ（§2.9 の順と条件）と、最後の meta。役職の札は表示上の役職が責任者・幹部のときだけ、区分は常に、
 * 入社日はあるとき、退職日は区分が退職のときだけ、{n}回目はつながりが 2 件以上、経年比較あり・受験から1年以上は代表の受験
 */
export function rowChips(row: ResultListRowDto, now: Date): readonly ListChip[] {
  const texts = RESULT_LIST_TEXTS.chips;
  const chips: ListChip[] = [];
  const role = effectiveStaffRole(row.staffRole, row.occupationCode);
  if (role === "manager" || role === "leader") {
    chips.push({ kind: "role", role, label: STAFF_ROLE_LABELS[role] });
  }
  chips.push({
    kind: "status",
    status: row.employmentStatus,
    label: texts.status(row.employmentStatus),
  });
  if (row.hiredOn !== null) {
    chips.push({ kind: "hired", label: texts.hired(formatCalendarDate(row.hiredOn)) });
  }
  if (row.employmentStatus === "left" && row.leftOn !== null) {
    chips.push({ kind: "left", label: texts.left(formatCalendarDate(row.leftOn)) });
  }
  if (row.exams.length >= 2) chips.push({ kind: "nth", label: texts.nth(row.exams.length) });
  if (row.exams[0]?.hasLongitudinalReport === true) {
    chips.push({ kind: "longitudinal", label: texts.longitudinal });
  }
  if (isOneYearOrMorePassed(row.submittedAt, now)) {
    chips.push({ kind: "one_year", label: texts.oneYear });
  }
  const meta = rowMeta(row);
  if (meta !== null) chips.push({ kind: "meta", label: meta });
  return chips;
}

/** ⋮メニューの中身（§2.12）。「現在の役職」は表示上の役職（保存なし・職業 10 は責任者。K-32 ⑤） */
export function rowMenuModel(row: ResultListRowDto): RowMenuModel {
  const n = row.exams.length;
  return {
    previous: row.exams.slice(1).map((exam, i) => ({
      k: n - 1 - i,
      resultId: exam.resultId,
      dateLabel: formatYmd(exam.submittedAt),
    })),
    currentStatus: row.employmentStatus,
    currentRole: effectiveStaffRole(row.staffRole, row.occupationCode),
    deleteNote: n >= 2 ? RESULT_LIST_TEXTS.menu.deleteNote(formatYmd(row.submittedAt)) : null,
  };
}

/** 表示対象が 0 行のときの表示の種類（§2.19 の 1〜5 の判定の順。K-32 ⑥） */
export function emptyStateKind(state: ListFilterState): EmptyStateKind {
  if (hasActiveFilters(state)) return "no_match";
  switch (state.seg) {
    case "exec":
      return "no_employed";
    case "cand":
      return "no_candidate";
    case "left":
      return "no_left";
    default:
      return "no_results";
  }
}

function isListSegment(value: unknown): value is ListSegment {
  return typeof value === "string" && (LIST_SEGMENTS as readonly string[]).includes(value);
}
function isListSort(value: unknown): value is ListSort {
  return typeof value === "string" && (LIST_SORTS as readonly string[]).includes(value);
}
function isTeamFilter(value: unknown): value is ListFilterState["team"] {
  return (
    value === "" ||
    value === "none" ||
    (typeof value === "string" && (TEAM_CODES as readonly string[]).includes(value))
  );
}

/**
 * sessionStorage の ad-filter の値から絞り込みの状態を戻す（§2.21）。読めない値・オブジェクトでない値は既定、
 * 項目ごとに決まった値でないものだけを既定にする（seg = all・cand・exec・left・old、q = 文字列、team = 空・none・A〜Z、
 * sort = new・old・name・due）。表示の上限は戻さない
 */
export function parseStoredFilter(raw: string | null): ListFilterState {
  if (raw === null) return DEFAULT_LIST_FILTER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_LIST_FILTER;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_LIST_FILTER;
  }
  const stored = parsed as Readonly<Record<string, unknown>>;
  return {
    seg: isListSegment(stored.seg) ? stored.seg : DEFAULT_LIST_FILTER.seg,
    q: typeof stored.q === "string" ? stored.q : DEFAULT_LIST_FILTER.q,
    team: isTeamFilter(stored.team) ? stored.team : DEFAULT_LIST_FILTER.team,
    sort: isListSort(stored.sort) ? stored.sort : DEFAULT_LIST_FILTER.sort,
  };
}

/**
 * タイプの点の色と title（§2.8）。色はタイプのマスタの所属分類（results.socialStyle ではない）から決め、title は
 * 「{英語名}（{日本語名}）」。タイプが無い・未知のキーは #AEB7C1 で title なし
 */
export function typeDot(aptitudeType: AptitudeTypeKey | null): {
  readonly color: string;
  readonly title: string | null;
} {
  const definition = aptitudeType === null ? undefined : TYPE_BY_KEY.get(aptitudeType);
  const style = definition === undefined ? undefined : STYLE_BY_KEY.get(definition.socialStyle);
  if (definition === undefined || style === undefined) {
    return { color: UNKNOWN_TYPE_DOT_COLOR, title: null };
  }
  return { color: TYPE_DOT_COLORS[style.key], title: `${style.labelEn}（${style.labelJa}）` };
}

/**
 * 区分メニューの位置（§2.12。K-43）。chip はチップの矩形、menuHeight はメニューの高さ、viewportHeight は画面の高さ（px）。
 * 左 = max(8, チップの左端)、上 = チップの下端 + 6（下向き）。上 + h が 画面の高さ − 8 を超えるなら
 * 上 = max(8, チップの上端 − h − 6)（上向き。上にも入りきらなければ 8）。左は向きにかかわらず参照元どおり
 */
export function employmentMenuPosition(
  chip: { readonly left: number; readonly top: number; readonly bottom: number },
  menuHeight: number,
  viewportHeight: number,
): { readonly left: number; readonly top: number } {
  return {
    left: Math.max(MENU_VIEWPORT_MARGIN, chip.left),
    top: verticalMenuTop(chip, menuHeight, viewportHeight),
  };
}

/**
 * ⋮メニューとリンクのメニューの位置（§2.12）。button は押したボタンの矩形、menuWidth・menuHeight はメニューの大きさ、
 * viewportWidth・viewportHeight は画面の大きさ（px）。左 = min(max(8, ボタンの右端 − w), 画面の幅 − w − 8)、
 * 上 = ボタンの下端 + 6。上 + h が 画面の高さ − 8 を超えるなら 上 = max(8, ボタンの上端 − h − 6)（ボタンの上に出す）
 */
export function popupMenuPosition(
  button: { readonly top: number; readonly bottom: number; readonly right: number },
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { readonly left: number; readonly top: number } {
  return {
    left: Math.min(
      Math.max(MENU_VIEWPORT_MARGIN, button.right - menuWidth),
      viewportWidth - menuWidth - MENU_VIEWPORT_MARGIN,
    ),
    top: verticalMenuTop(button, menuHeight, viewportHeight),
  };
}

/** 下向きに入りきらなければ上向きにする、メニューの上端（§2.12 の 2 つの位置の式で共通） */
function verticalMenuTop(
  anchor: { readonly top: number; readonly bottom: number },
  menuHeight: number,
  viewportHeight: number,
): number {
  const below = anchor.bottom + MENU_GAP;
  if (below + menuHeight <= viewportHeight - MENU_VIEWPORT_MARGIN) return below;
  return Math.max(MENU_VIEWPORT_MARGIN, anchor.top - menuHeight - MENU_GAP);
}
