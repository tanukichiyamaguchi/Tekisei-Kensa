// 回答一覧の絞り込みの状態の保存（11-2 §2.21）。sessionStorage のキー ad-filter に、区分・検索語・チーム・並び順を JSON で置く。
// 検索語に氏名・電話番号が入り得るので、ログイン画面を開いたとき（LoginForm）と、ログインが成功してセッションができたとき
// （lib/utils/admin-auth.ts の establishSession）に消す（1.5 版）。ログアウト・セッション切れのあとはログイン画面を通り、M-03 で新しい
// パスワードを決めたあとの自動ログインはログインの成功を通るので、同じタブで次にログインした人に前の人の絞り込みを戻さない。
// sessionStorage はタブごとなので、ログインしたまま残した別のタブの保存は消えない（制限。依頼主の判断。11-2 §2.21）。
// 読み書きはすべて try/catch で囲み、使えない環境（プライベートモードなど）でも例外を投げない（保存しない・戻さないだけ）。
// ログイン画面に回答一覧の表示の規則（lib/presentation/result-list-view.ts）を読み込ませないため、キーはここで定め、型だけを import する
import type { ListFilterState } from "@/lib/presentation/result-list-view";

/** 絞り込みの状態を保存する sessionStorage のキー（§2.21。lib/presentation/result-list-view.ts からも export する） */
export const LIST_FILTER_STORAGE_KEY = "ad-filter";

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

/** 保存した絞り込みの状態を消す（ログイン画面を開いたときと、ログインが成功したとき。1.5 版） */
export function clearStoredListFilter(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(LIST_FILTER_STORAGE_KEY);
  } catch {
    // ストレージが使えない環境では何もしない
  }
}
