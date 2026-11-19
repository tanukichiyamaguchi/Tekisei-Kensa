// AI 解説の領域（結果詳細の #ai。11-6）の表示の規則（11-6 §3.7.10 の ai-area.ts）。結果詳細のページと AI 解説の部品
// （components/admin/result/ai/）が使う純関数で、React・window・Next.js・Firebase・Zod と lib/services・lib/db に触れない
// （Client Component から import する。育成・定着の 8 項目は lib/masters/training-context.ts の定数だけを読む）。初めに選ぶタブ
// （initialAiTab。§2.2）、採用向けの判定チップの色（recruitmentChipTone。§2.4.4）、育成・定着の判定チップの色（trainingChipTone）と
// 原因の札（hypothesisBadge。§2.5.5）、パネルに出す部品（panelParts。§2.3.5）、育成・定着の 8 項目の入力欄の並びと選択肢
// （TRAINING_CONTEXT_ROWS。§2.5.3）と、下書きと未選択の確かめ（§2.5.4）。「{氏名}」の置き換え（replaceNamePlaceholder）は PR-7.11b が
// 足す
import { AI_TEXTS } from "./ai-texts";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import type {
  AiAnalysisOutput,
  AiGenerationStatus,
  HypothesisLevel,
  TrainingAiOutput,
} from "@/lib/ai/types";
import {
  TRAINING_CONTEXT_ITEMS,
  TRAINING_CONTEXT_KEYS,
  type TrainingContext,
  type TrainingContextKey,
} from "@/lib/masters/training-context";

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
 * 判定チップの値から空白（半角・全角・改行）を除く（表の値と比べる前に。参照元定義の HTML A・HTML B の cls。§2.4.4・§2.5.5）。
 * \s は全角の空白 U+3000 と改行を含む
 */
function withoutSpaces(value: string): string {
  return value.replace(/\s/g, "");
}

/**
 * 採用向けの判定チップの色（§2.4.4）。値の空白（半角・全角・改行）を除いてから表の値と比べる。値が空のときは mid（表示は「-」。
 * §2.4.3）
 */
export function recruitmentChipTone(kind: RecruitmentChipKind, value: string): ChipTone {
  const compact = withoutSpaces(value);
  const rules = RECRUITMENT_CHIP_RULES[kind];
  for (const tone of ["good", "warn", "bad"] as const) {
    if (rules[tone]?.includes(compact)) return tone;
  }
  return "mid";
}

/** 育成・定着の判定チップ（出力の verdict のキー。§2.8.2） */
export type TrainingChipKind = keyof TrainingAiOutput["verdict"];

/** 育成・定着の判定チップの順（§2.5.5 の 2: 期待役割へのマッチ度 → 離職リスク → サポートの必要度） */
export const TRAINING_CHIP_ORDER: readonly TrainingChipKind[] = Object.freeze([
  "match",
  "risk",
  "support",
]);

/** 育成・定着の判定チップの色の段階（§2.5.5。別表C の C.5 の .chip のクラス）。bad は使わない */
export type TrainingChipTone = Exclude<ChipTone, "bad">;

/**
 * 育成・定着の判定チップの色の規則（§2.5.5 の表。参照元定義の HTML B の clsMatch・cls）。期待役割へのマッチ度は高いほど good、
 * 離職リスクとサポートの必要度は低いほど good。表に書いた値のほか（「中」、空、出力のスキーマに無い値）は mid。採用向けの離職
 * リスクの「やや高い」（warn。§2.4.4）は育成・定着の表に無いので mid
 */
const TRAINING_CHIP_RULES: Readonly<
  Record<TrainingChipKind, Readonly<Record<Exclude<TrainingChipTone, "mid">, readonly string[]>>>
> = {
  match: { good: ["非常に高い", "高い"], warn: ["低い", "非常に低い"] },
  risk: { good: ["低い", "非常に低い"], warn: ["非常に高い", "高い"] },
  support: { good: ["低い", "非常に低い"], warn: ["非常に高い", "高い"] },
};

/**
 * 育成・定着の判定チップの色（§2.5.5）。値の空白（半角・全角・改行）を除いてから表の値と比べる。値が空のときは mid（表示は
 * 「-」）
 */
export function trainingChipTone(kind: TrainingChipKind, value: string): TrainingChipTone {
  const compact = withoutSpaces(value);
  const rules = TRAINING_CHIP_RULES[kind];
  for (const tone of ["good", "warn"] as const) {
    if (rules[tone].includes(compact)) return tone;
  }
  return "mid";
}

/** 育成・定着の原因の札の色の段階（§2.5.5 の 3。別表C の C.5 の .hk.hi・.hk.mi・.hk.lo） */
export type HypothesisTone = "hi" | "mi" | "lo";

/** 育成・定着の原因の札（文言と色の段階） */
export interface HypothesisBadge {
  readonly text: string;
  readonly tone: HypothesisTone;
}

/** 原因の確からしさ（出力の level。§2.8.2）ごとの札の色の段階。ほかの値は lo */
const HYPOTHESIS_TONES: Readonly<Record<HypothesisLevel, HypothesisTone>> = Object.freeze({
  高: "hi",
  中: "mi",
  診断外: "lo",
});

/**
 * 育成・定着の原因の札（§2.5.5 の 3。参照元定義の HTML B）。文言は level が「診断外」なら「診断外」、それ以外は「可能性 」+ level
 * （例「可能性 高」）。色は「高」が hi、「中」が mi、それ以外（「診断外」と出力のスキーマに無い値）が lo。level はそのまま比べる
 * （判定チップと違い、空白を除く定めが無い）
 */
