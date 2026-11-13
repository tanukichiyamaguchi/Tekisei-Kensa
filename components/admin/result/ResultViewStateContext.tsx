"use client";
// 結果詳細の画面の状態（11-4 §2.18 の ResultViewState）を持ち、部品に配る Context。11-4 §3.6 に置き場所の名前が無いので、
// このファイルに置いた（受け渡しの名前は総論 8.3 の 13 のとおり、11-4 の改版で書く）。useResultViewState() は今の状態
// （PR-7.12 のダウンロードのポップアップが読んで PDF の要求に付ける）、useResultViewActions() は操作を返す。
// 画面の形（variant="screen"）は、たたみ方と並びを result-ui-memory.ts のモジュールの変数から始め、変えるたびにそこにも書く
// （別の人の結果に移っても保ち、ページを読み込み直すと戻る。§2.8.6・§2.16）。項目の説明・第二候補・接し方のタブは人ごとに初めから
// （モジュールの変数に書かず、ResultDetailBody ごと key で作り直す。§2.1）。第二候補とタブは比較組織を変えても保つ（§2.13.4・§2.14.4。
// 項目の説明は、比較の状態が変わると ResultLayout が閉じる。§2.8.4）。
// サーバで描く最初の HTML（すべて開く・点数の高い順・第二候補を閉じる・タブはドライビング）と、ページを読み込んだ直後の
// 初めの状態は同じで、ハイドレーションの食い違いは起きない（画面の幅 700px 以下のたたみ方は描いた直後に ResultLayout が決める）。
// 印刷の形（variant="print"）は initialViewState（省くと既定）で始め、モジュールの変数を読まず書かない。保存はしない（11-4 §3.1）
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { resultUiMemory } from "./result-ui-memory";
import type { TraitSortOrder } from "@/lib/presentation/result-detail-rules";
import {
  DEFAULT_RESULT_VIEW_STATE,
  RESULT_SECTION_IDS,
  type ResultSectionId,
  type ResultViewState,
} from "@/lib/presentation/result-view-state";
import type { SocialStyleKey, TraitKey } from "@/lib/scoring/types";

/** 部品の描き方: 結果詳細の画面か、PDF の印刷用ページ（11-4 §2.18。11-5） */
export type ResultDetailVariant = "screen" | "print";

export interface ResultViewActions {
  /** セクションを開閉する（見出しの行。§2.16） */
  readonly toggleFold: (id: ResultSectionId) => void;
  /** たたんでいれば開く（目次のリンクで移る前。§2.5） */
  readonly openSection: (id: ResultSectionId) => void;
  /** たたみ方をまとめて決める（画面の幅 700px 以下の初めの状態。§2.16） */
  readonly setFoldedAll: (folded: Readonly<Record<ResultSectionId, boolean>>) => void;
  /** 16の特性の並び（§2.8.6） */
  readonly setTraitSort: (order: TraitSortOrder) => void;
  /** 開いている項目の説明（null で閉じる。§2.8.4） */
  readonly setTraitHelp: (key: TraitKey | null) => void;
  /** 育て方の第二候補を出すか（第二候補のボタン。§2.13.4） */
  readonly setSecondOpen: (open: boolean) => void;
  /** 接し方のタブ（見ている人のスタイル。§2.14.4） */
  readonly setViewerStyle: (style: SocialStyleKey) => void;
}

interface ResultViewStateValue {
  readonly state: ResultViewState;
  readonly actions: ResultViewActions;
}

const noop = () => undefined;
const ResultViewStateContext = createContext<ResultViewStateValue>({
  state: DEFAULT_RESULT_VIEW_STATE,
  actions: {
    toggleFold: noop,
    openSection: noop,
    setFoldedAll: noop,
    setTraitSort: noop,
    setTraitHelp: noop,
    setSecondOpen: noop,
    setViewerStyle: noop,
  },
});

