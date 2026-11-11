// 結果詳細の画面の状態（11-4 §2.18・§3.5 の result-view-state.ts）。たたんでいるセクション・16の特性の並び・開いている項目の説明・
// 第二候補を出しているか・接し方のタブの 5 項目と、PDF（11-5）の要求と印刷トークンに載せるクエリの形。純関数で、React・window・
// Next.js に触れない。画面の状態は保存しない（部品の Context とモジュールの変数だけ。11-4 §3.1）。
// 第二候補（secondOpen）は育て方、タブ（viewerStyle）は接し方の部品が使う（§2.13.4・§2.14.4）。AI 解説の表示中のタブ（11-6）は
// 同じ形で後の PR が足す。セクションの id は印刷用ページの改ページの規則（11-5 の PDF_SECTION_IDS）と同じ
import { DEFAULT_VIEWER_STYLE, type TraitSortOrder } from "./result-detail-rules";
import {
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type SocialStyleKey,
  type TraitKey,
} from "@/lib/scoring/types";

/** 新しいレイアウトの 7 セクションの id（§2.1。上からの順） */
export const RESULT_SECTION_IDS = [
  "rs-ov",
  "rs-tr",
  "rs-rk",
  "rs-fit",
  "rs-pf",
  "rs-ln",
  "rs-ss",
] as const;
export type ResultSectionId = (typeof RESULT_SECTION_IDS)[number];

export interface ResultViewState {
  readonly folded: readonly ResultSectionId[]; // たたんでいるセクション（RESULT_SECTION_IDS の順）
  readonly traitSort: TraitSortOrder; // 16の特性の並び
  readonly traitHelp: TraitKey | null; // 開いている項目の説明
  readonly secondOpen: boolean; // 第二候補を出しているか
  readonly viewerStyle: SocialStyleKey; // 接し方のタブ（見ている人のスタイル）
}

export const DEFAULT_RESULT_VIEW_STATE: ResultViewState = Object.freeze({
  folded: Object.freeze([]),
  traitSort: "score",
  traitHelp: null,
  secondOpen: false,
  viewerStyle: DEFAULT_VIEWER_STYLE,
});

const TRAIT_SORT_ORDERS: readonly TraitSortOrder[] = ["score", "diff", "def"];

function isOneOf<T extends string>(values: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (values as readonly string[]).includes(value);
}

/** たたみ方を RESULT_SECTION_IDS の順に並べ直す（知らない id と重複は落ちる） */
function inSectionOrder(ids: Iterable<string>): readonly ResultSectionId[] {
  const set = new Set(ids);
  return Object.freeze(RESULT_SECTION_IDS.filter((id) => set.has(id)));
}

/**
 * 画面の状態 → クエリ（§2.18）。既定と同じ項目は省く: fold=rs-tr,rs-rk（RESULT_SECTION_IDS の順にカンマで）、sort=diff・def、
 * help={特性の識別子}、second=1、viewer={スタイルの識別子}。既定だけなら空（toString() が ""）
 */
export function encodeResultViewState(state: ResultViewState): URLSearchParams {
  const params = new URLSearchParams();
  const folded = inSectionOrder(state.folded);
  if (folded.length > 0) params.set("fold", folded.join(","));
  if (state.traitSort !== DEFAULT_RESULT_VIEW_STATE.traitSort) params.set("sort", state.traitSort);
  if (state.traitHelp !== null) params.set("help", state.traitHelp);
  if (state.secondOpen) params.set("second", "1");
  if (state.viewerStyle !== DEFAULT_RESULT_VIEW_STATE.viewerStyle) {
    params.set("viewer", state.viewerStyle);
  }
  return params;
}

/**
 * クエリ → 画面の状態。寛容に読む（§2.18）: 配列は最初の値、たたみ方は知らない id と重複を捨てて RESULT_SECTION_IDS の順に
 * 並べ直し、決まった値以外は既定（sort は score、help は null、second は "1" だけ真、viewer は driving）
 */
export function decodeResultViewState(
  query: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
): ResultViewState {
  const first = (key: string): string | undefined => {
    if (query instanceof URLSearchParams) return query.get(key) ?? undefined;
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const fold = first("fold");
  const sort = first("sort");
  const help = first("help");
  const viewer = first("viewer");
  return Object.freeze({
    folded: fold === undefined ? DEFAULT_RESULT_VIEW_STATE.folded : inSectionOrder(fold.split(",")),
    traitSort: isOneOf(TRAIT_SORT_ORDERS, sort) ? sort : DEFAULT_RESULT_VIEW_STATE.traitSort,
    traitHelp: isOneOf(TRAIT_KEYS, help) ? help : null,
    secondOpen: first("second") === "1",
    viewerStyle: isOneOf(SOCIAL_STYLE_KEYS, viewer)
      ? viewer
      : DEFAULT_RESULT_VIEW_STATE.viewerStyle,
  });
}
