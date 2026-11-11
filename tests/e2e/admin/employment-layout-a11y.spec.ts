// M7-zaiseki-48 アクセシビリティと焦点の見た目（K-49・K-50）、M7-zaiseki-43 狭い幅（K-22）の在籍・退職の分（11-3 §5.3。§2.13〜§2.16・
// §2.19・§2.22）。axe は color-contrast も検査し、対象から外すのは押せない状態の表示（保存中に aria-disabled にした「変更」）と文字のロゴ
// 「適性検査」だけ（expectAccessibleAdmin）。ページの地は今の .admin-root の地 #F3F5F8 のまま検査する（ページの地の上の 3 つの文字
// （K-49 の表の 25・27・30）は、PR-7.13a までは今の地の上で選んだ色。11-3 §2.22 の 1.2 版、11 総論 8.5）。
// ページ全体の狭い幅（390×844・1000×800）は、管理画面の最小幅 1280px を外す PR-7.13a が入るまで本文の幅が 700px・760px 以下にならない
// （今の枠では画面 1280px 以上で本文の幅は約 977〜1200px。1440×900 では約 1152px）ので fixme にする（11 総論 5.1、11-3 §4.4）。それまでは
// 1440×900 のまま .ob-root の幅を直接狭くした部品の形で確かめる。最上層に出る変更ダイアログは画面の幅で大きさが決まるので、390×844 でも
// 今確かめる。区分は画面と同じ API（PATCH /api/v1/admin/respondents/{id}）で変える
import type { Locator, Page } from "@playwright/test";

import {
  activeOutline,
  COMMON_FOCUS_RING,
  emEdit,
  emEditButton,
  emRow,
  emTab,
  expect,
  expectAccessibleAdmin,
  expectNoHorizontalScroll,
  focusByKeyboard,
  loginViaUi,
  OB_ROOT_OUTLINE,
  obRoot,
  pgGo,
  rectOf,
  retRow,
  seedEmptyOrg,
  seedExam,
  test,
  type AdminOrg,
} from "../support/admin-ui";

/** PR-7.13a で外す fixme の理由（11 総論 5.1） */
const NARROW_FIXME =
  "管理画面の最小幅 1280px を外す PR-7.13a まで、本文の幅が 700px・760px 以下にならない（11 総論 5.1）";

async function openEmployment(page: Page): Promise<void> {
  await page.goto("/admin/employment");
  await expect(page.locator(".ob-pg")).toBeVisible();
}

/** 01 を退職（入社日・退職日あり）にする。09（既存スタッフ）は在籍で入社日なし（勤続未入力者のカードと注意書きが出る） */
async function prepareLeft(page: Page, org: AdminOrg): Promise<void> {
  const res = await page.request.patch(
    `/api/v1/admin/respondents/${seedExam(org, 1).respondentId}`,
    { data: { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-03-31" } } },
  );
  expect(res.status()).toBe(200);
}

/** .ob-root の幅を直接変える（本文の幅のコンテナクエリを確かめる。§2.19） */
async function setBodyWidth(page: Page, width: number | null): Promise<void> {
  await obRoot(page).evaluate((el, w) => {
    (el as HTMLElement).style.width = w === null ? "" : `${w}px`;
  }, width);
}

/** .ob-root の中身が横にはみ出さない（中のどの要素の右端も .ob-root の右端を超えない） */
async function expectInsideBody(page: Page, label: string): Promise<void> {
  const over = await obRoot(page).evaluate((root) => {
    const right = root.getBoundingClientRect().right;
    let max = 0;
    for (const el of root.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) max = Math.max(max, r.right - right);
    }
    return { max, scroll: root.scrollWidth - root.clientWidth };
  });
  expect(over.max, label).toBeLessThanOrEqual(0.5);
  expect(over.scroll, label).toBeLessThanOrEqual(0);
}

const css = (locator: Locator, property: string, pseudo: string | null = null) =>
  locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps).getPropertyValue(p as string), [
    property,
    pseudo,
  ] as const);

const columns = async (locator: Locator) =>
  (await css(locator, "grid-template-columns")).split(" ");

/** 変更ダイアログの区分のボタン */
const statusButton = (page: Page, label: "在籍" | "退職" | "求職者") =>
  emEdit(page).locator(".pgd-seg").getByRole("button", { name: label, exact: true });

