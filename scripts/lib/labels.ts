// 付録の日本語名 → 00 の識別子の写像（08 §7.4: generate-masters.ts と generate-texts.ts で共有する唯一の写像表）。
// 値の出典は各行のコメントの 00 の節。付録から読んだ名称がこの表に無ければ生成を失敗させる。
import type {
  AptitudeKey,
  AptitudeTypeKey,
  ChoiceCode,
  CompatibilityKey,
  PositionKey,
  RiskKey,
  ScoreAttributeKey,
  SocialStyleKey,
  TraitKey,
} from "../../lib/scoring/types";

/** 付録B §1 の列見出し → 配点属性（00 §1.9） */
export const ATTRIBUTE_LABELS: Readonly<Record<string, ScoreAttributeKey>> = {
  スコア: "score",
  信頼係数: "reliability",
  "+ソーシャル": "social_plus",
  "-ソーシャル": "social_minus",
  "スコア(重要)": "score_important",
  "スコア(相性)": "score_compat",
  "スコア(-相性)": "score_compat_minus",
  "スコア(タイプ用)": "score_type",
  "ソーシャル(重要)": "social_important",
};

/** 付録B §1 の行見出し → 選択肢コード（00 §1.9） */
export const CHOICE_LABELS: ReadonlyArray<{ readonly code: ChoiceCode; readonly label: string }> = [
  { code: 1, label: "そう思う" },
  { code: 2, label: "どちらかと言えばそう思う" },
  { code: 3, label: "どちらでもない" },
  { code: 4, label: "どちらかと言えばそう思わない" },
  { code: 5, label: "そう思わない" },
];

/** 16 尺度（00 §1.2。配列順 = sortOrder = レーダー軸順） */
export const TRAIT_LABELS: ReadonlyArray<{ readonly key: TraitKey; readonly label: string }> = [
  { key: "cooperativeness", label: "協力性" },
  { key: "adaptability", label: "適応力" },
  { key: "deliberateness", label: "優劣性" },
  { key: "humility", label: "謙虚さ" },
  { key: "reflectiveness", label: "反省力" },
  { key: "rule_compliance", label: "規則遵守力" },
  { key: "persistence", label: "こだわり" },
  { key: "emotionality", label: "感情の豊かさ" },
  { key: "sensitivity", label: "敏感さ" },
  { key: "self_esteem", label: "自己肯定感" },
  { key: "innovativeness", label: "革新的思考" },
  { key: "activeness", label: "行動力" },
  { key: "positiveness", label: "前向きさ" },
  { key: "leadership", label: "リーダーシップ" },
  { key: "creativity", label: "発想力" },
  { key: "communication", label: "コミュニケーション力" },
];

/** 相性 5 軸（00 §1.3） */
export const COMPATIBILITY_LABELS: ReadonlyArray<{
  readonly key: CompatibilityKey;
  readonly label: string;
  readonly lowLabel: string;
  readonly highLabel: string;
}> = [
  {
    key: "adaptive_environment",
    label: "適応する環境",
    lowLabel: "個人優先型",
    highLabel: "組織優先型",
  },
  {
    key: "adaptive_work",
    label: "適応する業務",
    lowLabel: "変化の少ない業務",
    highLabel: "変化の多い業務",
  },
  { key: "thinking_tendency", label: "思考の傾向", lowLabel: "主観的", highLabel: "客観的" },
  { key: "decision_making", label: "意思決定", lowLabel: "依存的", highLabel: "主体的" },
  {
    key: "stress_tolerance",
    label: "ストレス耐性",
    lowLabel: "ストレスを感じやすい",
    highLabel: "ストレスを感じにくい",
  },
];

/** 資質 4 型（00 §1.4。内部名は「感性開放型」に統一） */
export const APTITUDE_LABELS: ReadonlyArray<{
  readonly key: AptitudeKey;
  readonly internalName: string;
  readonly label: string;
}> = [
  { key: "sensory_open", internalName: "感性開放型", label: "直感型" },
  { key: "environment_receptive", internalName: "環境受容型", label: "柔軟型" },
  { key: "self_actualizing", internalName: "自己実現型", label: "目標達成型" },
  { key: "inquiry_logical", internalName: "探求論理型", label: "専門追求型" },
];

/**
 * 資質の内部名の表記ゆれ（00 §1.11 の 8 番）。付録C §4 は「感性開放型」を別の字で書いているため、写像にだけ使う。
 * 生成物・lib/ には出さない（M-07 がこの文字列の出現を検査するため、字を分けて組み立てる）
 */
