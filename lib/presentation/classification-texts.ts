// 組織内分類（M-06）と在籍・退職（M-08）の画面の文言（11-3 §2.23 が正。組織内分類は §2.5〜§2.12、在籍・退職は §2.13〜§2.17・
// §2.20 と 7 章の文言）。JSX に直書きせず、この定数を使う（06 §10.5）。差し込みのある文言は関数にする。付録C の文言（分類の
// 説明文・位置の説明・特徴・適性・適性職種・軸の語・0 人の文言）は lib/masters/texts から読み、ここに写さない（軸は
// CLASSIFICATION_AXES の語から作る。0 人の文は CLASSIFICATION_EMPTY_MESSAGE）。取得の失敗の文は回答一覧と同じ
// RESULT_LIST_TEXTS.loadFailed、チームの名前（「Aチーム」）は comparison-scope-params.ts の teamLabel、区分の名前（「在籍」
// 「退職」「求職者」）は employment.ts の EMPLOYMENT_STATUS_LABELS、サイドメニューの名前は admin-texts.ts の ADMIN_TEXTS.nav を
// 使う。在籍・退職の分析の表の狭い幅の勤続のラベル（「勤続（退職した人）」「勤続（在籍中）」）は CSS の content（11-3 §2.22）に
// あり、ここに写さない。K-19 の置き換えは無い（11-3 §0.5）
import type { ClassificationMode } from "./classification-view";
import { EMPLOYMENT_STATUS_LABELS, type EmploymentStatus } from "./employment";
import { CLASSIFICATION_AXES } from "@/lib/masters/texts";

/** 「組織内分類とは」の本文（11-3 §2.5）。空白と改行は原文どおり（画面は white-space: pre-wrap で出す） */
const ABOUT_BODY = [
  "組織内分類とは、スタッフの特性を 「 感情表現を抑える ↔感情を表す」 と 「意見を聞く ↔ 意見を主張する」 の2つの軸で整理し、4つのタイプに可視化したグラフです。",
  "本分類を活用することで、「どんな人材が多いか」「どんな人材が不足しているか」を直感的に把握できます。",
  "",
  "「 感情表現を抑える ↔感情を表す」",
  "感情を抑える傾向の人は冷静で安定感があり、慎重な判断を行います。一方、感情を表す傾向の人は明るく周囲を巻き込みやすく、活気ある雰囲気をつくります。",
  "",
  "「意見を聞く ↔ 意見を主張する」",
  "意見を聞く傾向の人は協調性が高く、相手の立場を尊重しながら調和を重んじます。一方、意見を主張する傾向の人は主体性があり、リーダーシップを発揮して組織を前へと導きます。",
  "",
  "4タイプがバランス良く揃うことで互いを補い合い、日常業務の安定と新しい挑戦の推進、個々の力とチームワークの両立が可能になり、",
  "組織は 安定しながら成長し続ける ことができます。",
].join("\n");

/** 人数のラベル（11-3 §2.6）。対象で変わる */
const TOTAL_LABELS: Readonly<Record<ClassificationMode, string>> = {
  all: "回答者",
  stay: "在籍中の人",
  left: "退職した人",
};

/** 全員／在籍／退職のボタンの名前（11-3 §2.8）。ボタンは「{名前} {n}」（名前と数の間に半角の空白、数は b） */
const MODE_LABELS: Readonly<Record<ClassificationMode, string>> = {
  all: "全員",
  stay: EMPLOYMENT_STATUS_LABELS.employed,
  left: EMPLOYMENT_STATUS_LABELS.left,
};

