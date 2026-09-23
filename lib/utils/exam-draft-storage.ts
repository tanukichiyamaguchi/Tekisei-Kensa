// 未保存の選択の退避（05 §6.4、D05-07）。sessionStorage に選択値だけを置く（個人情報は置かない）。
// 読み書きはすべて try/catch で囲み、使えない環境（プライベートモードなど）でも画面は動く
const PREFIX = "tk_exam_draft:";
/** 「戻る」の部分保存に失敗したとき、遷移先で E-02 を出すための一時フラグ（05 §5.3.7） */
const FLASH_PREFIX = "tk_exam_flash:";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function examDraftKey(sessionId: string, pageNo: number): string {
  return `${PREFIX}${sessionId}:${pageNo}`;
}

/** {"51":3,"52":1} → Map。形が不正な項目は捨てる */
export function readExamDraft(
  sessionId: string,
  pageNo: number,
  storage: StorageLike | null = defaultStorage(),
): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  try {
    const raw = storage?.getItem(examDraftKey(sessionId, pageNo));
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return out;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const q = Number(key);
      if (Number.isInteger(q) && q >= 1 && Number.isInteger(value)) out.set(q, value as number);
    }
  } catch {
    // 退避値は補助的なもの。読めなければ無いものとして扱う
  }
  return out;
}

export function writeExamDraft(
  sessionId: string,
  pageNo: number,
  selections: ReadonlyMap<number, number>,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(
      examDraftKey(sessionId, pageNo),
      JSON.stringify(Object.fromEntries(selections)),
    );
  } catch {
    // 容量超過・無効化されたストレージ
  }
}

export function clearExamDraft(
  sessionId: string,
  pageNo: number,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(examDraftKey(sessionId, pageNo));
  } catch {
    // 無視
  }
}

/** 送信成功時・session_unavailable の表示時。sessionId を省略すると全セッションの退避を消す */
export function clearAllExamDrafts(
  sessionId?: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    if (!storage) return;
    const prefix = sessionId === undefined ? PREFIX : `${PREFIX}${sessionId}:`;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // 無視
  }
}

export function setExamFlash(
  sessionId: string,
  textId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(`${FLASH_PREFIX}${sessionId}`, textId);
  } catch {
    // 無視
  }
}

/** 読んだら消す */
export function takeExamFlash(
  sessionId: string,
  storage: StorageLike | null = defaultStorage(),
): string | null {
  try {
    const key = `${FLASH_PREFIX}${sessionId}`;
    const value = storage?.getItem(key) ?? null;
    if (value !== null) storage?.removeItem(key);
    return value;
  } catch {
    return null;
  }
}
