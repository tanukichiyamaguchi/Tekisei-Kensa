// 区分・入社日・退職日・役職の判定と表示（11-2 §2.3・§2.13・§2.14・§3.1・§3.11、11-3 §2.15・§3.7）。画面とサーバの両方で使う純関数のファイル。
// firebase-admin と lib/db の実行時コードを読まない（lib/db/schemas/values.ts の calendarDateSchema が
// この判定を使い、画面からは values.ts を読めないため、日付の判定はここの 1 か所に置く。11 総論 8.3 の 4）。
// 役職から決まる受検者区分は、役職の変更の書き込み（updatePersonAttributes）だけが使うので lib/db/employment-status.ts の
// respondentKindForStaffRole に置き、ここには写さない（11-2 §3.2）
import type { EmploymentStatus, StaffRole } from "@/lib/db/types";
import { MANAGER_OCCUPATION_CODE } from "@/lib/masters/occupations";

// 部品（components/**）は lib/db を型でも import できない（01 §3.5 第 2 群）ので、区分と役職の型はここから使う
export type { EmploymentStatus, StaffRole };

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_CALENDAR_DATE = "1900-01-01";
const MAX_CALENDAR_DATE = "2100-12-31";
/** Asia/Tokyo は UTC+9 で固定（夏時間が無い。lib/utils/tokyo-time.ts・lib/services/rate-limit.ts と同じ扱い） */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 区分の表示名（11-2 §2.3）。区分タブ・区分チップ・メニュー・通知で使う */
export const EMPLOYMENT_STATUS_LABELS: Readonly<Record<EmploymentStatus, string>> = {
  candidate: "求職者",
  employed: "在籍",
  left: "退職",
};

/** 役職の表示名（11-2 §2.3）。役職の札・メニュー・通知で使う */
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  manager: "責任者", // 参照元: 院長（K-19）
  leader: "幹部",
  staff: "スタッフ",
};

/** 区分・入社日（YYYY-MM-DD）・退職日（YYYY-MM-DD）の 3 つ組（PATCH の employment と同じ形。11-2 §3.6） */
export interface Employment {
  readonly status: EmploymentStatus;
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
}

