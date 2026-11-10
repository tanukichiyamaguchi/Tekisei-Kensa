// 組織内分類の表示の状態（11-3 §2.18）。チーム（既定「すべて」）・対象（既定「全員」）・折りたたみ（押した象限だけの開閉。既定は
// 押していない）を、ブラウザのメモリ（このモジュールの変数）に凍結したオブジェクトで持つ。サイドメニューでの画面の移動（next/link）では
// 残り、ページを読み込み直すと既定に戻る。Cookie・sessionStorage・localStorage・Firestore には置かず、個人情報を持たない。
// Client Component から useClassificationViewState()（useSyncExternalStore）で読む。サーバの描画では既定の値だけを使い
// （getServerSnapshot）、書き換え（setTeam・setMode・setFold）はブラウザのイベントと、チームを正規化したあとの useEffect からだけ
// 行う（サーバのモジュールの変数は書かない。リクエストをまたいで状態が混ざらないように）。在籍・退職のタブは PR-7.7b が足す
import { useSyncExternalStore } from "react";

import type { ClassificationMode, TeamFilter } from "@/lib/presentation/classification-view";
import type { SocialStyleKey } from "@/lib/scoring/types";

export interface ClassificationViewState {
  /** チームの絞り込み（"" = すべて、"none" = 未設定） */
  readonly team: TeamFilter;
  /** 集計の対象（全員・在籍・退職） */
  readonly mode: ClassificationMode;
  /** 折りたたみのボタンを押した象限だけの状態（true = 畳んでいる）。押していない象限は画面の幅で決まる（§2.10） */
  readonly folds: Readonly<Partial<Record<SocialStyleKey, boolean>>>;
}

/** 既定の値（§2.18） */
export const DEFAULT_CLASSIFICATION_VIEW_STATE: ClassificationViewState = Object.freeze({
  team: "",
  mode: "all",
  folds: Object.freeze({}),
});

let current: ClassificationViewState = DEFAULT_CLASSIFICATION_VIEW_STATE;
const listeners = new Set<() => void>();

/** 新しい凍結したオブジェクトにして、購読者に知らせる */
function write(next: Partial<ClassificationViewState>): void {
  current = Object.freeze({ ...current, ...next });
  for (const listener of [...listeners]) listener();
}

export function subscribeClassificationViewState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ブラウザでの今の値（useSyncExternalStore の getSnapshot） */
export function getClassificationViewState(): ClassificationViewState {
  return current;
}

/** サーバの描画の値（useSyncExternalStore の getServerSnapshot）。いつも既定の値 */
export function getServerClassificationViewState(): ClassificationViewState {
  return DEFAULT_CLASSIFICATION_VIEW_STATE;
}

export function useClassificationViewState(): ClassificationViewState {
  return useSyncExternalStore(
    subscribeClassificationViewState,
    getClassificationViewState,
    getServerClassificationViewState,
  );
}

/** チームを変える（選択欄の操作と、正規化で「すべて」に戻したあとの useEffect） */
export function setTeam(team: TeamFilter): void {
  write({ team });
}

/** 集計の対象を変える（全員／在籍／退職のボタン） */
export function setMode(mode: ClassificationMode): void {
  write({ mode });
}

/** 象限の折りたたみを変える（折りたたみのボタン。folded = 畳む） */
export function setFold(quadrant: SocialStyleKey, folded: boolean): void {
  write({ folds: Object.freeze({ ...current.folds, [quadrant]: folded }) });
}
