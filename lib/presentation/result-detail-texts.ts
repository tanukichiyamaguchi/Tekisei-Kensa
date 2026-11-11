// 結果詳細（M-05）の画面の文言（11-4 §2.20 が正。PR-7.8a の分: 枠・見出し・受験情報の 1 行・目次・比較なしの文言・折りたたみ・
// 概要・16の特性・特性の詳細・リスク・組織との相性・人物像・2 つのポップアップ）。JSX に直書きせず、この定数を使う（06 §10.5）。
// 差し込みのある文言は関数にする。K-19 で置き換えた文言は、参照元の原文をコメントに残す（11-4 §0.5）。「〜」は波ダッシュ（U+301C）、
// 「—」は全角ダーシ（U+2014）、「＞」と空白は全角（空白は \u3000 と書く）で、参照元の文字のまま書く（§2.2）。
// 「回答一覧に戻る」（B-02。404 の画面）・「ダウンロード」（B-03。ダウンロードのポップアップの題）・見出しの文（T-01 の resultTitle。
// PDF のページの見出し）は結果詳細の部品の外でも使うので ADMIN_TEXTS を参照し、比較組織の名前（「組織全体」「Aチーム」）は
// comparison-view.ts の formatScopeLabel、リスクの段階の名前（低い・やや低い・注意・高い）は colors.ts の RISK_LEVEL_STYLES の label
// を使う（ここに写さない）。付録C の文（タイプ・特性の説明・項目詳細・
// 特性の詳細・立ち位置）は lib/masters/texts から buildResultDetailView と comparison-view.ts が読む。画面の部品（Client Component）が
// 読むので、文言マスタ（lib/masters/texts）を読まない（11-4 §2.21）。依頼主の確認が要る文言は無い（11-4 7 章）。
// 育て方・接し方の文言（LEARN_ITEM_GROUPS・STYLE_QUADRANTS を含む）は PR-7.8b が足す
import { ADMIN_TEXTS } from "./admin-texts";
import type { TraitSortOrder } from "./result-detail-rules";
import type { ResultSectionId } from "./result-view-state";
import type { TraitDetailCategoryKey } from "@/lib/masters/texts/types";
import type { RiskKey, TraitKey } from "@/lib/scoring/types";

/** 凡例の「本人」（16の特性と組織との相性。氏名は出さない。result-M2） */
const SUBJECT = "本人";

/** 凡例の「{比較組織名}の平均（{n}人）」（16の特性と組織との相性。§2.6） */
const averageLegend = (scopeLabel: string, n: number) => `${scopeLabel}の平均（${n}人）`;

