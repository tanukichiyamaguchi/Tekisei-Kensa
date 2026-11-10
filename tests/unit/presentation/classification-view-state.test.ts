// M7-zaiseki-22 組織内分類の表示の状態（11-3 §2.18。components/admin/classification/view-state.ts）の組織内分類の分
// （チーム・対象・折りたたみ。在籍・退職のタブは PR-7.7b）。状態はモジュールの変数なので、テストごとにモジュールを読み直す。
// サーバの描画（renderToStaticMarkup）では、書き換えた後も既定の値で描くことも確かめる
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ViewState from "@/components/admin/classification/view-state";

type ViewStateModule = typeof ViewState;

let m: ViewStateModule;

beforeEach(async () => {
  vi.resetModules();
  m = await import("@/components/admin/classification/view-state");
});

describe("M7-zaiseki-22 view-state（組織内分類の分。11-3 §2.18）", () => {
  it("既定値はチーム「すべて」・対象「全員」・折りたたみは押していない（凍結したオブジェクト）", () => {
    const state = m.getClassificationViewState();
    expect(state).toEqual({ team: "", mode: "all", folds: {} });
    expect(state).toBe(m.DEFAULT_CLASSIFICATION_VIEW_STATE);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.folds)).toBe(true);
  });

  it("書き換えた値は、購読を外して付け直したあと（部品を外して付け直したあと）も getSnapshot に残る", () => {
    const unsubscribe = m.subscribeClassificationViewState(() => {});
    m.setTeam("A");
    m.setMode("stay");
    m.setFold("driving", true);
    unsubscribe();
    const again = m.subscribeClassificationViewState(() => {});
    expect(m.getClassificationViewState()).toEqual({
      team: "A",
      mode: "stay",
      folds: { driving: true },
    });
    again();
  });

  it("getServerSnapshot は書き換えの後も既定値で、サーバの描画は既定の値で描く", () => {
    m.setTeam("none");
    m.setMode("left");
    m.setFold("analytical", false);
    expect(m.getServerClassificationViewState()).toBe(m.DEFAULT_CLASSIFICATION_VIEW_STATE);
    expect(m.getServerClassificationViewState()).toEqual({ team: "", mode: "all", folds: {} });
    function Probe() {
      const state = m.useClassificationViewState();
      return createElement("p", null, `${state.team}|${state.mode}|${JSON.stringify(state.folds)}`);
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>|all|{}</p>");
  });

  it("書くたびに新しい凍結したオブジェクトにして購読者に知らせ、外した購読者には知らせない", () => {
    const calls: string[] = [];
    const unsubscribeA = m.subscribeClassificationViewState(() => calls.push("a"));
    const unsubscribeB = m.subscribeClassificationViewState(() => calls.push("b"));
    const before = m.getClassificationViewState();
    m.setTeam("B");
    const after = m.getClassificationViewState();
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
    expect(before).toEqual({ team: "", mode: "all", folds: {} }); // 前のオブジェクトは変えない
    expect(calls).toEqual(["a", "b"]);
    unsubscribeB();
    m.setMode("left");
    expect(calls).toEqual(["a", "b", "a"]);
    unsubscribeA();
    m.setMode("all");
    expect(calls).toEqual(["a", "b", "a"]);
  });

  it("折りたたみは押した象限だけを持ち、ほかの象限は押していないまま", () => {
    m.setFold("amiable", true);
    m.setFold("expressive", false);
    m.setFold("amiable", false);
    const { folds } = m.getClassificationViewState();
    expect(folds).toEqual({ amiable: false, expressive: false });
    expect(Object.isFrozen(folds)).toBe(true);
    expect("analytical" in folds).toBe(false);
    expect("driving" in folds).toBe(false);
  });
});