/** YYYY-MM-DD（数字 4 桁-2 桁-2 桁）が実在する日で、1900-01-01〜2100-12-31 の範囲にあるか（11-2 §3.1） */
export function isValidCalendarDate(s: string): boolean {
  const m = CALENDAR_DATE_PATTERN.exec(s);
  if (!m) return false;
  // 同じ形の文字列どうしなので、辞書順の比較が日付の前後と一致する
  if (s < MIN_CALENDAR_DATE || s > MAX_CALENDAR_DATE) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * 表示上の役職（11-2 §2.3）。役職が保存されていればその値、未設定で職業コードが 10（責任者。K-21）なら manager、
 * それ以外は null（札を出さない）。役職の札・「現在の役職」の印（K-32 ⑤）と、11-6 の AI 解説の出し分けが使う
 */
export function effectiveStaffRole(
  staffRole: StaffRole | null,
  occupationCode: number,
): StaffRole | null {
  if (staffRole !== null) return staffRole;
  return occupationCode === MANAGER_OCCUPATION_CODE ? "manager" : null;
}

/**
 * now の Asia/Tokyo の暦日 YYYY-MM-DD（区分を退職にしたときの退職日の既定。11-2 §2.13・11-3 §2.15。在籍・退職の勤続の基準日。
 * 11-3 §3.3）。実行環境の時間帯（TZ）に左右されない
 */
export function todayInTokyo(now: Date): string {
  const tokyo = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const year = String(tokyo.getUTCFullYear()).padStart(4, "0");
  const month = String(tokyo.getUTCMonth() + 1).padStart(2, "0");
  const day = String(tokyo.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 区分メニュー（⋮メニューの「区分を変える」も同じ。11-2 §2.13）で選んだ区分の書き込みの値。同じ区分なら null（何もしない）。
 * 入社日は保つ。退職日は、退職なら今の退職日があればそれ、無ければ todayIso（操作した時点の Asia/Tokyo の日付）、
 * 求職者・在籍なら空（区分が退職でない受験に退職日だけが入った状態を作らない）
 */
export function employmentFromMenu(
  current: Employment,
  chosen: EmploymentStatus,
  todayIso: string,
): Employment | null {
  if (chosen === current.status) return null;
  if (chosen === "left") {
    return { status: "left", hiredOn: current.hiredOn, leftOn: current.leftOn ?? todayIso };
  }
  return { status: chosen, hiredOn: current.hiredOn, leftOn: null };
}

/**
 * 入社日・退職日のダイアログ（11-2 §2.14）の保存の値。空の欄は null で渡す。
 * 両方あり 退職日 < 入社日（YYYY-MM-DD の文字列の比較。同じ日は可）なら left_before_hired（ダイアログを閉じない）。
 * 区分は、退職日があれば退職、退職日が無く入社日があり今の区分が求職者なら在籍、それ以外は今の区分のまま
 * （退職で退職日を空にしても退職）。値が変わらなくても ok を返す（送って通知を出す。参照元どおり）
 */
export function employmentFromDates(
  current: Employment,
  hiredOn: string | null,
  leftOn: string | null,
):
  | { readonly ok: true; readonly value: Employment }
  | { readonly ok: false; readonly reason: "left_before_hired" } {
  if (hiredOn !== null && leftOn !== null && leftOn < hiredOn) {
    return { ok: false, reason: "left_before_hired" };
  }
  const status: EmploymentStatus =
    leftOn !== null
      ? "left"
      : hiredOn !== null && current.status === "candidate"
        ? "employed"
        : current.status;
  return { ok: true, value: { status, hiredOn, leftOn } };
}

/**
 * 在籍・退職の「変更」ダイアログ（11-3 §2.15 の保存する 1〜4）の保存の値。入社日・退職日は日付の入力欄の値（空は ""）。
 * 1. 入社日は空なら null、それ以外は入力値（区分が求職者でも残す）。
 * 2. 退職日は、区分が退職なら入力値（空なら todayIso。保存する時点の Asia/Tokyo の日付）、退職でなければ null（欄の値は見ない）。
 * 3. 入社日・退職日のうち値のあるものが isValidCalendarDate で偽（1900-01-01〜2100-12-31 の実在する日でない。サーバの
 *    calendarDateSchema と同じ判定）なら invalid_date（参照元に無い検査。11-3 §1.4 の 14）。
 * 4. 両方あり 退職日 < 入社日（YYYY-MM-DD の文字列の比較。同じ日は可）なら left_before_hired。
 * 3 を 4 より先に判定する（§2.15 の順）。値が変わらなくても ok を返す（送る。参照元どおり）。
 * 回答一覧の employmentFromDates（11-2 §2.14。退職日を入れると区分が退職になる）とは規則が違う（どちらも参照元どおり）
 */
export function employmentFromEditDialog(input: {
  readonly status: EmploymentStatus;
  readonly hiredOn: string; // 入力値。空は ""
  readonly leftOn: string; // 入力値。区分が退職のときだけ使う
  readonly todayIso: string; // 保存する時点の Asia/Tokyo の日付（todayInTokyo）
}):
  | { readonly ok: true; readonly value: Employment }
  | { readonly ok: false; readonly reason: "invalid_date" | "left_before_hired" } {
  // 1.
  const hiredOn = input.hiredOn === "" ? null : input.hiredOn;
  // 2.
  const leftOn =
    input.status === "left" ? (input.leftOn === "" ? input.todayIso : input.leftOn) : null;
  // 3.
  if (
    (hiredOn !== null && !isValidCalendarDate(hiredOn)) ||
    (leftOn !== null && !isValidCalendarDate(leftOn))
  ) {
    return { ok: false, reason: "invalid_date" };
  }
  // 4.
  if (hiredOn !== null && leftOn !== null && leftOn < hiredOn) {
    return { ok: false, reason: "left_before_hired" };
  }
  return { ok: true, value: { status: input.status, hiredOn, leftOn } };
}