export const RESULT_DETAIL_TEXTS = {
  // 枠と見出しの塊（§2.3）
  backToResults: ADMIN_TEXTS.backToResults, // 枠の上の行のリンク（B-02）
  title: (name: string) => ADMIN_TEXTS.resultTitle(name), // h1（T-01。PDF の見出しも同じ関数。§2.3.2）
  similarity: "類似分析", // 1 段目のボタン（押したときは 11-5）
  similaritySub: "\u3000似た結果の人を探す", // 「類似分析」の後ろ（全角空白から）
  scopeSelect: "比較組織", // 比較組織のプルダウンの読み上げの名前（見えるラベルは付けない。§2.3.2）
  selectComparison: "比較組織を選択", // プルダウンの未選択の表示（T-02 を admin-texts.ts から移す）
  download: ADMIN_TEXTS.download, // ボタン（B-03。ダウンロードのポップアップの題でも使う）
  percent: (n: number) => `${n}%`, // 「NN%」（受験情報の 1 行の信頼係数・リスクの行・注意したいリスク。n は表示値）
  // 受験情報の 1 行（§2.4）
  meta: {
    label: "受験の情報", // 読み上げの名前
    examDate: "受験日",
    occupation: "職業",
    type: "タイプ",
    reliability: "信頼係数",
    note: "結果は参考程度に", // 丸める前の値が 80 未満のとき値の後ろに足す
  },
  // 目次（§2.5）。セクションのリンクの文字は RESULT_SECTIONS の title
  toc: {
    label: "このページの目次", // nav の読み上げの名前
    heading: "目次", // 固定でないときだけ出す
    ai: "AI解説", // 行き先 ai（11-6）
    top: "↑ 先頭へ", // 固定の状態のときだけ出す
    topLabel: "ページの先頭へ戻る", // 「↑ 先頭へ」の読み上げの名前
    name: (name: string) => `${name} さん`, // 固定の状態の氏名の欄の上の行
    examDate: (examDate: string) => `${examDate} 受験`, // 同じ欄の下の行（受験日は §2.4 と同じ形）
  },
  // 比較なしの文言（§2.6。概要の組織内のポジション・概要の組織との合致度・組織との相性の凡例の 3 か所）
  noComparison: {
    none: "右上で比較組織を選ぶと表示されます", // 未選択・失敗
    loading: "データを読み込んでいます", // 読み込み中（アプリだけの状態。K-31 ④）
    empty: (scopeLabel: string) => `「${scopeLabel}」には比べられる回答がありません`, // 0 人
  },
  // 折りたたみ（§2.16）
  fold: {
    close: "たたむ", // 開いているとき
    open: "ひらく", // たたんでいるとき
    mark: "▴", // 矢印（たたんでいるときは 180° 回す）
    label: "この項目を開閉", // ボタンの読み上げの名前
  },
  // 概要（§2.7）
  overview: {
    typeLabel: "タイプ",
    aptitude: (aptitude: string) => `${aptitude}に適性があります。`,
    tags: { style: "接し方", learn: "育て方", sense: "優位感覚" }, // タグの名前（値はタグの後ろ）
    position: "組織内のポジション",
    none: "—", // 比較なしの評価の箱と合致度（U+2014）
    match: "組織との合致度",
    percentSign: "%", // 合致度・信頼係数の数字のすぐ後の小さい「%」
    matchNote: (scopeLabel: string, n: number) => `${scopeLabel}（${n}人）と比べた近さ`,
    reliability: "信頼係数",
    reliabilityLow: "結果は参考程度に見てください", // 表示値が 80 未満
    reliabilityGood: "回答は信頼できます", // 表示値が 80 以上
    highest: "いちばん高い特性",
    lowest: "いちばん低い特性",
    risk: "注意したいリスク",
    good: "良い面", // 札
    caution: "注意", // 札
    moreHigh: "ほかの特性が高い場合を見る\u3000＞", // 全角空白と全角の「＞」まで文言
    moreLow: "ほかの特性が低い場合を見る\u3000＞",
    big: (label: string, value: string) => `${label}\u3000${value}`, // 「{特性名}{全角空白}{点数}」（点数は小数第 1 位の表示）
  },
  // 16の特性（§2.8）と特性の詳細（§2.9）
  traits: {
    subject: SUBJECT,
    average: averageLegend,
    sort: {
      score: "点数の高い順",
      diff: "平均との差",
      def: "項目順",
    } satisfies Readonly<Record<TraitSortOrder, string>>,
    helpNote: "項目をタップすると、どんな力かの説明が出ます。",
    // 項目の説明の枠（§2.8.4）と吹き出しの 2 行目（§2.8.3）の「本人 {値}点」（値は小数第 1 位の表示）。吹き出しでは「●」と文の間に
    // 半角の空白を 1 つ置く（§2.8.3）
    subjectPoints: (value: string) => `本人 ${value}点`,
    legendSubject: "本人の点数", // 2 つ目の凡例
    legendAverage: (scopeLabel: string) => `サロン平均（${scopeLabel}）`, // 参照元: 医院平均（{比較組織}）。K-19
    legendAverageNone: "サロン平均（右上で比較組織を選ぶと表示されます）", // 比較あり以外。参照元: 医院平均（…）。K-19
    highest: "最も高い", // 札と凡例
    lowest: "最も低い",
    scale: ["0", "15", "30"], // 目盛の行
    radarLabel: "16の特性レーダーチャート", // レーダーの読み上げの名前
    tipMark: "●", // 吹き出しの印（記号だけの印。意味は隣の文字で伝える）
    // 吹き出しの 3 行目（比較ありのとき）。o は平均の小数第 1 位の表示、d は formatTooltipDiff。参照元: 医院平均 …。K-19
    tipAverage: (average: string, diff: string) => `サロン平均 ${average}点（差 ${diff}）`,
    detailsHeading: "特性の詳細", // カードの下の小見出し（§2.9）
  },
  // リスク（§2.10）。段階の名前は RISK_LEVEL_STYLES の label、表示名は RISK_RESULT_LABELS
  risk: {
    note: "色分けの目安：20％未満 低い／20〜40％ やや低い／40〜60％ 注意／60％以上 高い", // ％は全角
  },
  // 組織との相性（§2.11）
  fit: {
    subject: SUBJECT,
    average: averageLegend,
    same: "組織とほぼ同じ",
    lean: (word: string) => `組織より「${word}」寄り`,
    position: (name: string) => `組織内のポジション：${name}`,
    // 線の行（role="img"）の読み上げの名前。position は本人の印の位置（0〜100 に収めた値）。今の相性スライダーと同じ文（06 1.10 版
    // §6.6。画面には数値を出さない。§2.11・§2.21）
    trackLabel: (axis: string, left: string, right: string, position: number) =>
      `${axis}: ${left} から ${right} のうち ${position}`,
  },
  // 人物像（§2.12）
  profile: {
    characteristics: "特徴",
    suitableJobs: "向いている仕事",
    advice: "本人へのアドバイス",
  },
  // ほかの特性が高い／低い場合の 2 つのポップアップ（§2.15）
  popup: {
    high: "項目のポイントが大きい場合の特性",
    low: "項目のポイントが小さい場合の特性",
    item: "項目",
    positive: "ポジティブな面",
    negative: "ネガティブな面",
    close: "閉じる", // 閉じるボタンの読み上げの名前
  },
} as const;

