// PDF の restricted モードで非表示にする項目（07 §9.5、06 §3.5.11）
export type PdfMode = "full" | "restricted";

export interface PdfSectionVisibility {
  readonly showGrade: boolean; // 概要の評価の箱 rs-hyo（11-4 §2.18）
  readonly showMatchScore: boolean; // 概要の組織との合致度のカード rs-gat
  readonly showRisks: boolean; // 概要の注意したいリスクのカード rs-risk1 とリスクのセクション rs-rk（目次の「リスク」も）
  readonly showPosition: boolean; // 組織内のポジション。06 D06-26: restricted でも true（11-4 の部品はいつも描く。K-15）
  readonly showAiAnalysis: boolean; // AI 解説の領域 ai（目次の「AI解説」も）。completed かつ full のときのみ true
}

/** 画面（結果詳細）と同じ表示 */
export const FULL_VISIBILITY: PdfSectionVisibility = {
  showGrade: true,
  showMatchScore: true,
  showRisks: true,
  showPosition: true,
  showAiAnalysis: true,
};

export function visibilityForMode(mode: PdfMode, aiCompleted: boolean): PdfSectionVisibility {
  const restricted = mode === "restricted";
  return {
    showGrade: !restricted,
    showMatchScore: !restricted,
    showRisks: !restricted,
    // D06-26（依頼主確認事項）: 立ち位置は付録E §7 の非表示対象「評価・合致度・リスク」に含まれないと解釈し、
    // restricted でも印字する。既存 PDF での扱いが確認でき非表示と分かった場合はここを `!restricted` に変える
    showPosition: true,
    // D07-15: AI 解説はリスク値の引用が必須（付録D §3）のため restricted では掲載しない。
    // 依頼主が「restricted でも掲載する」と確認した場合のみ `aiCompleted` に変更する
    showAiAnalysis: aiCompleted && !restricted,
  };
}
