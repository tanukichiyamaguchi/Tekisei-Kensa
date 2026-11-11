// M7-result-13 result-view-state.ts（11-4 §2.18・§3.5・§5.1）。画面の状態 5 項目（たたみ方・並び・項目の説明・第二候補・接し方の
// タブ）とクエリ（fold・sort・help・second・viewer）の往復、寛容な読み取り。セクションの id は 11-4 §2.1 の表を読んで比べる
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  decodeResultViewState,
  DEFAULT_RESULT_VIEW_STATE,
  encodeResultViewState,
  RESULT_SECTION_IDS,
  type ResultViewState,
} from "@/lib/presentation/result-view-state";

const SPEC = readFileSync(
  fileURLToPath(
    new URL("../../../docs/基本設計/11_参照元の更新/11-4_結果詳細.md", import.meta.url),
  ),
  "utf8",
);

/** 往復を確かめる状態（たたみ方 [rs-tr, rs-rk]・平均との差・優劣性・第二候補あり・エミアブル） */
const FULL: ResultViewState = {
  folded: ["rs-tr", "rs-rk"],
  traitSort: "diff",
  traitHelp: "deliberateness",
  secondOpen: true,
  viewerStyle: "amiable",
};

describe("M7-result-13 result-view-state（画面の状態とクエリ）", () => {
  it("セクションの id は §2.1 の表の 7 つを上からの順（rs-ov〜rs-ss）", () => {
    const from = SPEC.indexOf("セクションと、目次・PDF（11-5）・テストが使う要素の id");
    const table = SPEC.slice(from, SPEC.indexOf("\n\n- ", from));
    const ids = [...table.matchAll(/^\| \S+ \| `(rs-[a-z]+)` \|/gm)].map((m) => m[1]);
    expect(ids).toEqual([...RESULT_SECTION_IDS]);
    expect(RESULT_SECTION_IDS).toEqual([
      "rs-ov",
      "rs-tr",
      "rs-rk",
      "rs-fit",
      "rs-pf",
      "rs-ln",
      "rs-ss",
    ]);
  });

  it("既定はすべて開く・点数の高い順・説明なし・第二候補なし・ドライビングで、クエリは空", () => {
    expect(DEFAULT_RESULT_VIEW_STATE).toEqual({
      folded: [],
      traitSort: "score",
      traitHelp: null,
      secondOpen: false,
      viewerStyle: "driving",
    });
    expect(Object.isFrozen(DEFAULT_RESULT_VIEW_STATE)).toBe(true);
    expect(encodeResultViewState(DEFAULT_RESULT_VIEW_STATE).toString()).toBe("");
    expect(decodeResultViewState(new URLSearchParams())).toEqual(DEFAULT_RESULT_VIEW_STATE);
    expect(decodeResultViewState({})).toEqual(DEFAULT_RESULT_VIEW_STATE);
  });

  it("5 項目は fold・sort・help・second・viewer の 5 つのクエリで往復する", () => {
    const params = encodeResultViewState(FULL);
    expect([...params.entries()]).toEqual([
      ["fold", "rs-tr,rs-rk"],
      ["sort", "diff"],
      ["help", "deliberateness"],
      ["second", "1"],
      ["viewer", "amiable"],
    ]);
    expect(decodeResultViewState(params)).toEqual(FULL);
    // 文字にしてから読む（PDF の要求・印刷トークンの形）、Next.js の searchParams の形（Record）
    expect(decodeResultViewState(new URLSearchParams(params.toString()))).toEqual(FULL);
    expect(decodeResultViewState(Object.fromEntries(params))).toEqual(FULL);
  });

  it("既定と同じ項目は省く", () => {
    const only = (state: Partial<ResultViewState>) =>
      encodeResultViewState({ ...DEFAULT_RESULT_VIEW_STATE, ...state }).toString();
    expect(only({ traitSort: "def" })).toBe("sort=def");
    expect(only({ traitHelp: "communication" })).toBe("help=communication");
    expect(only({ secondOpen: true })).toBe("second=1");
    expect(only({ viewerStyle: "analytical" })).toBe("viewer=analytical");
    expect(only({ viewerStyle: "driving", traitSort: "score", folded: [] })).toBe("");
    expect(new URLSearchParams(only({ folded: ["rs-ov"] })).get("fold")).toBe("rs-ov");
  });

  it("たたみ方は RESULT_SECTION_IDS の順に並べ直す（書くときも読むときも）", () => {
    expect(
      encodeResultViewState({
        ...DEFAULT_RESULT_VIEW_STATE,
        folded: ["rs-ss", "rs-ov", "rs-fit"],
      }).get("fold"),
    ).toBe("rs-ov,rs-fit,rs-ss");
    expect(decodeResultViewState({ fold: "rs-ss,rs-ov,rs-fit" }).folded).toEqual([
      "rs-ov",
      "rs-fit",
      "rs-ss",
    ]);
  });

  it("寛容に読む: 知らない id と重複は捨てる、決まった値以外は既定", () => {
    expect(decodeResultViewState({ fold: "rs-xx,rs-tr,rs-tr" }).folded).toEqual(["rs-tr"]);
    expect(decodeResultViewState({ fold: "" }).folded).toEqual([]);
    expect(decodeResultViewState({ sort: "zzz" }).traitSort).toBe("score");
    expect(decodeResultViewState({ help: "zzz" }).traitHelp).toBeNull();
    expect(decodeResultViewState({ second: "yes" }).secondOpen).toBe(false);
    expect(decodeResultViewState({ second: "1" }).secondOpen).toBe(true);
    expect(decodeResultViewState({ viewer: "zzz" }).viewerStyle).toBe("driving");
    expect(
      decodeResultViewState(
        new URLSearchParams("fold=rs-xx,rs-tr,rs-tr&sort=zzz&help=zzz&second=yes&viewer=zzz"),
      ),
    ).toEqual({ ...DEFAULT_RESULT_VIEW_STATE, folded: ["rs-tr"] });
    expect(decodeResultViewState({ sort: undefined, help: undefined })).toEqual(
      DEFAULT_RESULT_VIEW_STATE,
    );
  });

  it("配列のクエリは最初の値を読む（URLSearchParams も同じ名前の最初の値）", () => {
    expect(
      decodeResultViewState({
        fold: ["rs-rk,rs-tr", "rs-ov"],
        sort: ["def", "diff"],
        help: ["humility", "zzz"],
        second: ["1", "0"],
        viewer: ["expressive", "amiable"],
      }),
    ).toEqual({
      folded: ["rs-tr", "rs-rk"],
      traitSort: "def",
      traitHelp: "humility",
      secondOpen: true,
      viewerStyle: "expressive",
    });
    expect(decodeResultViewState(new URLSearchParams("sort=def&sort=diff")).traitSort).toBe("def");
    expect(decodeResultViewState({ sort: [] }).traitSort).toBe("score");
  });

  it("読んだ状態は凍結され、書き換えられない", () => {
    const state = decodeResultViewState({ fold: "rs-tr" });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.folded)).toBe(true);
  });
});
