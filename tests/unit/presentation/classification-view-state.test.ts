// M7-zaiseki-22 組織内分類と在籍・退職の表示の状態（11-3 §2.18。components/admin/classification/view-state.ts）。チーム（2 つの
// 画面）・対象・折りたたみ（組織内分類）・タブ（在籍・退職）。状態はモジュールの変数なので、テストごとにモジュールを読み直す。
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

describe("M7-zaiseki-22 view-state（11-3 §2.18）", () => {
  it("既定値はチーム「すべて」・対象「全員」・折りたたみは押していない・タブ「分析」（凍結したオブジェクト）", () => {
    const state = m.getClassificationViewState();
    expect(state).toEqual({ team: "", mode: "all", folds: {}, tab: "an" });
    expect(state).toBe(m.DEFAULT_CLASSIFICATION_VIEW_STATE);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.folds)).toBe(true);
  });

  it("書き換えた値は、購読を外して付け直したあと（部品を外して付け直したあと）も getSnapshot に残る", () => {
    const unsubscribe = m.subscribeClassificationViewState(() => {});
    m.setTeam("A");
    m.setMode("stay");
    m.setFold("driving", true);
    m.setTab("left");
    unsubscribe();
    const again = m.subscribeClassificationViewState(() => {});
    expect(m.getClassificationViewState()).toEqual({
      team: "A",
      mode: "stay",
      folds: { driving: true },
      tab: "left",
    });
    again();
  });

  it("在籍・退職のタブ（setTab）は組織内分類の値（チーム・対象・折りたたみ）を変えず、組織内分類の書き換えもタブを変えない", () => {
    m.setTeam("none");
    m.setTab("seek");
    expect(m.getClassificationViewState()).toEqual({
      team: "none",
      mode: "all",
      folds: {},
      tab: "seek",
    });
    m.setMode("left");
    m.setFold("amiable", true);
    expect(m.getClassificationViewState().tab).toBe("seek");
    m.setTab("an");
    expect(m.getClassificationViewState()).toEqual({
      team: "none",
      mode: "left",
      folds: { amiable: true },
      tab: "an",
    });
  });

  it("getServerSnapshot は書き換えの後も既定値で、サーバの描画は既定の値で描く", () => {
    m.setTeam("none");
    m.setMode("left");
    m.setFold("analytical", false);
    m.setTab("stay");
    expect(m.getServerClassificationViewState()).toBe(m.DEFAULT_CLASSIFICATION_VIEW_STATE);
    expect(m.getServerClassificationViewState()).toEqual({
      team: "",
      mode: "all",
      folds: {},
      tab: "an",
    });
    function Probe() {
      const state = m.useClassificationViewState();
      return createElement(
        "p",
        null,
        `${state.team}|${state.mode}|${JSON.stringify(state.folds)}|${state.tab}`,
      );
    }
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<p>|all|{}|an</p>");
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
    expect(before).toEqual({ team: "", mode: "all", folds: {}, tab: "an" }); // 前のオブジェクトは変えない
    expect(calls).toEqual(["a", "b"]);
    unsubscribeB();
    m.setMode("left");
    expect(calls).toEqual(["a", "b", "a"]);
    // タブも書くたびに新しい凍結したオブジェクト
    const beforeTab = m.getClassificationViewState();
    m.setTab("left");
    const afterTab = m.getClassificationViewState();
    expect(afterTab).not.toBe(beforeTab);
    expect(Object.isFrozen(afterTab)).toBe(true);
    expect(beforeTab.tab).toBe("an");
    expect(calls).toEqual(["a", "b", "a", "a"]);
    unsubscribeA();
    m.setMode("all");
    m.setTab("an");
    expect(calls).toEqual(["a", "b", "a", "a"]);
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
