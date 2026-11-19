// 回答一覧の絞り込みの状態の保存（M7-list-16 の list-filter-storage の分。11-2 §2.21・§5.1）。読み書きと、消すこと（ログイン画面を
// 開いたときとログインが成功したときに使う。1.5 版）、使えない環境で例外を投げないこと
import { describe, expect, it } from "vitest";

import * as resultListView from "@/lib/presentation/result-list-view";
import {
  DEFAULT_LIST_FILTER,
  parseStoredFilter,
  type ListFilterState,
} from "@/lib/presentation/result-list-view";
import {
  clearStoredListFilter,
  LIST_FILTER_STORAGE_KEY,
  readStoredListFilter,
  saveStoredListFilter,
} from "@/lib/utils/list-filter-storage";

/** sessionStorage の代わり（使う 3 つのメソッドだけ） */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

/** どのメソッドも例外を投げるストレージ（プライベートモードや容量超過の代わり） */
const brokenStorage = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: (): void => {
    throw new Error("QuotaExceededError");
  },
  removeItem: (): void => {
    throw new Error("SecurityError");
  },
};

const filter: ListFilterState = { seg: "cand", q: "テストテスト 05", team: "A", sort: "old" };

describe("M7-list-16 list-filter-storage（sessionStorage の ad-filter の読み書きと消すこと）", () => {
  it("キーは ad-filter で、回答一覧の表示の規則からも同じキーを export する", () => {
    expect(LIST_FILTER_STORAGE_KEY).toBe("ad-filter");
    expect(resultListView.LIST_FILTER_STORAGE_KEY).toBe(LIST_FILTER_STORAGE_KEY);
  });

  it("保存した値を読むと、parseStoredFilter で同じ状態に戻る", () => {
    const storage = memoryStorage();
    saveStoredListFilter(filter, storage);
    expect(storage.items.get(LIST_FILTER_STORAGE_KEY)).toBe(JSON.stringify(filter));
    expect(parseStoredFilter(readStoredListFilter(storage))).toEqual(filter);
  });

  it("保存が無いときは null で、parseStoredFilter は既定にする", () => {
    const storage = memoryStorage();
    expect(readStoredListFilter(storage)).toBeNull();
    expect(parseStoredFilter(readStoredListFilter(storage))).toEqual(DEFAULT_LIST_FILTER);
  });

  it("消すと ad-filter だけが無くなり、ほかのキーは残る（1.5 版）", () => {
    const storage = memoryStorage({
      [LIST_FILTER_STORAGE_KEY]: JSON.stringify(filter),
      "tk_exam_step:s1:1": '{"1":3}',
    });
    clearStoredListFilter(storage);
    expect(storage.items.has(LIST_FILTER_STORAGE_KEY)).toBe(false);
    expect(storage.items.get("tk_exam_step:s1:1")).toBe('{"1":3}');
    expect(readStoredListFilter(storage)).toBeNull();
    // 保存が無いときに消しても何も起きない
    expect(() => clearStoredListFilter(storage)).not.toThrow();
  });

  it("ストレージが例外を投げても、読み書きと消すことは例外を投げない（読むと null）", () => {
    expect(readStoredListFilter(brokenStorage)).toBeNull();
    expect(() => saveStoredListFilter(filter, brokenStorage)).not.toThrow();
    expect(() => clearStoredListFilter(brokenStorage)).not.toThrow();
  });

  it("ストレージが無い（サーバ・window が無い）ときは何もしない", () => {
    expect(readStoredListFilter(null)).toBeNull();
    expect(() => saveStoredListFilter(filter, null)).not.toThrow();
    expect(() => clearStoredListFilter(null)).not.toThrow();
    // 既定のストレージ: 単体テストの環境（node）には window が無い
    expect(readStoredListFilter()).toBeNull();
    expect(() => clearStoredListFilter()).not.toThrow();
  });
});