test("M7-zaiseki-48 1440×900: 分析（勤続未入力者のカードと注意書き）・在籍者・退職者・求職者・0 人の表示・変更ダイアログ・保存中で axe の重大・深刻な違反が無い", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await prepareLeft(page, adminOrg);
  await openEmployment(page);
  await expect(page.locator(".ob-ret .ret-k.warn")).toBeVisible();
  await expect(page.locator(".ob-ret .ret-note")).toBeVisible();
  await expectAccessibleAdmin(page, "分析");
  for (const tab of ["stay", "left", "seek"] as const) {
    await emTab(page, tab).click();
    await expect(page.locator(".ob-pg .pg-list"), tab).toBeVisible();
    await expectAccessibleAdmin(page, `一覧（${tab}）`);
  }

  // 変更ダイアログ（退職を選んで退職日の欄が出た状態と、エラーの文が出た状態）
  const row04 = emRow(page, seedExam(adminOrg, 4).resultId);
  await emEditButton(row04).click();
  await expect(emEdit(page)).toBeVisible();
  await expectAccessibleAdmin(page, "変更ダイアログ");
  await statusButton(page, "退職").click();
  await emEdit(page).getByLabel("入社日").fill("2026-04-01");
  await emEdit(page).getByLabel("退職日").fill("2026-03-31");
  await emEdit(page).getByRole("button", { name: "保存する" }).click();
  await expect(emEdit(page).getByRole("alert")).toHaveText("退職日が入社日より前になっています。");
  await expectAccessibleAdmin(page, "変更ダイアログ（退職日の欄とエラー）");
  await emEdit(page).getByRole("button", { name: "やめる" }).click();
  await expect(emEdit(page)).toHaveCount(0);

  // 保存中（応答を止める）: aria-disabled の「変更」だけが color-contrast の対象外
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/admin/respondents/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await held;
    return route.continue();
  });
  await emEditButton(row04).click();
  await emEdit(page).getByLabel("入社日").fill("2025-04-01");
  await emEdit(page).getByRole("button", { name: "保存する" }).click();
  await expect(emEditButton(row04)).toHaveAttribute("aria-disabled", "true");
  await expectAccessibleAdmin(page, "保存中");
  release();
  await expect(emEditButton(row04)).not.toHaveAttribute("aria-disabled");
  await page.unroute("**/api/v1/admin/respondents/**");

  // 0 人の表示（受験の無い組織）
  const empty = seedEmptyOrg();
  const emptyPage = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await loginViaUi(emptyPage, empty.ownerEmail);
  await openEmployment(emptyPage);
  await expectAccessibleAdmin(emptyPage, "分析（0 人）");
  for (const tab of ["stay", "left", "seek"] as const) {
    await emTab(emptyPage, tab).click();
    await expect(emptyPage.locator(".ob-pg .pg-emp"), tab).toBeVisible();
    await expectAccessibleAdmin(emptyPage, `0 人の表示（${tab}）`);
  }
  await emptyPage.context().close();
});

test("M7-zaiseki-48 焦点の見た目: タブと「変更」は .ob-root の輪郭、「回答一覧を開く →」と変更ダイアログの中の部品（区分のボタン・2 つの日付の欄・「やめる」「保存する」）は共通の焦点の枠", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openEmployment(page);

  // タブ（.ob-root の中のボタン）: .ob-root の輪郭（参照元の ob-map の指定）
  for (const tab of ["an", "stay", "left", "seek"] as const) {
    await focusByKeyboard(emTab(page, tab), tab === "seek");
    expect(await activeOutline(page), tab).toEqual(OB_ROOT_OUTLINE);
  }
  await emTab(page, "stay").click();
  const button = emEditButton(emRow(page, seedExam(adminOrg, 9).resultId));
  await focusByKeyboard(button);
  expect(await activeOutline(page)).toEqual(OB_ROOT_OUTLINE);
  // 「回答一覧を開く →」（参照元に定めが無い）: 共通の焦点の枠（ブラウザの既定の輪郭でない）
  await focusByKeyboard(pgGo(page), true);
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);

  // キーボードで開くと選択中の区分のボタンに焦点。ダイアログの中の部品は共通の焦点の枠
  await focusByKeyboard(button);
  await page.keyboard.press("Enter");
  await expect(statusButton(page, "在籍")).toBeFocused();
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await statusButton(page, "退職").click();
  const parts: ReadonlyArray<readonly [string, Locator, boolean]> = [
    ["在籍", statusButton(page, "在籍"), false],
    ["退職", statusButton(page, "退職"), false],
    ["求職者", statusButton(page, "求職者"), false],
    ["入社日", emEdit(page).getByLabel("入社日"), false],
    ["退職日", emEdit(page).getByLabel("退職日"), false],
    ["やめる", emEdit(page).getByRole("button", { name: "やめる" }), false],
    ["保存する", emEdit(page).getByRole("button", { name: "保存する" }), true],
  ];
  for (const [label, target, backward] of parts) {
    await focusByKeyboard(target, backward);
    expect(await activeOutline(page), label).toEqual(COMMON_FOCUS_RING);
  }
  // Esc で閉じると「変更」に焦点が戻る（.ob-root の輪郭）
  await page.keyboard.press("Escape");
  await expect(emEdit(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await activeOutline(page)).toEqual(OB_ROOT_OUTLINE);
});

