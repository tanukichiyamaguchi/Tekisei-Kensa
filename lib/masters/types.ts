// マスタ定義の型（00 §3.5 をそのまま実装）
import type {
  AptitudeKey,
  AptitudeTypeKey,
  ChoiceCode,
  ChoiceScoreAttributes,
  CompatibilityKey,
  PositionKey,
  QuestionNo,
  RiskKey,
  ScoreAttributeKey,
  SocialStyleKey,
  TraitKey,
} from "@/lib/scoring/types";

export interface QuestionDefinition {
  readonly questionNo: QuestionNo;
  readonly text: string;
  readonly isActive: boolean; // 出題する（Q1〜Q144 のみ true）
  readonly isScored: boolean; // 採点に使う（Q1〜Q144 のみ true）
  readonly step: 1 | 2 | 3 | 4 | null; // 非出題は null
  readonly page: 1 | 2 | 3 | 4 | 5 | null;
}

/** 指標 1 つ分の加減算定義（付録B の式をデータ化したもの） */
export interface IndicatorTerm {
  readonly questionNo: QuestionNo;
  readonly attribute: ScoreAttributeKey;
  readonly sign: 1 | -1;
}
export interface IndicatorDefinition<K extends string> {
  readonly key: K;
  readonly terms: readonly IndicatorTerm[];
  readonly constant: number; // 16 尺度の +14、それ以外は 0
  readonly multiplier: number; // リスクの ×5、それ以外は 1
  readonly clampMin: number | null; // 資質の 0、それ以外は null
}

export interface TraitDefinition extends IndicatorDefinition<TraitKey> {
  readonly label: string; // 協力性
  readonly sortOrder: number; // レーダー軸順
}
export interface CompatibilityDefinition extends IndicatorDefinition<CompatibilityKey> {
  readonly label: string;
  readonly lowLabel: string; // 個人優先型
  readonly highLabel: string; // 組織優先型
  readonly sortOrder: number;
}
export interface AptitudeDefinition extends IndicatorDefinition<AptitudeKey> {
  readonly internalName: string; // 感性開放型
  readonly label: string; // 直感型
  readonly sortOrder: number; // 同点時の優先順
}
export interface RiskDefinition extends IndicatorDefinition<RiskKey> {
  readonly label: string; // 正式名
  readonly shortLabel: string; // 短縮名
  readonly aiLabel: string; // AI 入力ラベル
  readonly sortOrder: number;
}
export interface AptitudeTypeDefinition extends IndicatorDefinition<AptitudeTypeKey> {
  readonly label: string; // アテンダントタイプ
  readonly shortLabel: string; // アテンダント
  readonly socialStyle: SocialStyleKey;
  readonly characterName: string; // ハルカ
  readonly characterNameHiragana: string; // はるか
  readonly sortOrder: number; // 同点時の優先順
}
export interface SocialStyleDefinition {
  readonly key: SocialStyleKey;
  readonly labelEn: string; // Driving
  readonly labelKatakana: string; // ドライビング
  readonly labelJa: string; // 実行型
  readonly color: string; // rgba(149,112,161)
  readonly sortOrder: number; // 同点時の優先順
  readonly chartOrder: number; // レーダー軸順
}
export interface PositionDefinition {
  readonly key: PositionKey;
  readonly minDeviation: number | null;
  readonly maxDeviation: number | null; // 未満
  readonly label: string;
  readonly description: string;
}
export type ChoiceScoreTable = Readonly<Record<ChoiceCode, ChoiceScoreAttributes>>;
