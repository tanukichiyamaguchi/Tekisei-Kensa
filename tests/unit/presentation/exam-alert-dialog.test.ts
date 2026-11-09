// M7-exam-14 R-07 エラーの通知（11-1 §2.1.5。共用の components/ui/SweetAlert.tsx を包む ExamAlertDialog）。
// 時間・Esc・背景・差し替えは部品が使う状態の更新の関数（純関数）と、擬似タイマーで確かめる。
// 描いた HTML は renderToStaticMarkup で確かめる。表示したときの焦点の移動と、閉じたあとの戻りは E2E（M7-exam-42）
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExamAlertDialog } from "@/components/respondent/ExamAlertDialog";
import { SweetAlert } from "@/components/ui/SweetAlert";
import {
  createSweetAlertController,
  msUntilAutoClose,
  SWEET_ALERT_CLOSING_MS,
  SWEET_ALERT_DURATION_MS,
  SWEET_ALERT_HIDDEN,
  sweetAlertReducer,
  type SweetAlertState,
} from "@/components/ui/sweet-alert-state";

const A = { title: "エラー", text: "リンクが正しくありません。" };
const B = { title: "エラー", text: "通信に失敗しました。" };

describe("M7-exam-14 通知の状態の変わり方（純関数）", () => {
  const shown = sweetAlertReducer(SWEET_ALERT_HIDDEN, {
    type: "show",
    content: A,
    now: 1_000,
    durationMs: SWEET_ALERT_DURATION_MS,
  });

  it("表示から 2,000 ミリ秒で消え始め、消える動きのあとで消える", () => {
    expect(SWEET_ALERT_DURATION_MS).toBe(2000);
    expect(shown).toEqual({ phase: "shown", content: A, closesAt: 3_000 });
    expect(msUntilAutoClose(shown, 1_000)).toBe(2_000);
    expect(sweetAlertReducer(shown, { type: "timer", now: 2_999 })).toBe(shown);
    const closing = sweetAlertReducer(shown, { type: "timer", now: 3_000 });
    expect(closing).toEqual({ phase: "closing", content: A });
    expect(sweetAlertReducer(closing, { type: "closed" })).toBe(SWEET_ALERT_HIDDEN);
  });

  it("Esc で閉じる。背景を押しても閉じない", () => {
    expect(sweetAlertReducer(shown, { type: "escape" })).toEqual({ phase: "closing", content: A });
    expect(sweetAlertReducer(shown, { type: "backdrop" })).toBe(shown);
    expect(sweetAlertReducer(SWEET_ALERT_HIDDEN, { type: "escape" })).toBe(SWEET_ALERT_HIDDEN);
  });

  it("表示中・消えている途中に次の通知が来たら、中身を差し替えて時間を数え直す", () => {
    const replaced = sweetAlertReducer(shown, {
      type: "show",
      content: B,
      now: 2_500,
      durationMs: SWEET_ALERT_DURATION_MS,
    });
    expect(replaced).toEqual({ phase: "shown", content: B, closesAt: 4_500 });
    const closing: SweetAlertState = { phase: "closing", content: A };
    expect(
      sweetAlertReducer(closing, {
        type: "show",
        content: B,
        now: 5_000,
        durationMs: SWEET_ALERT_DURATION_MS,
      }),
    ).toEqual({ phase: "shown", content: B, closesAt: 7_000 });
  });

  it("呼び出し側が閉じたときは動きを待たずに消す", () => {
    expect(sweetAlertReducer(shown, { type: "hide" })).toBe(SWEET_ALERT_HIDDEN);
    expect(sweetAlertReducer(SWEET_ALERT_HIDDEN, { type: "hide" })).toBe(SWEET_ALERT_HIDDEN);
  });
});