test("M7-zaiseki-43 本文の幅（.ob-root を直接狭くする。1440×900）: 690px で一覧が 2 列・見出しの行なし・ラベルあり・h1 20px・お名前と「変更」が行の幅いっぱい、750px で一覧は 6 列のまま分析の表が 3 列、1150px で両方とも広い形。中身が本文から横にはみ出さない", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await prepareLeft(page, adminOrg);
  await openEmployment(page);
  const row = emRow(page, seedExam(adminOrg, 1).resultId);
  const header = page.locator(".ob-pg .pg-row.hd");
  const tableRow = retRow(page, "attendant");

  // 690px（700px 以下）: 一覧は 2 列・見出しの行なし・値の前のラベル・h1 20px・お名前と「変更」は行の幅いっぱい（「変更」は右寄せ）
  await setBodyWidth(page, 690);
  await emTab(page, "left").click();
  expect(await columns(row)).toHaveLength(2);
  await expect(header).toBeHidden();
  await expect(row.locator(".pg-lb")).toHaveText(["入社", "退職", "勤続"]);
  for (const label of await row.locator(".pg-lb").all()) {
    await expect(label).toBeVisible();
    expect(await css(label, "display")).toBe("inline");
  }
  expect(await css(page.locator(".ob-pg h1"), "font-size")).toBe("20px");
  const rowBox = await rectOf(row);
  const inner = rowBox.right - rowBox.left - 2 * 16 - 2; // 内側の余白 16px と枠 1px
  for (const cell of [".pg-nm", ".pg-ed"]) {
    const box = await rectOf(row.locator(cell));
    expect(Math.round(box.right - box.left), cell).toBe(Math.round(inner));
  }
  expect(await css(row.locator(".pg-ed"), "text-align")).toBe("right");
  const edit = await rectOf(emEditButton(row));
  expect(Math.round(edit.right)).toBe(Math.round(rowBox.right - 17));
  await expectInsideBody(page, "690px 一覧");
  // 分析の表も 760px 以下の形
  await emTab(page, "an").click();
  expect(await columns(tableRow)).toHaveLength(3);
  await expectInsideBody(page, "690px 分析");

  // 750px（760px 以下・700px より広い）: 一覧は 6 列のまま、分析の表は 3 列（在籍・退職の列は 48px）で、退職の割合と 2 つの勤続が次の行
  await setBodyWidth(page, 750);
  const cells = await columns(tableRow);
  expect(cells).toHaveLength(3);
  expect(cells.slice(1)).toEqual(["48px", "48px"]);
  for (const c of ["c4", "c5", "c6"]) {
    await expect(page.locator(`.ret-r.hd .${c}`), c).toBeHidden();
  }
  const tableBox = await rectOf(tableRow);
  const tableInner = tableBox.right - tableBox.left - 2 * 16; // 内側の余白 16px
  const who = await rectOf(tableRow.locator(".c1"));
  for (const c of ["c4", "c5", "c6"]) {
    const box = await rectOf(tableRow.locator(`.${c}`));
    expect(Math.round(box.right - box.left), c).toBe(Math.round(tableInner));
    expect(box.top, c).toBeGreaterThan(who.bottom);
  }
  expect(await css(tableRow.locator(".c5"), "content", "::before")).toBe('"勤続（退職した人）"');
  expect(await css(tableRow.locator(".c6"), "content", "::before")).toBe('"勤続（在籍中）"');
  expect(await css(tableRow.locator(".c5"), "justify-content")).toBe("space-between");
  await expectInsideBody(page, "750px 分析");
  await emTab(page, "left").click();
  expect(await columns(row)).toHaveLength(6);
  await expect(header).toBeVisible();
  await expect(row.locator(".pg-lb").first()).toBeHidden();
  expect(await css(page.locator(".ob-pg h1"), "font-size")).toBe("24px");
  await expectInsideBody(page, "750px 一覧");

  // 1150px: 一覧も分析の表も広い形（6 列）
  await setBodyWidth(page, 1150);
  expect(await columns(row)).toHaveLength(6);
  await expectInsideBody(page, "1150px 一覧");
  await emTab(page, "an").click();
  expect(await columns(tableRow)).toHaveLength(6);
  await expect(page.locator(".ret-r.hd .c4")).toBeVisible();
  expect(await css(tableRow.locator(".c5"), "content", "::before")).toBe("none");
  await expectInsideBody(page, "1150px 分析");
  await setBodyWidth(page, null);
});

