// Firebase・リポジトリ由来の例外を ApiError に変換する（04 §2.4 の対応表、§8.4）。firebase-admin は import しない
import { API_ERRORS, ApiError } from "./errors";
import { RepositoryError } from "@/lib/db/errors";

/** 例外の code（"auth/..." の文字列、または gRPC のステータス番号・名前） */
export function firebaseErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  if (typeof code === "number") return GRPC_NAMES[code] ?? String(code);
  return null;
}

const GRPC_NAMES: Readonly<Record<number, string>> = {
  4: "deadline-exceeded",
  5: "not-found",
  6: "already-exists",
  7: "permission-denied",
  8: "resource-exhausted",
  9: "failed-precondition",
  10: "aborted",
  13: "internal",
  14: "unavailable",
};

/** RepositoryError.code → ApiError（04 §8.4） */
export function translateRepositoryError(error: RepositoryError): ApiError {
  switch (error.code) {
    case "ORGANIZATION_NOT_FOUND":
      return new ApiError(
        404,
        "ORGANIZATION_NOT_FOUND",
        "受検リンクが無効です。管理者にお問い合わせください",
      );
    case "ADMIN_USER_NOT_FOUND":
      return API_ERRORS.adminNotRegistered();
    case "ADMIN_USER_SUSPENDED":
      return API_ERRORS.adminSuspended();
    case "RESPONDENT_NOT_FOUND":
      return new ApiError(404, "RESPONDENT_NOT_FOUND", "受検者が見つかりません");
    case "RESULT_NOT_FOUND":
      return new ApiError(404, "RESULT_NOT_FOUND", "診断結果が見つかりません");
    case "SESSION_NOT_FOUND":
      return new ApiError(404, "SESSION_NOT_FOUND", "受検セッションが見つかりません");
    case "SESSION_ALREADY_SUBMITTED":
      return new ApiError(409, "SESSION_ALREADY_SUBMITTED", "この受検はすでに送信済みです");
    case "ANSWERS_INCOMPLETE":
      return new ApiError(422, "ANSWERS_INCOMPLETE", "未回答の設問があります", {
        missing: error.details.missing ?? [],
        // 不正な値の設問番号は、ある場合だけ入れる（04 §4.5）
        ...(Array.isArray(error.details.invalid) && error.details.invalid.length > 0
          ? { invalid: error.details.invalid }
          : {}),
      });
    case "INVITE_TOKEN_INVALID":
      return API_ERRORS.inviteTokenInvalid();
    case "AI_ALREADY_GENERATING":
      return new ApiError(
        409,
        "AI_ALREADY_GENERATING",
        "AI 解説を生成中です。しばらくしてから再度お試しください",
      );
    case "AI_ANALYSIS_MISMATCH":
      return API_ERRORS.internal();
    case "VALIDATION_ERROR":
      return new ApiError(422, "VALIDATION_ERROR", "入力内容に誤りがあります", {
        issues: (Array.isArray(error.details.paths) ? error.details.paths : []).map((path) => ({
          path,
          message: "値が不正です",
        })),
      });
  }
}

/** Firebase Auth / Firestore の例外（04 §2.4）。対応表に無いものは 500 */
export function translateFirebaseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof RepositoryError) return translateRepositoryError(error);
  const code = firebaseErrorCode(error);
  switch (code) {
    case "auth/session-cookie-expired":
    case "auth/session-cookie-revoked":
    case "auth/invalid-session-cookie-duration":
      return API_ERRORS.unauthenticated();
    case "auth/id-token-expired":
    case "auth/id-token-revoked":
    case "auth/invalid-id-token":
      return API_ERRORS.idTokenInvalid();
    case "auth/user-disabled":
      return API_ERRORS.adminSuspended();
    case "auth/email-already-exists":
      return API_ERRORS.emailAlreadyRegistered();
    case "auth/invalid-email":
      return validation("email", "メールアドレスの形式が正しくありません");
    case "auth/invalid-password":
      return validation("password", "パスワードが要件を満たしていません");
    case "auth/invalid-display-name":
      return validation("name", "お名前が正しくありません");
    case "auth/user-not-found":
      return API_ERRORS.adminNotRegistered();
    case "auth/too-many-requests":
    case "resource-exhausted":
      return API_ERRORS.rateLimited();
    case "aborted":
    case "unavailable":
    case "deadline-exceeded":
      return API_ERRORS.serviceUnavailable();
    default:
      return API_ERRORS.internal();
  }
}

function validation(path: string, message: string): ApiError {
  return new ApiError(422, "VALIDATION_ERROR", "入力内容に誤りがあります", {
    issues: [{ path, message }],
  });
}