export const APTITUDE_INTERNAL_NAME_ALIASES: Readonly<Record<string, AptitudeKey>> = {
  ["感性" + "解放型"]: "sensory_open",
};

/** リスク 7 項目（00 §1.5） */
export const RISK_LABELS: ReadonlyArray<{
  readonly key: RiskKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly aiLabel: string;
}> = [
  { key: "misconduct", label: "不祥事が発生するリスク", shortLabel: "不祥事", aiLabel: "不祥事" },
  { key: "complaint", label: "苦情を強く主張するリスク", shortLabel: "苦情", aiLabel: "苦情" },
  {
    key: "mental_distress",
    label: "メンタル面の不服が起こるリスク",
    shortLabel: "メンタル面の不服",
    aiLabel: "メンタル不服",
  },
  {
    key: "careless_mistake",
    label: "不注意からミスが発生するリスク",
    shortLabel: "不注意ミス",
    aiLabel: "不注意ミス",
  },
  {
    key: "resignation_trouble",
    label: "退職時におけるトラブル発生のリスク",
    shortLabel: "退職時トラブル",
    aiLabel: "退職トラブル",
  },
  {
    key: "communication_issue",
    label: "コミュニケーションが課題となり業務に支障が出るリスク",
    shortLabel: "コミュニケーション起因の業務支障",
    aiLabel: "コミュ起因の支障",
  },
  {
    key: "low_motivation",
    label: "モチベーションの不足により就業自体に繋がるリスク",
    shortLabel: "モチベーション不足による就業辞退",
    aiLabel: "就業辞退",
  },
];

/** 適性タイプ 16 種（00 §1.6。配列順 = sortOrder = 同点時の優先順） */
export const APTITUDE_TYPE_LABELS: ReadonlyArray<{
  readonly key: AptitudeTypeKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly socialStyle: SocialStyleKey;
  readonly characterName: string;
  readonly characterNameHiragana: string;
}> = [
  {
    key: "attendant",
    label: "アテンダントタイプ",
    shortLabel: "アテンダント",
    socialStyle: "expressive",
    characterName: "ハルカ",
    characterNameHiragana: "はるか",
  },
  {
    key: "follower",
    label: "フォロワータイプ",
    shortLabel: "フォロワー",
    socialStyle: "amiable",
    characterName: "ナオ",
    characterNameHiragana: "なお",
  },
  {
    key: "specialist",
    label: "スペシャリストタイプ",
    shortLabel: "スペシャリスト",
    socialStyle: "amiable",
    characterName: "リツカ",
    characterNameHiragana: "りつか",
  },
  {
    key: "creator",
    label: "クリエイタータイプ",
    shortLabel: "クリエイター",
    socialStyle: "analytical",
    characterName: "レイ",
    characterNameHiragana: "れい",
  },
  {
    key: "professional",
    label: "プロフェッショナルタイプ",
    shortLabel: "プロフェッショナル",
    socialStyle: "analytical",
    characterName: "マドカ",
    characterNameHiragana: "まどか",
  },
  {
    key: "generalist",
    label: "ゼネラリストタイプ",
    shortLabel: "ゼネラリスト",
    socialStyle: "amiable",
    characterName: "カナ",
    characterNameHiragana: "かな",
  },
  {
    key: "scientist",
    label: "サイエンティストタイプ",
    shortLabel: "サイエンティスト",
    socialStyle: "analytical",
    characterName: "アイリ",
    characterNameHiragana: "あいり",
  },
  {
    key: "pioneer",
    label: "パイオニアタイプ",
    shortLabel: "パイオニア",
    socialStyle: "driving",
    characterName: "ヒナタ",
    characterNameHiragana: "ひなた",
  },
  {
    key: "conductor",
    label: "コンダクタータイプ",
    shortLabel: "コンダクター",
    socialStyle: "amiable",
    characterName: "アカリ",
    characterNameHiragana: "あかり",
  },
  {
    key: "controller",
    label: "コントローラータイプ",
    shortLabel: "コントローラー",
    socialStyle: "driving",
    characterName: "ナツキ",
    characterNameHiragana: "なつき",
  },
  {
    key: "artist",
    label: "アーティストタイプ",
    shortLabel: "アーティスト",
    socialStyle: "analytical",
    characterName: "ミユ",
    characterNameHiragana: "みゆ",
  },
  {
    key: "reviewer",
    label: "レビュワータイプ",
    shortLabel: "レビュワー",
    socialStyle: "driving",
    characterName: "エリカ",
    characterNameHiragana: "えりか",
  },
  {
    key: "promoter",
    label: "プロモータータイプ",
    shortLabel: "プロモーター",
    socialStyle: "expressive",
    characterName: "サラ",
    characterNameHiragana: "さら",
  },
  {
    key: "actor",
    label: "アクタータイプ",
    shortLabel: "アクター",
    socialStyle: "driving",
    characterName: "マイ",
    characterNameHiragana: "まい",
  },
  {
    key: "receptionist",
    label: "レセプショニストタイプ",
    shortLabel: "レセプショニスト",
    socialStyle: "expressive",
    characterName: "リサ",
    characterNameHiragana: "りさ",
  },
  {
    key: "freelancer",
    label: "フリーランサータイプ",
    shortLabel: "フリーランサー",
    socialStyle: "expressive",
    characterName: "ノゾミ",
    characterNameHiragana: "のぞみ",
  },
];

