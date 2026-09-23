// components/ と lib/auth/ が共有する受検者画面の型（05 §10.5。依存なし）

/** R-06 の種別（05 §5.6）。organization_closed は将来の受付停止フラグ用に予約（D05-31） */
export type ExamErrorKind =
  | "organization_not_found"
  | "organization_closed"
  | "session_unavailable"
  | "page_not_found"
  | "unexpected";
