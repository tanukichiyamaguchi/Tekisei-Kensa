// 回答一覧の絞り込みの状態の保存（11-2 §2.21）。sessionStorage のキー ad-filter に、区分・検索語・チーム・並び順を JSON で置く。
// 検索語に氏名・電話番号が入り得るので、ログイン画面を開いたときに消す（1.5 版）。ログアウト・セッション切れ・パスワードの
// 再設定のどの経路でもログイン画面を通るので、同じタブで次にログインした人に前の人の絞り込みを戻さない。
// 読み書きはすべて try/catch で囲み、使えない環境（プライベートモードなど）でも例外を投げない（保存しない・戻さないだけ）
import { LIST_FILTER_STORAGE_KEY, type ListFilterState } from "@/lib/presentation/result-list-view";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 保存した値（JSON の文字列）。無い・読めないときは null（値の検証と既定への読み替えは parseStoredFilter） */
export function readStoredListFilter(
  storage: StorageLike | null = defaultStorage(),
): string | null {
  try {
    return storage?.getItem(LIST_FILTER_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 絞り込みの状態を保存する */
export function saveStoredListFilter(
  filter: ListFilterState,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(LIST_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // ストレージが使えない環境では保存しないだけ
  }
}

/** 保存した絞り込みの状態を消す（ログイン画面を開いたとき。1.5 版） */
export function clearStoredListFilter(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(LIST_FILTER_STORAGE_KEY);
  } catch {
    // ストレージが使えない環境では何もしない
  }
}
