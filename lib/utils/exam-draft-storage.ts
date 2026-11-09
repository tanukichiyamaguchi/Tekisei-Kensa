// 未送信の選択の退避（11-1 §2.4.5・§2.6・§3.6）。sessionStorage のキー tk_exam_step:{sessionId}:{stepNo} に
// {"42":3,"43":1} の形で選択の値だけを置く（個人情報は置かない）。
// M7 より前の画面のキー tk_exam_draft:{sessionId}:{pageNo}（値は同じ形）は、読み込みのときにこのセッションの分だけを
// 新しいキーへ取り込んでから消す（ページ番号は使わない）。新しいキーに書けなかったときは消さずに残し、次に開いたときに
// 取り込み直す（保存前の選択を失わないため）。「戻る」用の tk_exam_flash:{sessionId} はやめ、残っていれば消す。
// 読み書きはすべて try/catch で囲み、使えない環境（プライベートモードなど）でも例外を投げない
import { SCORED_QUESTION_COUNT, stepOf } from "@/lib/masters/question-layout";

const PREFIX = "tk_exam_step:";
/** M7 より前の画面のキー（ページごと） */
const LEGACY_PREFIX = "tk_exam_draft:";
/** M7 より前の画面の「戻る」の一時フラグ */
const LEGACY_FLASH_PREFIX = "tk_exam_flash:";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function examDraftKey(sessionId: string, stepNo: number): string {
  return `${PREFIX}${sessionId}:${stepNo}`;
}

/** 設問番号 1〜144・値 1〜5 の整数だけを残す（形の不正な項目は捨てる） */
function parseSelections(raw: string | null | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!raw) return out;
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const q = Number(key);
    if (
      Number.isInteger(q) &&
      q >= 1 &&
      q <= SCORED_QUESTION_COUNT &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 5
    ) {
      out.set(q, value);
    }
  }
  return out;
}

function keysWithPrefix(storage: StorageLike, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

/** 1 つのキーの値を読む。壊れた値は無いものとして扱う */
function readKey(storage: StorageLike, key: string): Map<number, number> {
  try {
    return parseSelections(storage.getItem(key));
  } catch {
    return new Map();
  }
}

/** ステップの退避を書く（空なら消す）。書けたら true、ストレージが無い・容量超過などで書けなければ false */
export function writeExamDraft(
  sessionId: string,
  stepNo: number,
  selections: ReadonlyMap<number, number>,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    const key = examDraftKey(sessionId, stepNo);
    if (selections.size === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(Object.fromEntries(selections)));
    return true;
  } catch {
    // 容量超過・無効化されたストレージ
    return false;
  }
}

export function clearExamDraft(
  sessionId: string,
  stepNo: number,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(examDraftKey(sessionId, stepNo));
  } catch {
    // 無視
  }
}

/**
 * このセッションの退避をすべて読む（受験画面を開いたとき。11-1 §2.4.5）。設問番号 → 選択。
 * 旧キーの分は新しいキーへ取り込んでから消し（同じ設問は新しいキーの値を優先）、tk_exam_flash: も消す。
 * 新しいキーに書けなかったときは旧キーを残す（次に開いたときに取り込み直す）。ほかのセッションのキーは触らない
 */
export function loadExamDrafts(
  sessionId: string,
  storage: StorageLike | null = defaultStorage(),
): ReadonlyMap<number, number> {
  const merged = new Map<number, number>();
  try {
    if (!storage) return merged;
    const legacyKeys = keysWithPrefix(storage, `${LEGACY_PREFIX}${sessionId}:`);
    const currentKeys = keysWithPrefix(storage, `${PREFIX}${sessionId}:`);
    const legacy = new Map<number, number>();
    for (const key of legacyKeys) for (const [q, v] of readKey(storage, key)) legacy.set(q, v);
    for (const [q, v] of legacy) merged.set(q, v);
    for (const key of currentKeys) for (const [q, v] of readKey(storage, key)) merged.set(q, v);

    let migrated = true;
    if (legacy.size > 0) {
      // 取り込んだ旧キーの選択を、新しいキー（ステップごと）に書き直す
      const byStep = new Map<number, Map<number, number>>();
      for (const [q, v] of merged) {
        if (!legacy.has(q)) continue;
        const stepNo = stepOf(q);
        const step = byStep.get(stepNo) ?? readKey(storage, examDraftKey(sessionId, stepNo));
        step.set(q, v);
        byStep.set(stepNo, step);
      }
      for (const [stepNo, selections] of byStep) {
        if (!writeExamDraft(sessionId, stepNo, selections, storage)) migrated = false;
      }
    }
    // 旧キーは、選択を新しいキーへ書けたときだけ消す（書けなければ残し、次に開いたときに取り込み直す）
    if (migrated) for (const key of legacyKeys) storage.removeItem(key);
    storage.removeItem(`${LEGACY_FLASH_PREFIX}${sessionId}`);
  } catch {
    // 退避は補助的なもの。読めなければ読めた分だけ返す
  }
  return merged;
}

/**
 * 送信の成功・session_unavailable の表示のとき。新しいキー・旧キー・tk_exam_flash: を消す。
 * sessionId を指定するとそのセッションの分だけ、省略すると全セッションの分を消す
 */
export function clearAllExamDrafts(
  sessionId?: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    if (!storage) return;
    const prefixes =
      sessionId === undefined
        ? [PREFIX, LEGACY_PREFIX, LEGACY_FLASH_PREFIX]
        : [`${PREFIX}${sessionId}:`, `${LEGACY_PREFIX}${sessionId}:`];
    const keys = prefixes.flatMap((prefix) => keysWithPrefix(storage, prefix));
    if (sessionId !== undefined) keys.push(`${LEGACY_FLASH_PREFIX}${sessionId}`);
    for (const key of keys) storage.removeItem(key);
  } catch {
    // 無視
  }
}