describe("M7-exam-14 通知の時間（擬似タイマー）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T09:00:00+09:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(closingMs = SWEET_ALERT_CLOSING_MS) {
    const phases: string[] = [];
    const controller = createSweetAlertController({
      onChange: (state) => phases.push(state.phase),
      closingMs: () => closingMs,
    });
    return { controller, phases };
  }

  it("表示から 2,000 ミリ秒で閉じる（消える動き 0.15 秒のあとで消える）", () => {
    const { controller, phases } = setup();
    controller.show(A);
    expect(controller.getState().phase).toBe("shown");
    vi.advanceTimersByTime(1_999);
    expect(controller.getState().phase).toBe("shown");
    vi.advanceTimersByTime(1);
    expect(controller.getState().phase).toBe("closing");
    vi.advanceTimersByTime(SWEET_ALERT_CLOSING_MS);
    expect(controller.getState()).toBe(SWEET_ALERT_HIDDEN);
    expect(phases).toEqual(["shown", "closing", "hidden"]);
  });

  it("Esc で閉じる。背景を押しても閉じない", () => {
    const { controller } = setup();
    controller.show(A);
    vi.advanceTimersByTime(500);
    controller.backdrop();
    expect(controller.getState().phase).toBe("shown");
    controller.escape();
    expect(controller.getState().phase).toBe("closing");
    vi.advanceTimersByTime(SWEET_ALERT_CLOSING_MS);
    expect(controller.getState().phase).toBe("hidden");
  });

  it("表示中に次の通知が来たら内容が変わり、時間を数え直す", () => {
    const { controller } = setup();
    controller.show(A);
    vi.advanceTimersByTime(1_500);
    controller.show(B);
    expect(controller.getState()).toMatchObject({ phase: "shown", content: B });
    vi.advanceTimersByTime(1_999); // 最初の表示からは 3,499 ミリ秒
    expect(controller.getState().phase).toBe("shown");
    vi.advanceTimersByTime(1);
    expect(controller.getState()).toMatchObject({ phase: "closing", content: B });
  });

  it("消えている途中に次の通知が来たら、もう一度表示して数え直す", () => {
    const { controller } = setup();
    controller.show(A);
    vi.advanceTimersByTime(2_000);
    expect(controller.getState().phase).toBe("closing");
    vi.advanceTimersByTime(100);
    controller.show(B);
    vi.advanceTimersByTime(SWEET_ALERT_CLOSING_MS);
    expect(controller.getState()).toMatchObject({ phase: "shown", content: B });
    vi.advanceTimersByTime(2_000 - SWEET_ALERT_CLOSING_MS);
    expect(controller.getState().phase).toBe("closing");
  });

  it("動きを減らす設定では、消え始めたらすぐ消す", () => {
    const { controller } = setup(0);
    controller.show(A);
    vi.advanceTimersByTime(2_000);
    expect(controller.getState().phase).toBe("closing");
    // 0 ミリ秒のタイマー（擬似タイマーは時間を進める途中で作った 0 ミリ秒のタイマーを 1 ミリ秒後に回す）
    vi.advanceTimersByTime(1);
    expect(controller.getState()).toBe(SWEET_ALERT_HIDDEN);
  });

  it("dispose のあとは時間で状態を変えない", () => {
    const { controller, phases } = setup();
    controller.show(A);
    controller.dispose();
    vi.advanceTimersByTime(10_000);
    expect(phases).toEqual(["shown"]);
  });
});

describe("M7-exam-14 R-07 の描いた HTML", () => {
  const html = renderToStaticMarkup(
    createElement(ExamAlertDialog, { textId: "R7-02", onClose: () => undefined }),
  );

  it("根の dialog に role・aria-modal・aria-labelledby・aria-describedby と受験者側のクラス", () => {
    const dialog = /<dialog([^>]*)>/.exec(html)?.[1] ?? "";
    expect(dialog).toContain('class="swal-layer exam-alert"');
    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('aria-modal="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(dialog)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`<h2 class="swal-title" id="${labelledBy}">エラー</h2>`);
    expect(html).toContain(
      `<div class="swal-content" id="${describedBy}">リンクが正しくありません。\n再度ご確認の上、リンクにアクセスしてください。</div>`,
    );
  });

  it("箱はフォーカスを受ける（tabIndex -1）。アイコンとボタンは出さない。.exam-root の中に描く（document.body へ移さない）", () => {
    expect(html).toContain('<div class="swal-modal" tabindex="-1">');
    expect(html).not.toContain("swal-icon-warning");
    expect(html).not.toContain("<button");
    expect(html.startsWith('<div class="exam-alert-host" data-testid="alert-dialog"><dialog')).toBe(
      true,
    );
  });

  it("共用の部品は警告のアイコンを足せる（11-8 §2.12.4）", () => {
    const withIcon = renderToStaticMarkup(
      createElement(SweetAlert, {
        open: false,
        title: "エラー",
        text: "x",
        icon: "warning",
        onClose: () => undefined,
      }),
    );
    expect(withIcon).toContain('<div class="swal-icon-warning" aria-hidden="true">!</div>');
    expect(withIcon).toContain('class="swal-layer"');
  });
});
