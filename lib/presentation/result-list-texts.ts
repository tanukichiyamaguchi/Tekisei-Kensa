// 回答一覧（M-04）と利用履歴（P-01）の文言（11-2 §2.27 が正。§2.4〜§2.20 の文言）。JSX に直書きせず、この定数を使う
// （06 §10.5）。差し込みのある文言は関数にする。K-19 で置き換えた文言は、参照元の原文をコメントに残す。
// 「利用履歴」（B-01）・「削除する」（B-13）・「キャンセル」（B-14）・過去の受講経験の値（T-20）・T-26・T-33 は ADMIN_TEXTS を使い、
// ここに写さない。区分・役職の名前は employment.ts の EMPLOYMENT_STATUS_LABELS・STAFF_ROLE_LABELS、チームの名前
// （「Aチーム」）は comparison-scope-params.ts の teamLabel を使う。
// 依頼主の確認が要る文言（11-2 7 章の 1〜3。11 総論 7 章の 8〜10）は、確認まで仕様書の案のまま:
// 求職者タブの 0 件（RESULT_LIST_TEXTS.empty.no_candidate）、退職タブの 0 件（RESULT_LIST_TEXTS.empty.no_left）、
// チームを未設定に戻したときの通知（RESULT_LIST_TEXTS.toast.teamCleared）
import { ADMIN_TEXTS } from "./admin-texts";
import { teamLabel } from "./comparison-scope-params";
import {
  EMPLOYMENT_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  type EmploymentStatus,
  type StaffRole,
} from "./employment";
import type { EmptyStateKind, ListSegment, ListSort } from "./result-list-view";
import type { TeamCode } from "@/lib/scoring/types";

/** 回答リンクの種類（11-2 §2.17。MeDto.links の applicant・executive） */
export type ResultListLinkKind = "applicant" | "executive";

/** 回答リンクの種類の名前（§2.17）。リンクのメニューの項目と、通知「{種類}をコピーしました」・window.prompt の {種類} */
const LINK_KIND_LABELS: Readonly<Record<ResultListLinkKind, string>> = {
  applicant: "求職者用の回答リンク",
  executive: "既存スタッフ用の回答リンク",
};

/** 区分タブの名前（§2.6）。「受験から1年以上」は区分がそれの間だけ出す */
const SEGMENT_LABELS: Readonly<Record<ListSegment, string>> = {
  all: "すべて",
  cand: EMPLOYMENT_STATUS_LABELS.candidate,
  exec: EMPLOYMENT_STATUS_LABELS.employed,
  left: EMPLOYMENT_STATUS_LABELS.left,
  old: "受験から1年以上",
};

/** 並び順の選択肢（§2.7） */
const SORT_LABELS: Readonly<Record<ListSort, string>> = {
  new: "並び順：受験日が新しい順",
  old: "並び順：受験日が古い順",
  name: "並び順：氏名順",
  due: "並び順：1年以上たった人を先に",
};

/** 0 件の表示（§2.19。種類は result-list-view.ts の emptyStateKind）。button が null の種類はボタンを出さない */
const EMPTY_STATE_TEXTS: Readonly<
  Record<
    EmptyStateKind,
    { readonly title: string; readonly body: string; readonly button: string | null }
  >
> = {
  no_match: {
    title: "条件に合う受験者がいません",
    body: "検索や絞り込みを変えてみてください。",
    button: "絞り込みを解除",
  },
  no_employed: {
    title: "既存スタッフの受験はまだありません",
    body: "既存スタッフ用の回答リンクを送ると、ここに表示されます。",
    button: "既存スタッフ用リンクをコピー",
  },
  // 確認まで案（11-2 7 章の 1。K-32 ⑥。参照元は no_results と同じ文言）
  no_candidate: {
    title: "求職者の受験はまだありません",
    body: "求職者用の回答リンクを送ると、ここに表示されます。",
    button: "求職者用リンクをコピー",
  },
  // 確認まで案（11-2 7 章の 2。K-32 ⑥。退職は回答リンクで増えないのでボタンを出さない）
  no_left: {
    title: "退職した人はいません",
    body: "区分を「退職」にした人が、ここに表示されます。",
    button: null,
  },
  no_results: {
    title: "受験はまだありません",
    body: "求職者用の回答リンクを送ると、回答した人がここに表示されます。",
    button: "求職者用リンクをコピー",
  },
};

