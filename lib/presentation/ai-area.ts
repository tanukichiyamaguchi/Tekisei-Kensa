// AI 解説の領域（結果詳細の #ai。11-6）の表示の規則（11-6 §3.7.10 の ai-area.ts）。結果詳細のページと AI 解説の部品
// （components/admin/result/ai/）が使う純関数で、React・window・Next.js・Firebase と lib/services・lib/db に触れない
// （Client Component から import する）。初めに選ぶタブ（initialAiTab。§2.2）、採用向けの判定チップの色（recruitmentChipTone。
// §2.4.4）、パネルに出す部品（panelParts。§2.3.5）。育成・定着のチップの色（trainingChipTone）と仮説の札（hypothesisBadge）は
// PR-7.10、「{氏名}」の置き換え（replaceNamePlaceholder）は PR-7.11b が足す
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type { AiAnalysisOutput, AiGenerationStatus } from "@/lib/ai/types";

/**
 * 初めに選ぶタブ（§2.2）。画面の状態の aiTab（URL の ai。無ければ recruitment）が出せるタブならそれ、出せないタブなら出せるタブの
 * 先頭。出せるタブが無い（経年比較のタブを出さない間の責任者の受験。PR-7.11a から起きない。11-6 §4.4）ときは null で、領域を描かない
 */
export function initialAiTab(
  visibleTabs: readonly AiAnalysisKind[],
  requested: AiAnalysisKind,
): AiAnalysisKind | null {
  if (visibleTabs.includes(requested)) return requested;
  return visibleTabs[0] ?? null;
}

/** 判定チップの色の段階（§2.4.4。別表C の .vchip のクラス）。点は参照元の 4 色、値の文字は K-49 の色（§2.17 の K-49 の表の 7〜9） */
export type ChipTone = "good" | "warn" | "mid" | "bad";

/** 採用向けの判定チップ（出力の verdict のキー。§2.8.1） */
export type RecruitmentChipKind = keyof AiAnalysisOutput["verdict"];

/** 採用向けの判定チップの順（§2.4.3 の 5: 即戦力性 → 離職リスク → 総合判定） */
export const RECRUITMENT_CHIP_ORDER: readonly RecruitmentChipKind[] = Object.freeze([
  "sokusenryoku",
  "teichaku_risk",
  "sougou",
]);

/**
 * 採用向けの判定チップの色の規則（§2.4.4 の表。参照元定義の HTML A の cls）。表に書いた値のほか（即戦力性と離職リスクの「中」、
 * 総合判定の「条件付きで推奨」、空、出力のスキーマに無い値）は mid。離職リスクの「やや高い」はスキーマに無い値だが、参照元の規則
 * どおり warn に残す
 */
const RECRUITMENT_CHIP_RULES: Readonly<
  Record<
    RecruitmentChipKind,
    Readonly<Partial<Record<Exclude<ChipTone, "mid">, readonly string[]>>>
  >
> = {
  sokusenryoku: { good: ["非常に高い", "高い"], warn: ["低い", "非常に低い"] },
  teichaku_risk: { good: ["低い", "非常に低い"], warn: ["高い", "非常に高い", "やや高い"] },
  sougou: { good: ["推奨"], warn: ["要検討"], bad: ["非推奨"] },
};

/**
 * 採用向けの判定チップの色（§2.4.4）。値の空白（半角・全角・改行）を除いてから表の値と比べる（\s は全角の空白 U+3000 と改行を
 * 含む）。値が空のときは mid（表示は「-」。§2.4.3）
 */
export function recruitmentChipTone(kind: RecruitmentChipKind, value: string): ChipTone {
  const compact = value.replace(/\s/g, "");
  const rules = RECRUITMENT_CHIP_RULES[kind];
  for (const tone of ["good", "warn", "bad"] as const) {
    if (rules[tone]?.includes(compact)) return tone;
  }
  return "mid";
}

/** 生成の入口（案内・生成ボタン・生成中・失敗の枠。§2.1 の表の .ai-start）を持つ種類。経年比較は 11-7 の確認画面から作る */
export type AiStartKind = Exclude<AiAnalysisKind, "longitudinal">;

/** 育成・定着の 8 項目の入力欄の状態（§2.5.3）。選べる・選べない（生成中）・保存した値を出して選べない（生成済み） */
export type TrainingContextMode = "editable" | "locked" | "saved";

/** パネルに出す部品（§2.3.5 の表。上からの並びは §2.4.1・§2.5.1） */
export interface AiPanelParts {
  readonly intro: boolean; // 生成前の案内（§2.3.1）
  readonly context: TrainingContextMode | null; // 育成・定着の 8 項目（§2.5.3）。採用向けは null
  readonly failure: boolean; // 失敗の枠（T-18 と理由の文。§2.3.4）
  readonly button: boolean; // 生成ボタン（§2.3.2）
  readonly generating: boolean; // 生成中（§2.3.3）
  readonly timeout: boolean; // 読み直しが 10 分たっても終わらない（T-29。生成中の表示の代わりに出す。§2.3.4）
  readonly view: boolean; // 表示（採用向けは §2.4.3、育成・定着は §2.5.5）
}

/**
 * パネルに出す部品（§2.3.5）。status はその種類の状態、busy はこの画面の生成の要求・読み直しの最中か、pollingTimedOut は読み直しが
 * 10 分（AI_POLL_MAX_MS）たっても generating のままだったか。
 * - 生成中（status が generating か、busy）: 案内と生成中（10 分を過ぎたら生成中の代わりに T-29 の枠）。生成ボタンと失敗の枠は
 *   出さない（生成を始めるとすぐボタンを隠して生成中を出す。§2.3.2）
 * - completed: 表示だけ（busy が残っていても表示を出す）
 * - failed: 案内・失敗の枠・生成ボタン（同じ文言のボタンで作り直す。§2.3.4）
 * - not_generated: 案内・生成ボタン
 * - 育成・定着の 8 項目は、生成中は選べない、completed は保存した値で選べない、ほかは選べる（採用向けは null）
 */
export function panelParts(
  kind: AiStartKind,
  state: {
    readonly status: AiGenerationStatus;
    readonly busy: boolean;
    readonly pollingTimedOut: boolean;
  },
): AiPanelParts {
  const completed = state.status === "completed";
  const working = !completed && (state.status === "generating" || state.busy);
  const ready = !completed && !working; // not_generated・failed で、この画面の要求も無い
  const context: TrainingContextMode = completed ? "saved" : working ? "locked" : "editable";
  return Object.freeze({
    intro: !completed,
    context: kind === "training" ? context : null,
    failure: ready && state.status === "failed",
    button: ready,
    generating: working && !state.pollingTimedOut,
    timeout: working && state.pollingTimedOut,
    view: completed,
  });
}
