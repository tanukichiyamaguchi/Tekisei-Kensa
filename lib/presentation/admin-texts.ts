// 管理画面の文言（06 §10.5）。要件定義書・付録に文言があるものはそのまま、それ以外は 06 の設計判断
import type { RespondentKind } from "@/lib/db/types";

/** 受検者区分の表示名（00 §1.8、06 §3.4.2） */
export const RESPONDENT_KIND_LABELS: Readonly<Record<RespondentKind, string>> = {
  applicant: "求職者",
  executive: "既存スタッフ",
};

export const ADMIN_TEXTS = {
  appTitle: "適性検査", // H-01（05 §9.1 と同じ仮置き）
  nav: { results: "回答一覧", classification: "組織内分類", account: "アカウント" }, // N-01〜N-03
  usageLogs: "利用履歴", // B-01
  backToResults: "回答一覧に戻る", // B-02
  download: "ダウンロード", // B-03
  startDownload: "ダウンロードを開始する", // B-04
  showAi: "AI解説を表示", // B-05
  hideAi: "AI解説を非表示", // B-06
  showSecondCandidate: "第二候補を見る", // B-07
  showFirstCandidate: "第一候補に戻る", // B-08
  showAllTraits: "他項目のポジティブ・ネガティブを確認", // B-09
  copy: "コピーする", // B-10
  login: "ログイン", // B-11
  exclude: "除外する", // B-12
  delete: "削除する", // B-13
  cancel: "キャンセル", // B-14
  rotateInvite: "招待リンクを再発行する", // B-15
  logout: "ログアウト", // 06 §2.3（ヘッダー右）
  deleted: "削除しました", // 06 §3.4.5
  noMatchingResults: "条件に一致する回答データがありません。", // 06 §3.4.6
  reload: "再読み込み", // 06 §3.4.6
  unassignedTeam: "未設定", // 06 §3.4.2（チームのプルダウン）
  resetMailSent: "入力したメールアドレス宛に案内を送信しました", // 06 §3.3
  signupInviteRequired: "管理者追加用リンクから登録してください", // 06 §3.1 D06-05
  resultTitle: (name: string) => `${name} 様の診断結果`, // T-01
  selectComparison: "比較組織を選択", // T-02
  organizationScope: "組織全体", // T-03
  comparisonRequired: "比較組織を選択すると表示されます", // T-04
  downloadFull: "全画面ダウンロード", // T-05
  downloadRestricted: "評価・組織との合致度・リスクを非表示にしてダウンロード", // T-06
  classificationEmpty: "本タイプの回答者はいません。", // T-07（付録C §8）
  ownerOnly: "院長先生のみ回答データを閲覧できます", // T-08
  aiDisclaimer:
    "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は院長が内容をご確認のうえご活用ください。", // T-09
  populationEmpty:
    "比較できる回答データがありません（除外されていない・現在の採点版の回答データが 0 件です）", // T-10
  populationSubjectOnly: "比較対象は本人のみのため、合致度・偏差値は参考値です", // T-11
  negativeValueNote: "※ 計算値が 0 未満のため左端に表示しています", // T-12
  allTraitsEqual: "すべての尺度が同じ値です", // T-13
  confirmDelete: "回答データを削除しますか？", // T-14
  accountUnavailable: "このアカウントは現在利用できません。組織の管理者にお問い合わせください。", // T-15
  resultNotFound: "回答データが見つかりません", // T-16
  aiGenerating: "AI解説を生成しています。1〜2 分かかることがあります。", // T-17
  aiFailed: "AI解説の生成に失敗しました。", // T-18
  notSubmitted: "未回答", // T-19
  diagnosisExperience: { first_time: "初めて診断する", experienced: "過去に診断したことがある" }, // T-20
  noResults: "まだ回答データがありません。アカウント画面の受検リンクを受検者に送付してください。", // T-21
  inviteInvalid: "このリンクは無効です。管理者追加用リンクを組織の管理者から受け取ってください。", // T-22
  resetLinkInvalid: "認証リンクが無効か期限切れです。もう一度お試しください", // T-23
  loginFailed: "メールアドレスまたはパスワードが正しくありません", // T-24
  alreadyDeleted: "この回答データはすでに削除されています", // T-26
  populationSingleOther: "比較対象が 1 名のため、合致度・偏差値は参考値です", // T-27
  subjectNotInPopulation: "（本人は母集団に含まれていません: 除外中または別チーム）", // T-28
  pollingTimeout: "時間内に完了しませんでした。ページを再読み込みしてください", // T-29
  pdfWithoutComparison: "比較対象がいないため、比較なしで出力します", // T-31
  networkError: "通信に失敗しました。ネットワーク接続を確認して再度お試しください", // T-33
  excludedBadge: "除外中", // T-34
  signupDone:
    "登録しました。パスワード設定用のメールを送信しました。メール内のリンクからパスワードを設定してください", // T-35
  passwordResetDone: "パスワードを変更しました。ログインしてください", // T-36
  reloginRequired: (what: "メールアドレス" | "パスワード") =>
    `${what}を変更しました。もう一度ログインしてください`, // T-37
  currentPasswordMismatch: "現在のパスワードが正しくありません", // T-38
  inviteLinkOnce:
    "このリンクはこの画面を離れると再表示できません。必要な相手にすぐに共有してください", // T-39
} as const;
