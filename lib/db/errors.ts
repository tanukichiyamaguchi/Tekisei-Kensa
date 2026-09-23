// リポジトリの型付きエラー（02 §5.6）。04 の service が HTTP ステータスに変換する。
export const REPOSITORY_ERROR_CODES = [
  "ORGANIZATION_NOT_FOUND",
  "ADMIN_USER_NOT_FOUND",
  "ADMIN_USER_SUSPENDED",
  "RESPONDENT_NOT_FOUND",
  "SESSION_NOT_FOUND",
  "SESSION_ALREADY_SUBMITTED",
  "ANSWERS_INCOMPLETE",
  "RESULT_NOT_FOUND",
  "INVITE_TOKEN_INVALID",
  "AI_ANALYSIS_MISMATCH",
  "AI_ALREADY_GENERATING",
  "VALIDATION_ERROR",
] as const;
export type RepositoryErrorCode = (typeof REPOSITORY_ERROR_CODES)[number];

export type RepositoryErrorDetails = Readonly<
  Record<string, string | number | readonly number[] | readonly string[]>
>;

export class RepositoryError extends Error {
  override readonly name = "RepositoryError";
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly details: RepositoryErrorDetails = {},
  ) {
    super(message);
  }
}
