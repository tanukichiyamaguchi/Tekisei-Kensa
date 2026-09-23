// API のエラー（04 §2.4）。message は画面にそのまま表示できる日本語。個人情報・内部情報を含めない
export type ApiErrorCode =
  | "INVALID_JSON"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "ID_TOKEN_INVALID"
  | "RESPONDENT_TOKEN_INVALID"
  | "RESPONDENT_TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "ADMIN_SUSPENDED"
  | "ADMIN_NOT_REGISTERED"
  | "ROLE_REQUIRED"
  | "NOT_FOUND"
  | "ORGANIZATION_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "RESULT_NOT_FOUND"
  | "RESPONDENT_NOT_FOUND"
  | "SESSION_ALREADY_SUBMITTED"
  | "ANSWERS_INCOMPLETE"
  | "POPULATION_EMPTY"
  | "AI_ALREADY_GENERATING"
  | "AI_GENERATION_FAILED"
  | "AI_DAILY_LIMIT_EXCEEDED"
  | "PDF_GENERATION_FAILED"
  | "INVITE_TOKEN_INVALID"
  | "EMAIL_ALREADY_REGISTERED"
  | "CURRENT_PASSWORD_MISMATCH"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

/** 04 §2.4 の表の定型文 */
export const API_ERRORS = {
  notFound: () => new ApiError(404, "NOT_FOUND", "指定されたリソースが見つかりません"),
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "ログインが必要です"),
  idTokenInvalid: () =>
    new ApiError(401, "ID_TOKEN_INVALID", "ログインに失敗しました。もう一度ログインしてください"),
  adminNotRegistered: () =>
    new ApiError(403, "ADMIN_NOT_REGISTERED", "管理者として登録されていません"),
  adminSuspended: () => new ApiError(403, "ADMIN_SUSPENDED", "このアカウントは利用停止中です"),
  roleRequired: () => new ApiError(403, "ROLE_REQUIRED", "この操作にはオーナー権限が必要です"),
  respondentTokenInvalid: () =>
    new ApiError(
      401,
      "RESPONDENT_TOKEN_INVALID",
      "受検セッションを確認できません。受検リンクから登録し直してください",
    ),
  respondentTokenExpired: () =>
    new ApiError(
      401,
      "RESPONDENT_TOKEN_EXPIRED",
      "受検セッションの有効期限が切れました。受検リンクから登録し直してください",
    ),
  inviteTokenInvalid: () =>
    new ApiError(
      404,
      "INVITE_TOKEN_INVALID",
      "管理者追加用リンクが無効です。管理者に新しいリンクを発行してもらってください",
    ),
  emailAlreadyRegistered: () =>
    new ApiError(409, "EMAIL_ALREADY_REGISTERED", "このメールアドレスはすでに登録されています"),
  rateLimited: (retryAfterSeconds?: number) =>
    new ApiError(
      429,
      "RATE_LIMITED",
      "アクセスが集中しています。しばらくしてから再度お試しください",
      {},
      retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) },
    ),
  serviceUnavailable: () =>
    new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "一時的にご利用いただけません。しばらくしてから再度お試しください",
      {},
      { "Retry-After": "5" },
    ),
  internal: () => new ApiError(500, "INTERNAL_ERROR", "サーバ内部でエラーが発生しました"),
} as const;