test("M7-zaiseki-43・48 変更ダイアログの大きさ: 1440 では最大の幅 380px、390×844 では画面の幅 − 32px（358px）で、どちらも画面の中央。カードの外を押すと閉じ、axe の違反が無い", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openEmployment(page);
  await emTab(page, "stay").click();
  const button = emEditButton(emRow(page, seedExam(adminOrg, 9).resultId));
  const dialog = emEdit(page);

  await button.click();
  await expect(dialog).toBeVisible();
  let box = await rectOf(dialog);
  expect(Math.round(box.right - box.left)).toBe(380);
  expect(Math.round(box.left)).toBe((1440 - 380) / 2);
  expect(Math.abs((box.top + box.bottom) / 2 - 900 / 2)).toBeLessThanOrEqual(1);
  // カードが要素いっぱいを占める（カードの外は dialog 自身）
  const card = await rectOf(dialog.locator(".pgd-card"));
  expect(card).toEqual(box);
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await button.click();
  await expect(dialog).toBeVisible();
  box = await rectOf(dialog);
  expect(Math.round(box.right - box.left)).toBe(390 - 32);
  expect(Math.round(box.left)).toBe(16);
  expect(Math.abs((box.top + box.bottom) / 2 - 844 / 2)).toBeLessThanOrEqual(1);
  await expectAccessibleAdmin(page, "変更ダイアログ（390×844）");
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});

// ページ全体の狭い幅。PR-7.13a で fixme を外す（11-3 §5.3 の M7-zaiseki-43・48 のページ全体の分）
test.describe("ページ全体の狭い幅（390×844・1000×800）", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-zaiseki-43 390×844: 一覧が 2 列でラベル付き、分析の表が 3 列、ページ全体が横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await prepareLeft(page, adminOrg);
    await openEmployment(page);
    expect(await columns(retRow(page, "attendant"))).toHaveLength(3);
    await expectInsideBody(page, "390×844 分析");
    await emTab(page, "left").click();
    const row = emRow(page, seedExam(adminOrg, 1).resultId);
    expect(await columns(row)).toHaveLength(2);
    await expect(row.locator(".pg-lb").first()).toBeVisible();
    await expectInsideBody(page, "390×844 一覧");
    await expectNoHorizontalScroll(page, "390×844");
  });

  test("M7-zaiseki-43 1000×800: 本文の幅に応じた形で、一覧と表が本文からはみ出さず、ページ全体が横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await prepareLeft(page, adminOrg);
    await openEmployment(page);
    await expectInsideBody(page, "1000×800 分析");
    await emTab(page, "left").click();
    await expectInsideBody(page, "1000×800 一覧");
    await expectNoHorizontalScroll(page, "1000×800");
  });

  test("M7-zaiseki-48 390×844 のページ（分析・退職者）で axe の重大・深刻な違反が無い", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await prepareLeft(page, adminOrg);
    await openEmployment(page);
    await expectAccessibleAdmin(page, "分析（390×844）");
    await emTab(page, "left").click();
    await expectAccessibleAdmin(page, "退職者（390×844）");
  });
});
