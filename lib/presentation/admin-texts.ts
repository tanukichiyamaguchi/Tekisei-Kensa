// 管理画面の文言（06 §10.5）。要件定義書・付録に文言があるものはそのまま、それ以外は 06 の設計判断。
// 回答一覧と利用履歴の文言は result-list-texts.ts（11-2 §2.27。利用履歴・削除する・キャンセル・過去の受講経験・T-26・T-33 はここを使う）。
// 結果詳細の文言は result-detail-texts.ts（11-4 §2.20）。結果詳細だけで使っていた B-09・T-02（移した）・T-04・T-10〜T-13・T-27・T-28 は
// PR-7.8a で消した。showAi・hideAi は旧の AI 解説の領域（PR-7.9 で消す）、showSecondCandidate・showFirstCandidate は旧のセクション 5
// （PR-7.8b で消す）が使う間だけ残す
import type { AiFailureReason } from "@/lib/ai/errors";
import type { RespondentKind } from "@/lib/db/types";

/** 受検者区分の表示名（00 §1.8、06 §3.4.2） */
export const RESPONDENT_KIND_LABELS: Readonly<Record<RespondentKind, string>> = {
  applicant: "求職者",
  executive: "既存スタッフ",
};

export const ADMIN_TEXTS = {
  appTitle: "適性検査", // H-01（05 §9.1 と同じ仮置き）
  nav: {
    results: "回答一覧",
    classification: "組織内分類",
    employment: "在籍・退職",
    account: "アカウント",
  }, // N-01〜N-04
  usageLogs: "利用履歴", // B-01
  backToResults: "回答一覧に戻る", // B-02
  download: "ダウンロード", // B-03
  startDownload: "ダウンロードを開始する", // B-04
  showAi: "AI解説を表示", // B-05
  hideAi: "AI解説を非表示", // B-06
  retryAi: "再試行", // 06 §3.5.9 の failed 表示
  showSecondCandidate: "第二候補を見る", // B-07
  showFirstCandidate: "第一候補に戻る", // B-08
  copy: "コピーする", // B-10
  login: "ログイン", // B-11
  delete: "削除する", // B-13
  cancel: "キャンセル", // B-14
  rotateInvite: "招待リンクを再発行する", // B-15
  logout: "ログアウト", // 06 §2.3（ヘッダー右）
  resetMailSent: "入力したメールアドレス宛に案内を送信しました", // 06 §3.3
  signupInviteRequired: "管理者追加用リンクから登録してください", // 06 §3.1 D06-05
  changed: "変更しました", // 06 §3.7
  copied: "コピーしました", // 06 §3.7
  copyFailed: "コピーできませんでした。選択した文字列を手動でコピーしてください", // 06 §3.7
  issued: "発行しました", // 06 §3.7
  rotateConfirm: "新しいリンクを発行すると、これまでの管理者追加用リンクは使えなくなります。", // P-07
  notIssued: "未発行", // 06 §3.7
  sessionsRevokedNote: "変更すると、他の端末でのログインもすべて解除されます。", // P-08（06 §3.7）
  resultTitle: (name: string) => `${name}様の診断結果`, // T-01（「様」の前に空白を入れない。PDF のページの見出しも同じ。11-4 §2.3.2）
  organizationScope: "組織全体", // T-03
  downloadFull: "全画面ダウンロード", // T-05
  downloadRestricted: "評価・組織との合致度・リスクを非表示にしてダウンロード", // T-06
  ownerOnly: "責任者のみ回答データを閲覧できます", // T-08
  aiDisclaimer:
    "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は責任者が内容をご確認のうえご活用ください。", // T-09
  accountUnavailable: "このアカウントは現在利用できません。組織の管理者にお問い合わせください。", // T-15
  resultNotFound: "回答データが見つかりません", // T-16
  aiGenerating: "AI解説を生成しています。1〜2 分かかることがあります。", // T-17
  aiFailed: "AI解説の生成に失敗しました。", // T-18
  aiGeneratedAt: (at: string) => `生成日時 ${at}`, // 06 §3.5.9
  diagnosisExperience: { first_time: "初めて診断する", experienced: "過去に診断したことがある" }, // T-20
  inviteInvalid: "このリンクは無効です。管理者追加用リンクを組織の管理者から受け取ってください。", // T-22
  resetLinkInvalid: "認証リンクが無効か期限切れです。もう一度お試しください", // T-23
  loginFailed: "メールアドレスまたはパスワードが正しくありません", // T-24
  alreadyDeleted: "この回答データはすでに削除されています", // T-26
  pollingTimeout: "時間内に完了しませんでした。ページを再読み込みしてください", // T-29
  pdfWithoutComparison: "比較対象がいないため、比較なしで出力します", // T-31
  pdfGenerating: "PDF を生成しています…", // 06 §3.5.11
  pdfComparisonNone: "比較組織: 未選択", // 06 §3.5.11
  pdfComparisonEmpty: "比較組織: 未選択（比較対象がいないため比較なしで出力します）", // 06 §3.5.11
  networkError: "通信に失敗しました。ネットワーク接続を確認して再度お試しください", // T-33
  signupDone:
    "登録しました。パスワード設定用のメールを送信しました。メール内のリンクからパスワードを設定してください", // T-35
  passwordResetDone: "パスワードを変更しました。ログインしてください", // T-36
  reloginRequired: (what: "メールアドレス" | "パスワード") =>
    `${what}を変更しました。もう一度ログインしてください`, // T-37
  currentPasswordMismatch: "現在のパスワードが正しくありません", // T-38
  inviteLinkOnce:
    "このリンクはこの画面を離れると再表示できません。必要な相手にすぐに共有してください", // T-39
} as const;

/** AI 解説の失敗理由コード → 表示文言（06 §3.5.9 の T-30 群。語彙は 07 §4.6 の AiFailureReason + 04 §5.9 の internal_error） */
export const AI_FAILURE_TEXTS: Readonly<Record<AiFailureReason | "internal_error", string>> = {
  provider_error: "AI サービスとの通信に失敗しました。時間をおいて再試行してください",
  rate_limited: "AI サービスが混み合っています。時間をおいて再試行してください",
  invalid_request: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  auth_error: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  config_error: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  timeout: "生成に時間がかかりすぎたため中断しました。再試行してください",
  invalid_json: "AI の応答を解釈できませんでした。再試行してください",
  truncated: "AI の応答を解釈できませんでした。再試行してください",
  refusal: "AI が解説の生成を行いませんでした。再試行してください",
  internal_error: "生成処理でエラーが発生しました。再試行してください",
};

/** X-12: 未知の値・null は internal_error と同じ既定文言 */
export function aiFailureText(code: string | null): string {
  if (code !== null && Object.hasOwn(AI_FAILURE_TEXTS, code)) {
    return AI_FAILURE_TEXTS[code as keyof typeof AI_FAILURE_TEXTS];
  }
  return AI_FAILURE_TEXTS.internal_error;
}