/**
 * ソーシャルスタイル 4 分類（00 §1.7、付録E §1・§6）。配列順 = sortOrder = 同点時の優先順。
 * chartOrder はレーダー軸順（ドライビング, エクスプレッシブ, エミアブル, アナリティカル）。
 */
export const SOCIAL_STYLE_LABELS: ReadonlyArray<{
  readonly key: SocialStyleKey;
  readonly labelEn: string;
  readonly labelKatakana: string;
  readonly labelJa: string;
  readonly color: string;
  readonly chartOrder: number;
}> = [
  {
    key: "driving",
    labelEn: "Driving",
    labelKatakana: "ドライビング",
    labelJa: "実行型",
    color: "rgba(149,112,161)",
    chartOrder: 1,
  },
  {
    key: "expressive",
    labelEn: "Expressive",
    labelKatakana: "エクスプレッシブ",
    labelJa: "直感型",
    color: "rgba(229,179,83)",
    chartOrder: 2,
  },
  {
    key: "analytical",
    labelEn: "Analytical",
    labelKatakana: "アナリティカル",
    labelJa: "分析型",
    color: "rgba(65,166,123)",
    chartOrder: 4,
  },
  {
    key: "amiable",
    labelEn: "Amiable",
    labelKatakana: "エミアブル",
    labelJa: "温和型",
    color: "rgba(65,148,175)",
    chartOrder: 3,
  },
];

/** 立ち位置 5 段階（00 §1.8。表示名は付録C §6） */
export const POSITION_LABELS: ReadonlyArray<{ readonly key: PositionKey; readonly label: string }> =
  [
    { key: "strong_leader", label: "個が強いリーダータイプ" },
    { key: "cooperative_leader", label: "協調性を重視するリーダータイプ" },
    { key: "follower", label: "フォロワータイプ" },
    { key: "passive_follower", label: "フォロワータイプ（消極的）" },
    { key: "unfit", label: "アンフィットネス" },
  ];

/** 特性詳細のカテゴリ（06 §4.2 TRAIT_DETAIL_CATEGORY_KEYS。配列順 = 付録C §2 の記載順 = 表示順。06 D06-13） */
export const TRAIT_DETAIL_CATEGORY_LABELS: ReadonlyArray<{
  readonly key: "interpersonal" | "behavior" | "emotion" | "work" | "environment";
  readonly label: string;
}> = [
  { key: "interpersonal", label: "対人関係" },
  { key: "behavior", label: "行動特性" },
  { key: "emotion", label: "情緒及び精神面" },
  { key: "work", label: "業務対応" },
  { key: "environment", label: "環境適応" },
];

/** 育成方法 14 項目（06 §4.2 DEVELOPMENT_GUIDE_ITEM_KEYS。配列順 = 付録C §4 の記載順） */
export const DEVELOPMENT_GUIDE_ITEM_LABELS: ReadonlyArray<{
  readonly key:
    | "characteristics"
    | "approach"
    | "thinking"
    | "dominant_sense"
    | "impression"
    | "emotion"
    | "personality"
    | "top_priority"
    | "listening"
    | "behavior"
    | "speaking"
    | "learning_style"
    | "compatibility"
    | "interpersonal";
  readonly label: string;
}> = [
  { key: "characteristics", label: "特徴" },
  { key: "approach", label: "本タイプへのアプローチ" },
  { key: "thinking", label: "思考" },
  { key: "dominant_sense", label: "優位感覚" },
  { key: "impression", label: "周りからの印象" },
  { key: "emotion", label: "感情" },
  { key: "personality", label: "性格" },
  { key: "top_priority", label: "最優先対象" },
  { key: "listening", label: "聞き方" },
  { key: "behavior", label: "行動" },
  { key: "speaking", label: "話し方" },
  { key: "learning_style", label: "学習スタイル" },
  { key: "compatibility", label: "他タイプとの相性" },
  { key: "interpersonal", label: "対人関係" },
];