/** リスクの表示名（11-4 §2.10。参照元の名前で、00 §1.5 の正式名・短縮名・AI 入力ラベルとは別の文言） */
export const RISK_RESULT_LABELS: Readonly<Record<RiskKey, string>> = Object.freeze({
  misconduct: "不祥事が発生する",
  complaint: "苦情を強く主張する",
  mental_distress: "メンタル面の不服が起こる",
  careless_mistake: "不注意からミスが発生する",
  resignation_trouble: "退職時におけるトラブル発生",
  communication_issue: "コミュニケーションが原因で業務に支障がでる",
  low_motivation: "モチベーションの不足により就業辞退に繋がる",
});

/** 新しいレイアウトの 7 セクション（§2.1・§2.2） */
export interface ResultSectionText {
  readonly id: ResultSectionId;
  readonly title: string; // 見出し（h2。目次のリンクの文字にも使う。§2.5）
  readonly description: string; // 見出しの右の説明（16の特性は比較あり以外の状態の文）
  readonly descriptionReady: string; // 比較ありのときの説明（16の特性だけ文が変わる。ほかは description と同じ文）
}

function section(
  id: ResultSectionId,
  title: string,
  description: string,
  descriptionReady = description,
): ResultSectionText {
  return Object.freeze({ id, title, description, descriptionReady });
}

/** 7 セクションの id・見出し・説明（RESULT_SECTION_IDS の順。§2.2 の表） */
export const RESULT_SECTIONS: readonly ResultSectionText[] = Object.freeze([
  section("rs-ov", "概要", "どんな人で、組織の中でどこに位置するか"),
  section(
    "rs-tr",
    "16の特性",
    "0〜30点。右上で比較組織を選ぶと平均も表示",
    "0〜30点。線は比較組織の平均",
  ),
  section("rs-rk", "リスク", "起こりやすさ。高い順に表示"),
  section("rs-fit", "組織との相性", "5つの軸で、比較組織と比べてどちら寄りか"),
  section("rs-pf", "人物像", "性格と、向いている仕事"),
  section("rs-ln", "育て方", "伸びやすい学び方と、関わり方"),
  section("rs-ss", "接し方", "ソーシャルスタイルから見た、伝わりやすい関わり方"),
]);

/** 線のアイコンの名前（11-4 §2.19・別表E の 25。形は components/admin/result/result-icons.tsx） */
export const RESULT_ICON_NAMES = [
  "users",
  "refresh",
  "trend",
  "heart",
  "undo",
  "shield",
  "target",
  "smile",
  "pulse",
  "sun",
  "bulb",
  "zap",
  "spark",
  "flag",
  "palette",
  "chat",
  "brief",
  "globe",
  "book",
  "ear",
  "down",
  "alert",
  "back",
  "download",
  "close",
] as const;
export type ResultIconName = (typeof RESULT_ICON_NAMES)[number];

/** 16の特性のアイコン（§2.19。一覧の名前の左の .tic） */
export const TRAIT_ICONS: Readonly<Record<TraitKey, ResultIconName>> = Object.freeze({
  cooperativeness: "users",
  adaptability: "refresh",
  deliberateness: "trend",
  humility: "heart",
  reflectiveness: "undo",
  rule_compliance: "shield",
  persistence: "target",
  emotionality: "smile",
  sensitivity: "pulse",
  self_esteem: "sun",
  innovativeness: "bulb",
  activeness: "zap",
  positiveness: "spark",
  leadership: "flag",
  creativity: "palette",
  communication: "chat",
});

/** 特性の詳細のカードのアイコン（§2.9。見出しの .cic と右下の透かし .wm） */
export const DETAIL_CATEGORY_ICONS: Readonly<Record<TraitDetailCategoryKey, ResultIconName>> =
  Object.freeze({
    interpersonal: "users",
    behavior: "zap",
    work: "brief",
    environment: "globe",
    emotion: "heart",
  });
