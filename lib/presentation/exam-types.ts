// components/ と lib/auth/ が共有する受験者側の画面の型（11-1 §3.5。依存なし）

/** R-06 の種別（11-1 §2.6）。session_unavailable は 404、unexpected は 500 */
export type ExamErrorKind = "session_unavailable" | "unexpected";