const TEAM_UNASSIGNED = "チーム未設定";

export const RESULT_LIST_TEXTS = {
  // 見出し・説明・ボタン（§2.4）。「利用履歴」のボタンは ADMIN_TEXTS.usageLogs
  title: "回答一覧",
  description:
    "受験した人の診断結果を開けます。同じ人の受験は1行にまとめ、最新の受験を表示しています。",
  copyLink: "回答リンクをコピー",
  // リンクのメニュー（§2.17）。項目の名前は linkKinds
  linkMenu: {
    heading: "送る相手を選んでください",
    note: {
      applicant: "採用候補者に",
      executive: "責任者のみ閲覧", // 参照元: 院長のみ閲覧（K-19）
    } satisfies Readonly<Record<ResultListLinkKind, string>>,
  },
  linkKinds: LINK_KIND_LABELS,
  // 集計カード（§2.5）。数字の前後の空白は参照元どおり
  stats: {
    people: "受験した人",
    peopleUnit: "人",
    peopleByStatus: (candidates: number, employed: number) =>
      `受講者 ${candidates} ／ 既存スタッフ ${employed}`, // オーナー
    examTotal: (examCount: number) => `受験は延べ ${examCount} 回`, // オーナー以外
    thisMonth: "今月の受験",
    thisMonthUnit: "回",
    lastMonth: (count: number) => `先月 ${count} 回`,
    oneYear: "受験から1年以上たった人",
    oneYearUnit: "人",
    oneYearAction: "押すと一覧に絞り込みます",
    oneYearNone: "再受験の時期はまだです",
    longitudinal: "経年比較レポート",
    longitudinalUnit: "件",
    multiExam: (count: number) => `2回以上受験した人：${count}人`,
  },
  // 区分タブ（§2.6）。segmentsLabel は並びの読み上げ名
  segmentsLabel: "表示する受験者",
  segments: SEGMENT_LABELS,
  // 道具の行（§2.7）。チームの選択肢の「Aチーム」は teamLabel
  tools: {
    search: "氏名・電話番号で探す", // プレースホルダーと見えないラベル
    teamFilter: "チームで絞り込む", // 見えないラベル
    teamAll: "チーム：すべて",
    sort: "並び順", // 見えないラベル
    shownCount: (count: number) => `${count}人を表示`,
    separator: " ・ ",
    clearFilters: "絞り込みを解除",
  },
  sorts: SORT_LABELS,
  // チームで絞り込む・行のチームの選択（§2.7・§2.10）
  teamUnassigned: TEAM_UNASSIGNED,
  // 表（§2.8・§2.10・§2.11）
  table: {
    person: "受験者",
    type: "タイプ",
    latest: "最新の受験",
    team: "チーム",
    excluded: "集計から除外",
    excludedHelp: "オンにすると、組織内分類の人数に入れません。診断結果は消えません。", // 列の見出しの title
    actions: "操作",
    noName: "（氏名なし）",
    noType: "—",
    previous: (ymd: string) => `前回 ${ymd}`,
    openResult: "結果を見る",
    moreActions: (name: string) => `${name}のその他の操作`, // ⋮の読み上げ名
    moreActionsTitle: "その他の操作",
    teamSelect: (name: string) => `${name}のチーム`, // 見えないラベル
    excludeSwitch: (name: string) => `${name}を組織内分類の集計から除外`, // スイッチの読み上げ名
    excludedOn: "除外中",
    excludedOff: "集計に含む",
    showMore: (rest: number) => `さらに表示（残り${rest}人）`,
    footnote: "行を押すと診断結果を開きます。削除や以前の受験は「…」から選べます。",
  },
  // チップ（§2.9）。役職の札の名前は STAFF_ROLE_LABELS（責任者・幹部）
  chips: {
    status: (status: EmploymentStatus) => `${EMPLOYMENT_STATUS_LABELS[status]} ▾`,
    statusTitle: "タップして区分を変える",
    hired: (ymd: string) => `入社 ${ymd}`,
    left: (ymd: string) => `退職 ${ymd}`,
    nth: (n: number) => `${n}回目`,
    longitudinal: "経年比較あり",
    oneYear: "受験から1年以上",
    metaSeparator: " ・ ", // 小さい文字「{職業} ・ {電話番号}」
  },
  // ⋮メニュー・区分メニュー（§2.12・§2.13）。区分と役職の項目は EMPLOYMENT_STATUS_LABELS・STAFF_ROLE_LABELS
  menu: {
    previous: "以前の受験",
    openNth: (k: number) => `${k}回目の結果を開く`,
    editDates: "入社日・退職日を入れる",
    changeStatus: "区分を変える",
    currentStatus: "現在の区分",
    changeRole: "役職を変える",
    currentRole: "現在の役職",
    deleteExam: "この受験を削除",
    deleteNote: (ymd: string) => `${ymd}の分`,
  },
  // 入社日・退職日のダイアログ（§2.14）
  dates: {
    title: (name: string) => `${name}さんの入社日・退職日`,
    description: "勤続年数の計算に使います。わかる分だけでも大丈夫です。",
    hiredOn: "入社日",
    leftOn: "退職日（退職した人だけ）",
    cancel: "やめる",
    save: "保存する",
  },
  // 削除の確認（§2.16）。「削除する」「キャンセル」は ADMIN_TEXTS.delete・cancel、閉じるアイコンの読み上げ名は Dialog の「閉じる」
  deleteConfirm: {
    title: "この受験を削除しますか？",
    body: (name: string, ymd: string) =>
      `${name}さん（${ymd} 受験）の診断結果を削除します。削除すると元に戻せません。`,
  },
  // 利用履歴（§2.18）。過去の受講経験の値は ADMIN_TEXTS.diagnosisExperience
  usageLog: {
    title: (organizationName: string) => `${ADMIN_TEXTS.usageLogs}（${organizationName}）`,
    submittedAt: "回答日時",
    name: "名前",
    phoneNumber: "電話番号",
    diagnosisExperience: "過去の受講経験",
    close: "閉じる",
    loading: "読み込んでいます…",
  },
  // 0 件のとき（§2.19）
  empty: EMPTY_STATE_TEXTS,
  // 通知（§2.20）
  toast: {
    teamChanged: (name: string, teamCode: TeamCode) =>
      `${name}さんを${teamLabel(teamCode)}にしました`,
    teamCleared: (name: string) => `${name}さんを${TEAM_UNASSIGNED}にしました`, // 確認まで案（11-2 7 章の 3。K-32 ⑦）
    excluded: (name: string) => `${name}さんを集計から除外しました`,
    included: (name: string) => `${name}さんを集計に戻しました`,
    statusChanged: (name: string, status: EmploymentStatus) =>
      `${name}さんを「${EMPLOYMENT_STATUS_LABELS[status]}」にしました`,
    datesSaved: (name: string) => `${name}さんの日付を保存しました`,
    leftBeforeHired: "退職日が入社日より前になっています",
    roleChanged: (name: string, role: StaffRole) =>
      `${name}さんの役職を「${STAFF_ROLE_LABELS[role]}」にしました`,
    linkCopied: (kind: ResultListLinkKind) => `${LINK_KIND_LABELS[kind]}をコピーしました`,
    linkMissing: "リンクを用意できませんでした",
    deletedTitle: "完了",
    deletedBody: "回答データを削除しました。",
  },
  // クリップボードが使えないときの window.prompt の文（§2.17）
  copyPrompt: (kind: ResultListLinkKind) => `${LINK_KIND_LABELS[kind]}（コピーしてください）`,
  // サーバでの取得の失敗（§2.1）
  loadFailed: "表示できませんでした。ページを再読み込みしてください。",
} as const;