export function hypothesisBadge(level: string): HypothesisBadge {
  const t = AI_TEXTS.trainingView;
  const known = Object.hasOwn(HYPOTHESIS_TONES, level) ? (level as HypothesisLevel) : null;
  return Object.freeze({
    text: known === "診断外" ? t.outOfDiagnosis : `${t.possibility}${level}`,
    tone: known === null ? "lo" : HYPOTHESIS_TONES[known],
  });
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

/** 選択欄の選択肢（option の値と表示名） */
export interface TrainingContextChoice {
  readonly value: string; // その項目の選択肢のコード。先頭の「選択してください」は空の文字
  readonly label: string;
}

/** 育成・定着の 8 項目の入力欄の 1 項目（§2.5.3 の表の 1 行。ラベルと選択欄の選択肢） */
export interface TrainingContextField {
  readonly key: TrainingContextKey;
  readonly label: string; // ラベル（「勤続年数」など。lib/masters/training-context.ts）
  /** 先頭は値が空の「選択してください」（未選択の表示）、続けてその項目の選択肢を表示名で上から（マスタの並び） */
  readonly choices: readonly TrainingContextChoice[];
}

function trainingContextField(key: TrainingContextKey): TrainingContextField {
  const item = TRAINING_CONTEXT_ITEMS[key];
  return Object.freeze({
    key,
    label: item.label,
    choices: Object.freeze([
      Object.freeze({ value: "", label: AI_TEXTS.trainingContext.placeholder }),
      ...item.options.map((option) => Object.freeze({ value: option.code, label: option.label })),
    ]),
  });
}

/** 8 項目の入力欄の行（§2.5.3 の 2 行 × 4 列。TRAINING_CONTEXT_KEYS の並びを 4 つずつ。1 行目は勤続年数〜最近の様子） */
export const TRAINING_CONTEXT_ROWS: readonly (readonly TrainingContextField[])[] = Object.freeze([
  Object.freeze(TRAINING_CONTEXT_KEYS.slice(0, 4).map(trainingContextField)),
  Object.freeze(TRAINING_CONTEXT_KEYS.slice(4).map(trainingContextField)),
]);

/**
 * 育成・定着の 8 項目の入力欄の下書き（§2.5.3・§2.5.4）。値は各項目の選択肢のコード（lib/masters/training-context.ts）で、未選択は
 * 空の文字（先頭の選択肢「選択してください」の値）。生成の要求に送る前に trainingContextFromDraft で 8 つそろっているかを確かめる
 */
export type TrainingContextDraft = { readonly [K in TrainingContextKey]: string };

/** 項目ごとの値から下書きを作る（キーは TRAINING_CONTEXT_KEYS の 8 つだけ） */
function draftOf(valueOf: (key: TrainingContextKey) => string): TrainingContextDraft {
  const draft = {} as Record<TrainingContextKey, string>;
  for (const key of TRAINING_CONTEXT_KEYS) draft[key] = valueOf(key);
  return Object.freeze(draft);
}

/** 8 項目とも未選択の下書き（§2.5.3 の初めの値。生成済みでないとき） */
export const EMPTY_TRAINING_CONTEXT_DRAFT: TrainingContextDraft = draftOf(() => "");

/**
 * その項目の選択肢のコードか（§2.5.3 の表）。空の文字（未選択）と、その項目の選択肢に無いコード（ほかの項目のコードを含む）は偽。
 * サーバの検証（trainingContextSchema の各項目の列挙。違えば 422）と同じ規則
 */
export function isTrainingContextCode(key: TrainingContextKey, code: string): boolean {
  return TRAINING_CONTEXT_ITEMS[key].options.some((option) => option.code === code);
}

/**
 * 保存した 8 項目（TrainingAiDto.context。生成済みのとき）から下書きを作る。null（生成済みでない）なら 8 項目とも未選択。その項目の
 * 選択肢に無いコードの項目も未選択にする（選択欄の値がどの選択肢にも当たらない形を作らない）
 */
export function trainingContextDraftOf(context: TrainingContext | null): TrainingContextDraft {
  if (context === null) return EMPTY_TRAINING_CONTEXT_DRAFT;
  return draftOf((key) => (isTrainingContextCode(key, context[key]) ? context[key] : ""));
}

/**
 * 未選択の項目（§2.5.4 の 1。値が空の文字か、その項目の選択肢に無いコード）を TRAINING_CONTEXT_KEYS の並び（画面の並び。1 行目の
 * 4 つ → 2 行目の 4 つ）で返す。生成ボタンを押したとき、これらの欄すべてを不正の表示にし、先頭の欄に焦点を移す
 */
export function unselectedTrainingContextKeys(
  draft: TrainingContextDraft,
): readonly TrainingContextKey[] {
  return Object.freeze(
    TRAINING_CONTEXT_KEYS.filter((key) => !isTrainingContextCode(key, draft[key])),
  );
}

/**
 * 8 項目がすべて選ばれていれば、生成の要求の本文の context（8 つのキーだけを持つ。§2.5.4 の 2・§3.4）。未選択の項目があれば null
 * （生成を始めない。§2.5.4 の 1）
 */
export function trainingContextFromDraft(draft: TrainingContextDraft): TrainingContext | null {
  return unselectedTrainingContextKeys(draft).length === 0 ? draftOf((key) => draft[key]) : null;
}