export const CLASSIFICATION_SCREEN_TEXTS = {
  // 見出し行（§2.5）。helpMark は「組織内分類とは？」の丸の中（参照元はアイコン。K-05）
  title: "組織内分類",
  help: "組織内分類とは？",
  helpMark: "?",
  // 組織内分類とは（§2.5）。close は閉じるボタン（× のアイコン）の読み上げ名
  about: {
    title: "組織内分類とは",
    body: ABOUT_BODY,
    close: "閉じる",
  },
  // 集計カード（§2.6〜§2.8）。凡例の分類の名前は QUADRANTS のカタカナ名
  summary: {
    mapLabel: "組織内分類マップ", // 集計カード・説明文・軸・マップを囲む section の読み上げ名
    totalLabels: TOTAL_LABELS,
    unit: "人",
    count: (n: number) => `${n}人`, // 凡例の「{n}人」
    percent: (p: number) => `${p}%`, // 凡例・人数のピルの「{p}%」
    team: "チーム",
    teamAll: "すべて",
    teamNone: "未設定", // 選択肢の名前（「Aチーム」「未設定」）は classification-view.ts の teamLabelOf
    modesLabel: "集計の対象", // 全員／在籍／退職の並びの読み上げ名
    modes: MODE_LABELS,
  },
  // 説明文（§2.9）
  note: "キャラクターを押すと、説明と回答者一覧を表示します。位置が外側の角に近いほどその分類の典型、隣の分類に近いほどその分類寄りです。同じ人が複数回受験した場合は、最新の結果で1人として数えています。",
  // 軸（§2.9）。語は付録C §8 の CLASSIFICATION_AXES。縦軸の ▲▼ は CSS の疑似要素
  axis: {
    left: `← ${CLASSIFICATION_AXES.assertion.listen}`, // 横軸の左「← 意見を聞く」
    right: `${CLASSIFICATION_AXES.assertion.assert} →`, // 横軸の右「意見を主張する →」
    top: CLASSIFICATION_AXES.emotion.suppress, // 縦軸の上「感情表現を抑える」
    bottom: CLASSIFICATION_AXES.emotion.express, // 縦軸の下「感情を表す」
  },
  // 象限（§2.10）。人数のピルは「{n}」「人」「{p}%」（summary.unit・percent）
  quadrant: {
    headingLabel: (katakana: string, labelJa: string, n: number) =>
      `${katakana}（${labelJa}）の説明 ${n}人`, // 見出しのボタンの読み上げ名
    foldLabel: (katakana: string) => `${katakana}の一覧を開閉`, // 折りたたみのボタンの読み上げ名
    foldMark: "▾",
  },
  // 印（§2.4。キャラクターの枠・4 タイプのボタン・位置の箱）。矢印は classification-view.ts の Lean.arrow
  lean: {
    core: "典型",
    neighbor: (katakana: string) => `${katakana}寄り`,
    center: "中央寄り",
  },
  // キャラクターの枠（§2.11）。人数は「{n}」「人」（summary.unit）
  cell: {
    label: (hiragana: string, shortLabel: string, lean: string, n: number) =>
      `${hiragana} ${shortLabel}タイプ ${lean} ${n}人`, // 読み上げ名（印は矢印を付けない文言）
  },
  // 詳細パネル（§2.12）
  panel: {
    close: "×",
    closeLabel: "閉じる", // 「×」の読み上げ名
    share: (n: number, p: number) => `${n}人（全体の${p}%）`, // 分類のパネルの上部
    shareEmpty: "0人", // 今の人数が 0 のとき（「（全体の…）」を付けない）
    types: "この分類の4タイプ",
    typeName: (hiragana: string, shortLabel: string) => `${hiragana}\u3000${shortLabel}`, // 間は全角の空白（U+3000）
    members: "回答者", // 見出し。横の small は summary.count
    quadrantTag: (katakana: string, labelJa: string) => `${katakana}（${labelJa}）`, // キャラクターのパネルの丸いラベル
    typeLabel: (shortLabel: string) => `${shortLabel}タイプ`,
    characteristics: "特徴",
    aptitude: "適性", // 見出し。「{適性}に適性があります」は aptitudeHeadingPlain
  },
  // 回答者の一覧（§2.12）。0 人の文は CLASSIFICATION_EMPTY_MESSAGE
  members: {
    name: "お名前",
    occupation: "職業",
    team: "チーム",
    submittedAt: "受験日",
    phoneNumber: "電話番号",
    noName: "（未入力）",
    none: "—", // 職業・チーム・電話番号が無いとき
  },
} as const;

/** 変更ダイアログの区分のボタン（11-3 §2.15）。並びは 在籍・退職・求職者 */
const EDIT_STATUSES: readonly { readonly status: EmploymentStatus; readonly label: string }[] =
  Object.freeze(
    (["employed", "left", "candidate"] as const).map((status) =>
      Object.freeze({ status, label: EMPLOYMENT_STATUS_LABELS[status] }),
    ),
  );