/** たたんでいるセクションを RESULT_SECTION_IDS の順にする（重複は落ちる） */
function inSectionOrder(ids: Iterable<ResultSectionId>): readonly ResultSectionId[] {
  const set = new Set(ids);
  return Object.freeze(RESULT_SECTION_IDS.filter((id) => set.has(id)));
}

/** セクションごとのたたみ方の表（true = たたむ）→ たたんでいるセクションの配列（RESULT_SECTION_IDS の順） */
export function foldedIds(
  folded: Readonly<Record<ResultSectionId, boolean>>,
): readonly ResultSectionId[] {
  return inSectionOrder(RESULT_SECTION_IDS.filter((id) => folded[id]));
}

/** たたんでいるセクションの配列 → セクションごとのたたみ方の表 */
export function foldedRecord(
  ids: readonly ResultSectionId[],
): Readonly<Record<ResultSectionId, boolean>> {
  const set = new Set(ids);
  return Object.freeze(
    Object.fromEntries(RESULT_SECTION_IDS.map((id) => [id, set.has(id)])) as Record<
      ResultSectionId,
      boolean
    >,
  );
}

function initialState(
  variant: ResultDetailVariant,
  initialViewState: ResultViewState | undefined,
): ResultViewState {
  if (variant === "print") return initialViewState ?? DEFAULT_RESULT_VIEW_STATE;
  return Object.freeze({
    ...DEFAULT_RESULT_VIEW_STATE,
    folded:
      resultUiMemory.folded === null
        ? DEFAULT_RESULT_VIEW_STATE.folded
        : foldedIds(resultUiMemory.folded),
    traitSort: resultUiMemory.traitSort,
  });
}

export function ResultViewStateProvider(props: {
  readonly variant: ResultDetailVariant;
  /** 印刷の形の初めの状態（11-5 が印刷トークンから渡す。省くと既定）。画面の形では使わない */
  readonly initialViewState?: ResultViewState | undefined;
  readonly children: ReactNode;
}) {
  const screen = props.variant === "screen";
  const [state, setState] = useState<ResultViewState>(() =>
    initialState(props.variant, props.initialViewState),
  );

  const value = useMemo<ResultViewStateValue>(() => {
    const writeFolded = (folded: readonly ResultSectionId[]) => {
      if (screen) resultUiMemory.folded = foldedRecord(folded);
      setState((current) => Object.freeze({ ...current, folded }));
    };
    return {
      state,
      actions: {
        toggleFold: (id) =>
          writeFolded(
            state.folded.includes(id)
              ? inSectionOrder(state.folded.filter((x) => x !== id))
              : inSectionOrder([...state.folded, id]),
          ),
        openSection: (id) => {
          if (state.folded.includes(id)) writeFolded(state.folded.filter((x) => x !== id));
        },
        setFoldedAll: (folded) => writeFolded(foldedIds(folded)),
        setTraitSort: (order) => {
          if (screen) resultUiMemory.traitSort = order;
          setState((current) => Object.freeze({ ...current, traitSort: order }));
        },
        setTraitHelp: (key) => setState((current) => Object.freeze({ ...current, traitHelp: key })),
        setSecondOpen: (open) =>
          setState((current) => Object.freeze({ ...current, secondOpen: open })),
        setViewerStyle: (style) =>
          setState((current) => Object.freeze({ ...current, viewerStyle: style })),
      },
    };
  }, [state, screen]);

  return (
    <ResultViewStateContext.Provider value={value}>
      {props.children}
    </ResultViewStateContext.Provider>
  );
}

/** 今の画面の状態（11-4 §2.18。PR-7.12 のダウンロードのポップアップが読む） */
export function useResultViewState(): ResultViewState {
  return useContext(ResultViewStateContext).state;
}

/** 画面の状態の操作 */
export function useResultViewActions(): ResultViewActions {
  return useContext(ResultViewStateContext).actions;
}
