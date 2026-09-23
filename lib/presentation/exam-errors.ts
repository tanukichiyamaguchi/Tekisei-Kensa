// 受検者 API のエラー → 画面の動作（05 §5.1.6、§5.2.2、§5.3.7、§5.4.2、§7.1 の表）。純関数
import type { ExamBannerTextId } from "./exam-texts";

/** 04 §2.4 のコードと、画面側の擬似コード（通信断・タイムアウト・オフライン検知） */
export interface ExamApiFailure {
  readonly status: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type ExamApiOperation = "register" | "start" | "save" | "submit";

export type ExamErrorAction =
  /** E-04 を全面表示（R-06 session_unavailable 相当）。sessionStorage の退避を削除する */
  | { readonly kind: "session_unavailable" }
  /** 送信済み。R-05（/complete）へ router.replace */
  | { readonly kind: "complete" }
  /** 画面内バナー。retry が true なら「再試行」を出す */
  | { readonly kind: "banner"; readonly text: ExamBannerTextId; readonly retry: boolean }
  /** E-03 と「未回答のページへ移動」（questionNo が属するページへ） */
  | { readonly kind: "unanswered"; readonly questionNo: number }
  /** 登録の 422: 項目ごとの赤枠（details.issues[].path） */
  | { readonly kind: "registration_issues"; readonly paths: readonly string[] };

const SESSION_UNAVAILABLE_CODES = new Set([
  "RESPONDENT_TOKEN_INVALID",
  "RESPONDENT_TOKEN_EXPIRED",
  "NOT_FOUND",
  "SESSION_NOT_FOUND",
]);

function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v)) : [];
}

/** details.issues[].path（04 §2.3）。形が違えば空配列 */
export function issuePaths(details: Readonly<Record<string, unknown>>): readonly string[] {
  const issues = details.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((i: unknown) => {
    const path = (i as { path?: unknown } | null)?.path;
    return typeof path === "string" ? [path] : [];
  });
}

export function examErrorAction(
  operation: ExamApiOperation,
  failure: ExamApiFailure,
): ExamErrorAction {
  const { code } = failure;
  if (code === "OFFLINE") return { kind: "banner", text: "E-07", retry: true };
  if (code === "RATE_LIMITED") return { kind: "banner", text: "E-06", retry: true };

  if (operation === "register") {
    if (code === "ORGANIZATION_NOT_FOUND") return { kind: "banner", text: "E-05", retry: false };
    if (code === "VALIDATION_ERROR") {
      return { kind: "registration_issues", paths: issuePaths(failure.details) };
    }
    return { kind: "banner", text: "E-01", retry: true };
  }

  if (SESSION_UNAVAILABLE_CODES.has(code)) return { kind: "session_unavailable" };
  if (code === "SESSION_ALREADY_SUBMITTED") return { kind: "complete" };

  if (operation === "submit" && code === "ANSWERS_INCOMPLETE") {
    const first =
      numberArray(failure.details.missing)[0] ?? numberArray(failure.details.invalid)[0];
    if (first !== undefined) return { kind: "unanswered", questionNo: first };
  }
  // 保存の失敗は E-02（05 §5.3.7）。画面側で防いでいる 422 も含めて再試行させる
  if (operation === "save") return { kind: "banner", text: "E-02", retry: true };
  return { kind: "banner", text: "E-01", retry: true };
}
