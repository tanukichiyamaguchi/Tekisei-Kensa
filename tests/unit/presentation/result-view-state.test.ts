// M7-result-13 result-view-state.ts（11-4 §2.18・§3.5・§5.1）。画面の状態 5 項目（たたみ方・並び・項目の説明・第二候補・接し方の
// タブ）とクエリ（fold・sort・help・second・viewer）の往復、寛容な読み取り。セクションの id は 11-4 §2.1 の表を読んで比べる。
// M7-ai-03（11-6 §3.7.6・§5.1。PR-7.9 の分）: AI 解説の表示中のタブ aiTab とクエリ ai（既定 recruitment は省く、知らない値は既定）。
// 11-6 §3.7.6 の表を読んで比べる。経年比較のスコア比較の aiKeinenFlat（kflat）は PR-7.11b で足す
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
const AI_SPEC = readFileSync(
  fileURLToPath(new URL("../../../docs/基本設計/11_参照元の更新/11-6_AI解説.md", import.meta.url)),
  "utf8",
);

/** 往復を確かめる状態（たたみ方 [rs-tr, rs-rk]・平均との差・優劣性・第二候補あり・エミアブル・AI 解説は育成・定着のタブ） */
const FULL: ResultViewState = {
  folded: ["rs-tr", "rs-rk"],
  traitSort: "diff",
  traitHelp: "deliberateness",
  secondOpen: true,
  viewerStyle: "amiable",
  aiTab: "training",
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

  it("既定はすべて開く・点数の高い順・説明なし・第二候補なし・ドライビング・採用向けのタブで、クエリは空", () => {
    expect(DEFAULT_RESULT_VIEW_STATE).toEqual({
      folded: [],
      traitSort: "score",
      traitHelp: null,
      secondOpen: false,
      viewerStyle: "driving",
      aiTab: "recruitment",
    });
    expect(Object.isFrozen(DEFAULT_RESULT_VIEW_STATE)).toBe(true);
    expect(encodeResultViewState(DEFAULT_RESULT_VIEW_STATE).toString()).toBe("");
    expect(decodeResultViewState(new URLSearchParams())).toEqual(DEFAULT_RESULT_VIEW_STATE);
    expect(decodeResultViewState({})).toEqual(DEFAULT_RESULT_VIEW_STATE);
  });

  it("5 項目は fold・sort・help・second・viewer の 5 つのクエリで往復する（AI 解説のタブの ai と一緒に）", () => {
    const params = encodeResultViewState(FULL);
    expect([...params.entries()]).toEqual([
      ["fold", "rs-tr,rs-rk"],
      ["sort", "diff"],
      ["help", "deliberateness"],
      ["second", "1"],
      ["viewer", "amiable"],
      ["ai", "training"],
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
        new URLSearchParams(
          "fold=rs-xx,rs-tr,rs-tr&sort=zzz&help=zzz&second=yes&viewer=zzz&ai=zzz",
        ),
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
        ai: ["longitudinal", "training"],
      }),
    ).toEqual({
      folded: ["rs-tr", "rs-rk"],
      traitSort: "def",
      traitHelp: "humility",
      secondOpen: true,
      viewerStyle: "expressive",
      aiTab: "longitudinal",
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

describe("M7-ai-03 画面の状態の aiTab（11-6 §3.7.6。PR-7.9 の分）", () => {
  it("11-6 §3.7.6 の表: aiTab は既定 recruitment、クエリは ai=training・ai=longitudinal（既定なら省く）", () => {
    expect(AI_SPEC).toContain(
      '| `aiTab`（AI 解説の表示中のタブ） | `AiAnalysisKind` | `"recruitment"` | `ai=training`・`ai=longitudinal`（既定なら省く） |',
    );
    expect(DEFAULT_RESULT_VIEW_STATE.aiTab).toBe("recruitment");
  });

  it("書くとき: training → ai=training、longitudinal → ai=longitudinal、既定の recruitment は省く", () => {
    const only = (aiTab: ResultViewState["aiTab"]) =>
      encodeResultViewState({ ...DEFAULT_RESULT_VIEW_STATE, aiTab }).toString();
    expect(only("training")).toBe("ai=training");
    expect(only("longitudinal")).toBe("ai=longitudinal");
    expect(only("recruitment")).toBe("");
    expect(encodeResultViewState(DEFAULT_RESULT_VIEW_STATE).toString()).toBe("");
  });

  it("読むとき: ai=training・ai=longitudinal・ai=recruitment を読み、無い・知らない値（大文字・空を含む）は recruitment", () => {
    expect(decodeResultViewState({ ai: "training" }).aiTab).toBe("training");
    expect(decodeResultViewState({ ai: "longitudinal" }).aiTab).toBe("longitudinal");
    expect(decodeResultViewState({ ai: "recruitment" }).aiTab).toBe("recruitment");
    expect(decodeResultViewState(new URLSearchParams("ai=training")).aiTab).toBe("training");
    for (const ai of ["foo", "Training", "TRAINING", "", " training"]) {
      expect(decodeResultViewState({ ai }).aiTab, JSON.stringify(ai)).toBe("recruitment");
    }
    expect(decodeResultViewState({}).aiTab).toBe("recruitment");
    expect(decodeResultViewState({ ai: undefined }).aiTab).toBe("recruitment");
  });

  it("配列は最初の値を読む（URLSearchParams も同じ名前の最初の値）", () => {
    expect(decodeResultViewState({ ai: ["training", "longitudinal"] }).aiTab).toBe("training");
    expect(decodeResultViewState({ ai: ["foo", "training"] }).aiTab).toBe("recruitment");
    expect(decodeResultViewState({ ai: [] }).aiTab).toBe("recruitment");
    expect(decodeResultViewState(new URLSearchParams("ai=longitudinal&ai=training")).aiTab).toBe(
      "longitudinal",
    );
  });

  it("ほかの項目と一緒に往復する（書いて読むと元に戻る。文字にしてから読んでも、Record で読んでも同じ）", () => {
    for (const aiTab of ["recruitment", "training", "longitudinal"] as const) {
      const state: ResultViewState = { ...FULL, aiTab };
      const params = encodeResultViewState(state);
      expect(decodeResultViewState(params), aiTab).toEqual(state);
      expect(decodeResultViewState(new URLSearchParams(params.toString())), aiTab).toEqual(state);
      expect(decodeResultViewState(Object.fromEntries(params)), aiTab).toEqual(state);
    }
  });
});
