// 受検者 API のエラー → 画面の動作（11-1 §2.1.5・§2.2.6・§2.3・§2.4.5〜§2.4.7・§3.5）。純関数
import type { ExamBannerTextId } from "./exam-texts";
import { REGISTRATION_FIELDS } from "./registration-rules";

/** 04 §2.4 のコードと、画面側の擬似コード（NETWORK_ERROR・TIMEOUT・OFFLINE。status は 0） */
export interface ExamApiFailure {
  readonly status: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * register: 「診断に進む」、start: 「開始する」、save: 選んだ時点の自動保存、
 * flush: 「次へ」「送信する」の前の未送信の保存、submit: 送信
 */
export type ExamApiOperation = "register" | "start" | "save" | "flush" | "submit";

/** R-07 の本文のうち API の失敗で出すもの（上限の V-02・V-04 は画面の検査が出す） */
export type ExamAlertTextId = Extract<
  ExamBannerTextId,
  "R7-02" | "E-01" | "E-02" | "E-06" | "E-07"
>;

export type ExamErrorAction =
  /** R-06（session_unavailable）をその場に出す。退避を消す */
  | { readonly kind: "session_unavailable" }
  /** 送信済み。R-05（/complete）へ router.replace */
  | { readonly kind: "complete" }
  /** R-07 エラーの通知（見出し R7-01。画面はそのまま） */
  | { readonly kind: "alert"; readonly textId: ExamAlertTextId }
  /** 送信の 422 ANSWERS_INCOMPLETE: 設問 questionNo があるステップを今のステップにし、未回答に印を付ける */
  | { readonly kind: "unanswered"; readonly questionNo: number }
  /** 登録の 422: 項目ごとの赤枠（details.issues[].path のうち登録の項目のもの） */
  | { readonly kind: "registration_issues"; readonly paths: readonly string[] }
  /** 自動保存の失敗。未送信のまま残し、次の選択と「次へ」「送信する」のときに送り直す（通知しない） */
  | { readonly kind: "retry_later" };

/** 受験を続けられない（Cookie が無効・期限切れ・セッションの削除。11-1 §2.6） */
const SESSION_UNAVAILABLE_CODES = new Set([
  "RESPONDENT_TOKEN_INVALID",
  "RESPONDENT_TOKEN_EXPIRED",
  "NOT_FOUND",
  "SESSION_NOT_FOUND",
]);

const alert = (textId: ExamAlertTextId): ExamErrorAction => ({ kind: "alert", textId });

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

/** path の先頭の項目名（"answers[0].questionNo" → "answers"） */
const pathHead = (path: string): string => path.split(/[.[]/)[0] ?? "";

const isOffline = (f: ExamApiFailure) => f.code === "OFFLINE";
const isRateLimited = (f: ExamApiFailure) => f.code === "RATE_LIMITED" || f.status === 429;
const isAlreadySubmitted = (f: ExamApiFailure) =>
  f.code === "SESSION_ALREADY_SUBMITTED" || f.status === 409;
const isSessionUnavailable = (f: ExamApiFailure) =>
  SESSION_UNAVAILABLE_CODES.has(f.code) || f.status === 401 || f.status === 404;

/** 「診断に進む」（11-1 §2.2.6） */
function registerAction(failure: ExamApiFailure): ExamErrorAction {
  if (isOffline(failure)) return alert("E-07");
  if (isRateLimited(failure)) return alert("E-06");
  if (failure.code === "ORGANIZATION_NOT_FOUND" || failure.code === "NOT_FOUND") {
    return alert("R7-02");
  }
  if (failure.code === "VALIDATION_ERROR") {
    const paths = issuePaths(failure.details);
    if (paths.some((p) => pathHead(p) === "organizationId")) return alert("R7-02");
    const fieldPaths = paths.filter((p) => REGISTRATION_FIELDS.some((f) => f === pathHead(p)));
    if (fieldPaths.length > 0) return { kind: "registration_issues", paths: fieldPaths };
  }
  // そのほかの 422・400・415・5xx・通信の失敗・タイムアウト
  return alert("E-01");
}

export function examErrorAction(
  operation: ExamApiOperation,
  failure: ExamApiFailure,
): ExamErrorAction {
  if (operation === "register") return registerAction(failure);

  if (isSessionUnavailable(failure)) return { kind: "session_unavailable" };
  // 送信済み。送信では二重送信の後の方で、成功と同じに扱う（11-1 §2.4.7）
  if (isAlreadySubmitted(failure)) return { kind: "complete" };
  if (operation === "submit" && failure.code === "ANSWERS_INCOMPLETE") {
    const first =
      numberArray(failure.details.missing)[0] ?? numberArray(failure.details.invalid)[0];
    if (first !== undefined) return { kind: "unanswered", questionNo: first };
  }
  // 自動保存の失敗は通知しない（通信の失敗・5xx・429・オフラインとも。11-1 §2.4.5）
  if (operation === "save") return { kind: "retry_later" };
  if (isOffline(failure)) return alert("E-07");
  if (isRateLimited(failure)) return alert("E-06");
  // 「次へ」「送信する」の前の保存の失敗は E-02、開始・送信の失敗は E-01（11-1 §2.1.5・§2.3・§2.4.7）
  return alert(operation === "flush" ? "E-02" : "E-01");
}