/** 在籍・退職（M-08。11-3 §2.13〜§2.17・§2.20・§2.23・7 章）の文言 */
export const EMPLOYMENT_SCREEN_TEXTS = {
  // 見出し・説明（§2.13）
  title: "在籍・退職",
  description:
    "在籍している人と退職した人の一覧と、辞めやすいタイプの分析です。入社日・退職日は、各行の右端にある「変更」から入れられます。",
  // タブ（§2.13）。在籍者・退職者・求職者は名前の後ろに数（b）
  tabs: {
    an: "分析",
    stay: "在籍者",
    left: "退職者",
    seek: "求職者",
  },
  // 一覧（§2.14）。headers は見出しの行（「変更」の列は見出しなし）、labels は狭い幅でだけ見える値の前のラベル（§2.19）
  list: {
    headers: {
      name: "お名前",
      type: "タイプ",
      hiredOn: "入社日",
      leftOn: "退職日", // 退職者のタブ
      occupation: "職業", // 在籍者・求職者のタブ
      tenure: "勤続",
    },
    labels: {
      hiredOn: "入社",
      leftOn: "退職",
      occupation: "職業",
      tenure: "勤続",
    },
    noName: "（お名前なし）", // 氏名が空のとき
    none: "—", // 入社日・退職日・職業が無いとき
    edit: "変更",
    goList: "回答一覧を開く →",
  },
  // 一覧の 0 人（§2.14）。タブごとの 1 行目と、改行して共通の 2 行目（hint）
  empty: {
    stay: "在籍している人がいません。",
    left: "退職した人はまだいません。",
    seek: "面接だけの人（求職者）はまだいません。",
    hint: "ほかのタブの一覧にある「変更」で区分を変えると、ここに出てきます。",
  },
  // 勤続（§2.17。retention.ts の formatTenure が組み立てる。「{n}年{m}か月」は years と months をつなぐ）
  tenure: {
    months: (n: number) => `${n}か月`,
    years: (n: number) => `${n}年`,
    none: "—", // 計算できないとき
  },
  // 変更ダイアログ（§2.15）。invalidDate は参照元に無い検査の文（7 章の 1。依頼主の確認までは案）
  edit: {
    title: (name: string) => `${name}さん`, // 氏名が空なら「さん」
    description: "区分と、入社日・退職日を変えられます。わかる分だけでも大丈夫です。",
    statuses: EDIT_STATUSES,
    hiredOn: "入社日",
    leftOn: "退職日",
    cancel: "やめる",
    save: "保存する",
    leftBeforeHired: "退職日が入社日より前になっています。",
    invalidDate: "日付が正しくありません。",
  },
  // 通知（§2.20）
  toast: {
    saved: (name: string) => `${name}さんを保存しました`,
  },
  // 分析「辞めやすいタイプと勤続年数」（§2.16）
  analysis: {
    title: "辞めやすいタイプと勤続年数",
    teamPrefix: (teamLabel: string) => `${teamLabel}の`, // チームで絞っているときの説明の先頭（「Aチームの」「未設定の」）
    lead: "在籍中と退職した人を、キャラクター別に集計しています。回答者がいないタイプは省いています。",
    // 数字のカード（項目名・補足）。値の後ろの small は unit
    cards: {
      left: "退職した人",
      leftRate: (p: number) => `全体の ${p}%`, // 「全体の」と数の間に半角の空白
      stay: "在籍中の人",
      stayNote: "求職者は含みません",
      leftTenure: "平均の勤続（退職した人）",
      averageOf: (n: number) => `${n}人の平均`,
      stayTenure: "平均の勤続（在籍中）",
      averageOfToday: (n: number) => `${n}人の平均（今日まで）`,
      missing: "勤続未入力者",
      missingDetail: (hire: number, leave: number) => `入社日${hire}人／退職日${leave}人が未入力`,
      unit: "人",
    },
    // 注意書き（退職 0 人と 1〜2 人。3 人以上は出さない）
    notes: {
      noLeft:
        "退職として登録された人がまだいません。在籍者の一覧で「変更」を押し、区分を「退職」にすると、ここに出ます。",
      fewLeft: (n: number) =>
        `退職した人がまだ${n}人なので、割合は参考値です。人数が増えるほど、傾向が確かになります。`,
    },
    // タイプ別の表
    table: {
      type: "タイプ",
      stay: EMPLOYMENT_STATUS_LABELS.employed,
      left: EMPLOYMENT_STATUS_LABELS.left,
      rate: "退職の割合",
      leftTenure: "勤続（退職した人）",
      stayTenure: "勤続（在籍中）",
      percent: (p: number) => `${p}%`,
      reference: "参考", // 在籍 + 退職が 3 人未満のタイプ
      noRows: "回答者がいません", // 行が 1 つも無いとき
    },
    footnote:
      "勤続年数は、入社日から退職日（在籍中の人は今日）までで計算しています。入社日が入っていない人は、勤続の平均に入りません。人数が3人に満たないタイプには「参考」を付けています。",
  },
} as const;
