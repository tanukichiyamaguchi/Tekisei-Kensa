// 採点エンジンの主要な型（00 §3.4 をそのまま実装。名称変更不可）

/** 設問番号 1〜204。採点対象は 1〜144 */
export type QuestionNo = number;

/** 選択肢コード。1 = そう思う … 5 = そう思わない（00 §1.9） */
export type ChoiceCode = 1 | 2 | 3 | 4 | 5;

/** 回答の集合。Q1〜Q144 のキーを必ず含む。Q145〜Q204 は無視される */
export type AnswerMap = Readonly<Record<QuestionNo, ChoiceCode>>;

/** 配点属性 9 種（00 §1.9） */
export const SCORE_ATTRIBUTE_KEYS = [
  "score",
  "reliability",
  "social_plus",
  "social_minus",
  "score_important",
  "score_compat",
  "score_compat_minus",
  "score_type",
  "social_important",
] as const;
export type ScoreAttributeKey = (typeof SCORE_ATTRIBUTE_KEYS)[number];
export type ChoiceScoreAttributes = Readonly<Record<ScoreAttributeKey, number>>;

/** 16 尺度（00 §1.2 の順） */
export const TRAIT_KEYS = [
  "cooperativeness",
  "adaptability",
  "deliberateness",
  "humility",
  "reflectiveness",
  "rule_compliance",
  "persistence",
  "emotionality",
  "sensitivity",
  "self_esteem",
  "innovativeness",
  "activeness",
  "positiveness",
  "leadership",
  "creativity",
  "communication",
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type TraitScores = Readonly<Record<TraitKey, number>>;

/** 相性 5 軸（00 §1.3 の順） */
export const COMPATIBILITY_KEYS = [
  "adaptive_environment",
  "adaptive_work",
  "thinking_tendency",
  "decision_making",
  "stress_tolerance",
] as const;
export type CompatibilityKey = (typeof COMPATIBILITY_KEYS)[number];
export type CompatibilityScores = Readonly<Record<CompatibilityKey, number>>;

/** 資質 4 型（00 §1.4 の順 = 同点時の優先順） */
export const APTITUDE_KEYS = [
  "sensory_open",
  "environment_receptive",
  "self_actualizing",
  "inquiry_logical",
] as const;
export type AptitudeKey = (typeof APTITUDE_KEYS)[number];
export type AptitudeScores = Readonly<Record<AptitudeKey, number>>;

/** リスク 7 項目（00 §1.5 の順） */
export const RISK_KEYS = [
  "misconduct",
  "complaint",
  "mental_distress",
  "careless_mistake",
  "resignation_trouble",
  "communication_issue",
  "low_motivation",
] as const;
export type RiskKey = (typeof RISK_KEYS)[number];
export type RiskScores = Readonly<Record<RiskKey, number>>;

/** 適性タイプ 16 種（00 §1.6 の順 = 同点時の優先順） */
export const APTITUDE_TYPE_KEYS = [
  "attendant",
  "follower",
  "specialist",
  "creator",
  "professional",
  "generalist",
  "scientist",
  "pioneer",
  "conductor",
  "controller",
  "artist",
  "reviewer",
  "promoter",
  "actor",
  "receptionist",
  "freelancer",
] as const;
export type AptitudeTypeKey = (typeof APTITUDE_TYPE_KEYS)[number];
export type AptitudeTypeScores = Readonly<Record<AptitudeTypeKey, number>>;

/** ソーシャルスタイル 4 分類（00 §1.7 の順 = 同点時の優先順。表示順とは異なる） */
export const SOCIAL_STYLE_KEYS = ["driving", "expressive", "analytical", "amiable"] as const;
export type SocialStyleKey = (typeof SOCIAL_STYLE_KEYS)[number];
export type SocialStyleScores = Readonly<Record<SocialStyleKey, number>>;

/** 受検 1 回分の採点結果（results 文書の指標部分と 1 対 1。00 §2.1） */
export interface ScoreResult {
  readonly scoringVersion: string; // SCORING_VERSION
  readonly traits: TraitScores; // 0〜30
  readonly compatibility: CompatibilityScores; // 整数、負値あり
  readonly aptitudes: AptitudeScores; // 0 以上、1.25 刻み
  readonly aptitudeFirst: AptitudeKey;
  readonly aptitudeSecond: AptitudeKey;
  readonly risks: RiskScores; // ×5 後の値、負値あり
  readonly aptitudeTypeScores: AptitudeTypeScores;
  readonly aptitudeType: AptitudeTypeKey;
  readonly socialStyles: SocialStyleScores; // 計算値 −29〜29（表示レンジ 0〜30）、0.25 刻み、負値あり
  readonly socialStyle: SocialStyleKey;
  readonly reliability: number; // 0〜100
}

/** 評価 A〜E（00 §1.8） */
export type Grade = "A" | "B" | "C" | "D" | "E";

/** 立ち位置（00 §1.8） */
export const POSITION_KEYS = [
  "strong_leader",
  "cooperative_leader",
  "follower",
  "passive_follower",
  "unfit",
] as const;
export type PositionKey = (typeof POSITION_KEYS)[number];

/** チーム A〜Z */
export type TeamCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

/** 比較範囲（00 §1.8） */
export type ComparisonScope =
  { readonly kind: "organization" } | { readonly kind: "team"; readonly teamCode: TeamCode };

/** 比較計算の入力: 母集団は 16 尺度と 5 軸だけあればよい */
export interface PopulationMember {
  readonly traits: TraitScores;
  readonly compatibility: CompatibilityScores;
}

/** 比較計算の結果（Firestore に保存しない。00 §1.11 の 6 番） */
export interface ComparisonResult {
  readonly scope: ComparisonScope;
  readonly populationSize: number;
  readonly traitAverages: TraitScores; // 母集団平均（レーダーの比較対象系列）
  readonly traitDiffs: TraitScores; // |平均 − 受検者|
  readonly compatibilityAverages: CompatibilityScores;
  readonly axisDeviations: CompatibilityScores; // (受検者 − 平均) / 2 + 50
  readonly matchScore: number; // 合致度 0〜100
  readonly deviationScore: number; // 偏差値
  readonly grade: Grade;
  readonly position: PositionKey;
}
