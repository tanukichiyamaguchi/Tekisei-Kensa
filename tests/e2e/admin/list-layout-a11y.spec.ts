// M7-list-45 狭い幅・中くらいの幅、M7-list-50 区分メニューの向き（K-43）、M7-list-52 アクセシビリティと焦点の見た目（K-49・K-50）
// （11-2 §5.3。§2.4・§2.6・§2.7・§2.12・§2.22）。11 総論 8.5 の回答一覧の 3 件（利用履歴の表の入れ物、氏名の輪郭と
// チップの並びの間、上に残る見出しの行）もここで確かめる。
// 狭い幅（390×844）の一覧とメニューは、管理画面の最小幅 1280px を外す PR-7.13a が入るまで一覧の幅が 840px 未満にならない
// （今の枠では画面 1280px 以下で一覧の幅は 992px）ので fixme にする（11 総論 5.1。それまでは result-list-css.test.ts で
// §2.22 の宣言の値を確かめる）。最上層に出るポップアップ（入社日・退職日、削除の確認、利用履歴）は画面の幅で大きさが決まるので、
// 390×844 でも今確かめる。狭い幅の fixme の本体は、1440×900 と同じ関数（expectStatusMenuDirections・expectAccessibleListAndMenus）を
// 390×844 で呼ぶ。受験日を過去にするのは E2E に限った直接書き込み（M7-list-52 の「受験から1年以上」のタブ）
import type { Browser, Page, ViewportSize } from "@playwright/test";

import {
  activeOutline,
  addReexam,
  backdateResult,
  COMMON_FOCUS_RING,
  datesDialog,
  expect,
  expectAccessibleAdmin,
  focusByKeyboard,
  LIST_OUTLINE,
  listTools,
  loginViaUi,
  menuItem,
  moreButton,
  openDialog,
  popupMenu,
  rectOf,
  resultRows,
  rowOf,
  seedEmptyOrg,
  seedExam,
  seedManyRows,
  seedName,
  statCard,
  statusChip,
  statusToast,
  test,
  type AdminOrg,
} from "../support/admin-ui";

/** PR-7.13a で外す fixme の理由（11 総論 5.1） */
const NARROW_FIXME =
  "管理画面の最小幅 1280px を外す PR-7.13a まで、一覧の幅が 840px 未満にならない（11 総論 5.1）";

/** 別のブラウザのコンテキストでログインしたページ（オーナー以外・ほかの組織の確かめ）。画面の大きさは viewport（呼んだページと同じ） */
async function loginInNewContext(
  browser: Browser,
  email: string,
  viewport: ViewportSize | null,
): Promise<Page> {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await loginViaUi(page, email);
  return page;
}

type Rect = Awaited<ReturnType<typeof rectOf>>;

/** メニューの全体が画面の中（端から 8px の内側）にある（11-2 §2.12） */
async function expectInsideViewport(page: Page, rect: Rect): Promise<void> {
  const view = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  expect(rect.left).toBeGreaterThanOrEqual(8);
  expect(rect.top).toBeGreaterThanOrEqual(8);
  expect(rect.right).toBeLessThanOrEqual(view.width - 8);
  expect(rect.bottom).toBeLessThanOrEqual(view.height - 8);
}

/**
 * チップの種類をそろえる: 01 を再受験（2回目）、02 を 1 年以上前（E2E に限った直接書き込み）、03 を退職（入社日・退職日あり）、
 * 04 を幹部にする。区分・役職は画面と同じ API（PATCH /api/v1/admin/respondents/{id}）で変える
 */
async function prepareVariedRows(page: Page, org: AdminOrg): Promise<void> {
  addReexam(org, seedExam(org, 1).resultId, 1);
  backdateResult(seedExam(org, 2).resultId, 400);
  const patch = async (index: number, data: unknown) => {
    const res = await page.request.patch(
      `/api/v1/admin/respondents/${seedExam(org, index).respondentId}`,
      { data },
    );
    expect(res.status()).toBe(200);
  };
  await patch(3, { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-03-31" } });
  await patch(4, { staffRole: "leader" });
  await page.reload();
}

/**
 * M7-list-50（11-2 §5.3、K-43）: 上の方の行の区分メニューは下向き、最下部の行（画面の下端の近く）では上向きに開き、メニューの全体が
 * 画面の中にあって 4 つの項目がすべて押せる（開くたびに 1 つずつ）。画面の大きさは page の大きさ。上の方の行はチップを画面の上の方
 * （上端 100px）に置く。最下部の行は一覧を最後までスクロールしてから、チップの下端を画面の下端から 20px に置く（狭い幅のカード型の
 * 行では、最下部の行のチップの下に行の 2・3 段目・さらに表示・注記・余白が続き、最後までスクロールしてもチップが画面の下端の近くに
 * 来ないため）。どちらの向きも、前提（下に入る・入らない）を確かめてから位置を見る
 */
async function expectStatusMenuDirections(page: Page): Promise<void> {
  const menu = popupMenu(page);
  const viewportHeight = await page.evaluate(() => document.documentElement.clientHeight);
  const scrollBy = (dy: number) => page.evaluate((y) => window.scrollBy(0, y), dy);

  // 上の方の行: 下向き（メニューの上端 = チップの下端 + 6）
  const topChip = statusChip(resultRows(page).first());
  await scrollBy((await rectOf(topChip)).top - 100);
  await topChip.click();
  await expect(menu).toBeVisible();
  const topChipRect = await rectOf(topChip);
  const topMenuRect = await rectOf(menu);
  // 下に入る（チップの下端 + 6 + 高さ が 画面の高さ − 8 以下）
  expect(topChipRect.bottom + 6 + (topMenuRect.bottom - topMenuRect.top)).toBeLessThanOrEqual(
    viewportHeight - 8,
  );
  expect(topMenuRect.top).toBeCloseTo(topChipRect.bottom + 6, 1);
  expect(topMenuRect.left).toBeCloseTo(Math.max(8, topChipRect.left), 1);
  await expectInsideViewport(page, topMenuRect);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // 最下部の行: 上向き（メニューの下端 = チップの上端 − 6）
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastRow = resultRows(page).last();
  const lastName = await lastRow.locator(".rl-name").textContent();
  const chip = statusChip(lastRow);
  await scrollBy((await rectOf(chip)).bottom - (viewportHeight - 20));
  const openUpward = async () => {
    await chip.click();
    await expect(menu).toBeVisible();
    const chipRect = await rectOf(chip);
    const menuRect = await rectOf(menu);
    // 下には入りきらない（チップの下端 + 6 + 高さ が 画面の高さ − 8 を超える）
    expect(chipRect.bottom + 6 + (menuRect.bottom - menuRect.top)).toBeGreaterThan(
      viewportHeight - 8,
    );
    expect(menuRect.bottom).toBeCloseTo(chipRect.top - 6, 1);
    expect(menuRect.left).toBeCloseTo(Math.max(8, chipRect.left), 1);
    await expectInsideViewport(page, menuRect);
  };
  const choose = async (label: string, toast: string) => {
    await openUpward();
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().includes("/api/v1/admin/respondents/"),
      ),
      menuItem(page, label).click(),
    ]);
    await expect(statusToast(page)).toHaveText(toast);
    await expect(chip).not.toHaveAttribute("aria-disabled");
  };
  // 今と違う区分を 1 つずつ押す（開くたびに 1 つ）。最後に「入社日・退職日を入れる」でダイアログが開く
  await choose("在籍", `${lastName}さんを「在籍」にしました`);
  await choose("退職", `${lastName}さんを「退職」にしました`);
  await choose("求職者", `${lastName}さんを「求職者」にしました`);
  await openUpward();
  await menuItem(page, "入社日・退職日を入れる").click();
  await expect(datesDialog(page).getByRole("heading")).toHaveText(
    `${lastName}さんの入社日・退職日`,
  );
}

/**
 * M7-list-52 の一覧とメニュー（11-2 §5.3）: 一覧（オーナー・オーナー以外・0 件のすべてと在籍・「受験から1年以上」のタブ）と、
 * ⋮メニュー・区分メニュー・リンクのメニューを開いた状態で、axe の重大・深刻な違反が無い。チップの種類をそろえてから調べる。
 * 画面の大きさは page の大きさ（オーナー以外と 0 件の組織のページも同じ大きさにする）。終わると page はオーナーの一覧のまま
 */
async function expectAccessibleListAndMenus(
  page: Page,
  browser: Browser,
  org: AdminOrg,
  size: string,
): Promise<void> {
  await loginViaUi(page, org.ownerEmail);
  await prepareVariedRows(page, org);
  await expect(rowOf(page, seedName(1)).locator(".rl-chip--nth")).toHaveText("2回目");
  await expect(rowOf(page, seedName(3)).locator(".rl-chip--date")).toHaveText([
    "入社 2025/4/1",
    "退職 2026/3/31",
  ]);
  await expect(rowOf(page, seedName(4)).locator(".rl-chip--leader")).toHaveText("幹部");
  await expectAccessibleAdmin(page, `一覧（オーナー。${size}）`);

  await statCard(page, 3).click();
  await expect(listTools(page).tab("受験から1年以上")).toHaveAttribute("aria-selected", "true");
  await expectAccessibleAdmin(page, `受験から1年以上のタブ（${size}）`);
  await listTools(page).tab("すべて").click();

  // メニュー 3 つ
  await moreButton(rowOf(page, seedName(1))).click();
  await expect(popupMenu(page)).toBeVisible();
  await expectAccessibleAdmin(page, `⋮メニュー（${size}）`);
  await page.keyboard.press("Escape");
  await statusChip(rowOf(page, seedName(3))).click();
  await expect(popupMenu(page)).toBeVisible();
  await expectAccessibleAdmin(page, `区分メニュー（${size}）`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "回答リンクをコピー" }).click();
  await expect(popupMenu(page)).toBeVisible();
  await expectAccessibleAdmin(page, `リンクのメニュー（${size}）`);
  await page.keyboard.press("Escape");
  await expect(popupMenu(page)).toHaveCount(0);

  // オーナー以外の一覧
  const adminPage = await loginInNewContext(browser, org.adminEmail, page.viewportSize());
  await expectAccessibleAdmin(adminPage, `一覧（オーナー以外。${size}）`);
  await adminPage.context().close();

  // 0 件の一覧（すべて・在籍）
  const empty = seedEmptyOrg();
  const emptyPage = await loginInNewContext(browser, empty.ownerEmail, page.viewportSize());
  await expect(emptyPage.locator(".rl-empty")).toBeVisible();
  await expectAccessibleAdmin(emptyPage, `0 件（すべて。${size}）`);
  await listTools(emptyPage).tab("在籍").click();
  await expect(listTools(emptyPage).tab("在籍")).toHaveAttribute("aria-selected", "true");
  await expectAccessibleAdmin(emptyPage, `0 件（在籍。${size}）`);
  await emptyPage.context().close();
}

test("M7-list-45 中くらいの幅（1000×800）: 時刻とオフの「集計に含む」を隠し、「除外中」は出す", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await loginViaUi(page, adminOrg.ownerEmail);
  // 一覧の幅で切り替える（§2.22）。今の枠（最小幅 1280px）では 992px で中くらい
  const width = await page.locator(".rl-root").evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(840);
  expect(width).toBeLessThan(1100);
  await expect(resultRows(page).first().locator(".rl-latest__time")).toBeHidden();
  await expect(rowOf(page, seedName(1)).locator(".rl-switch__label")).toBeHidden();
  await expect(rowOf(page, seedName(10)).locator(".rl-switch__label")).toBeVisible();
  await expect(rowOf(page, seedName(10)).locator(".rl-switch__label")).toHaveText("除外中");
  // 件数は次の段に幅いっぱいで右寄せ
  await expect(listTools(page).count).toHaveCSS("text-align", "right");
});

test("M7-list-50 区分メニューは最下部の行でチップの上に、上の方の行では下に開き、4 つの項目がすべて押せる（1440×900）", async ({
  page,
}) => {
  const org = seedManyRows(105);
  await loginViaUi(page, org.ownerEmail);
  await expectStatusMenuDirections(page);
});

test("M7-list-52 1440×900 の一覧（オーナー・オーナー以外・0 件・受験から1年以上）、メニュー 3 つ、ポップアップ 3 つで axe の重大・深刻な違反が無い", async ({
  page,
  browser,
  adminOrg,
}) => {
  await expectAccessibleListAndMenus(page, browser, adminOrg, "1440×900");

  // ポップアップ 3 つ
  await moreButton(rowOf(page, seedName(3))).click();
  await menuItem(page, "入社日・退職日を入れる").click();
  await expect(datesDialog(page)).toBeVisible();
  await expectAccessibleAdmin(page, "入社日・退職日");
  await datesDialog(page).getByRole("button", { name: "やめる" }).click();
  await moreButton(rowOf(page, seedName(1))).click();
  await menuItem(page, "この受験を削除").click();
  await expect(openDialog(page)).toBeVisible();
  await expectAccessibleAdmin(page, "削除の確認");
  await openDialog(page).getByRole("button", { name: "キャンセル" }).click();
  await page.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  await expect(openDialog(page).getByTestId("usage-log-table")).toBeVisible();
  await expectAccessibleAdmin(page, "利用履歴");
  await openDialog(page).locator(".rl-usage-close").click();
});

test("M7-list-52 390×844 の 3 つのポップアップで axe の違反が無く、利用履歴の表の入れ物は横に動くときだけ焦点を受ける（総論 8.5 (a)）", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaUi(page, adminOrg.ownerEmail);
  const within = async (label: string, box: { left: number; right: number }) => {
    expect(box.left, label).toBeGreaterThanOrEqual(16 - 0.5);
    expect(box.right, label).toBeLessThanOrEqual(390 - 16 + 0.5);
  };

  // 入社日・退職日（最大の幅 380px で、左右 16px を残す）
  await moreButton(rowOf(page, seedName(2))).click();
  await menuItem(page, "入社日・退職日を入れる").click();
  await expect(datesDialog(page)).toBeVisible();
  await within("入社日・退職日", await rectOf(datesDialog(page)));
  await expectAccessibleAdmin(page, "入社日・退職日（390）");
  await datesDialog(page).getByRole("button", { name: "やめる" }).click();

  // 削除の確認（画面の幅 − 32px を超えない）
  await moreButton(rowOf(page, seedName(2))).click();
  await menuItem(page, "この受験を削除").click();
  await expect(openDialog(page)).toBeVisible();
  await within("削除の確認", await rectOf(openDialog(page)));
  await expectAccessibleAdmin(page, "削除の確認（390）");
  await openDialog(page).getByRole("button", { name: "キャンセル" }).click();

  // 利用履歴: 表は入れ物の中で横に動き、そのときだけ入れ物が焦点を受ける（tabindex 0・role region・見出しと同じ読み上げ名）
  await page.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  const dialog = openDialog(page);
  await expect(dialog.getByTestId("usage-log-table")).toBeVisible();
  await within("利用履歴", await rectOf(dialog));
  const scroller = dialog.locator(".rl-usage__scroll");
  const overflow = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  await expect(scroller).toHaveAttribute("tabindex", "0");
  await expect(scroller).toHaveAttribute("role", "region");
  await expect(scroller).toHaveAttribute("aria-label", "利用履歴（ローカル歯科医院）");
  await expectAccessibleAdmin(page, "利用履歴（390）");
  await dialog.locator(".rl-usage-close").click();

  // 1440×900 では表がはみ出さないので、入れ物は焦点を受けない
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  await expect(openDialog(page).getByTestId("usage-log-table")).toBeVisible();
  await expect(openDialog(page).locator(".rl-usage__scroll")).not.toHaveAttribute("tabindex");
});

test("M7-list-52 焦点の見た目: 区分チップ・絞り込みを解除・ダイアログの中は共通の焦点の枠、メニューの項目と 0 件のボタンは一覧の輪郭、区分タブは内側、検索欄は枠", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const tools = listTools(page);
  const row = rowOf(page, seedName(2));

  // 区分チップ（参照元に焦点の定めが無い）: 管理画面に共通の焦点の枠
  await focusByKeyboard(statusChip(row));
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);

  // 一覧の輪郭（参照元の ad-app の指定）: ⋮・結果を見る・チームの選択・スイッチ・氏名
  for (const target of [
    moreButton(row),
    row.getByRole("link", { name: "結果を見る" }),
    row.getByRole("combobox"),
    row.getByRole("switch"),
    row.getByRole("link", { name: seedName(2), exact: true }),
  ]) {
    await focusByKeyboard(target);
    expect(await activeOutline(page)).toEqual(LIST_OUTLINE);
  }

  // メニューの項目: ⋮をキーボードで開くと最初の項目に一覧の輪郭、↓で移っても同じ
  await focusByKeyboard(moreButton(row));
  await page.keyboard.press("Enter");
  await expect(popupMenu(page).getByRole("menuitem").first()).toBeFocused();
  expect(await activeOutline(page)).toEqual(LIST_OUTLINE);
  await page.keyboard.press("ArrowDown");
  expect(await activeOutline(page)).toEqual(LIST_OUTLINE);
  await page.keyboard.press("Escape");

  // 区分タブ: 一覧の輪郭をタブの内側に描く（outline-offset -4px。輪郭の外の端が縁から 2px 内側）
  await focusByKeyboard(tools.tab("求職者"));
  const tab = await activeOutline(page);
  expect(tab).toEqual({ ...LIST_OUTLINE, offset: "-4px" });
  expect(Number.parseFloat(tab.offset) + Number.parseFloat(tab.width)).toBeLessThanOrEqual(-2);
  const tabRect = await rectOf(tools.tab("求職者"));
  const tabsRect = await rectOf(page.locator(".rl-tabs"));
  expect(tabRect.left).toBeGreaterThanOrEqual(tabsRect.left);
  expect(tabRect.right).toBeLessThanOrEqual(tabsRect.right);

  // 検索欄: 入力欄に輪郭を出さず、検索欄の枠を #3F8DA5 にする
  await focusByKeyboard(tools.search);
  expect((await activeOutline(page)).style).toBe("none");
  await expect(page.locator(".rl-search")).toHaveCSS("border-top-color", "rgb(63, 141, 165)");
  await page.locator(".rl-desc").click();
  await expect(page.locator(".rl-search")).toHaveCSS("border-top-color", "rgb(122, 146, 174)");

  // 件数の横の「絞り込みを解除」: 共通の焦点の枠
  await tools.search.fill("テスト");
  await expect(tools.clear).toBeVisible();
  await focusByKeyboard(tools.clear);
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);

  // 0 件の表示のボタン: 一覧の輪郭
  await tools.search.fill("一致しない語");
  const emptyButton = page.locator(".rl-empty").getByRole("button", { name: "絞り込みを解除" });
  await expect(emptyButton).toBeVisible();
  await focusByKeyboard(emptyButton, true);
  expect(await activeOutline(page)).toEqual(LIST_OUTLINE);
  await emptyButton.click();
  await expect(resultRows(page)).toHaveCount(10);

  // 入社日・退職日のダイアログの中: 入力欄とボタンは共通の焦点の枠
  await moreButton(row).click();
  await menuItem(page, "入社日・退職日を入れる").click();
  const dates = datesDialog(page);
  for (const target of [
    dates.getByLabel("入社日", { exact: true }),
    dates.getByLabel("退職日（退職した人だけ）"),
    dates.getByRole("button", { name: "やめる" }),
  ]) {
    await focusByKeyboard(target);
    expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  }
  await focusByKeyboard(dates.getByRole("button", { name: "保存する" }), true);
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await dates.getByRole("button", { name: "やめる" }).click();

  // 削除の確認の中: 閉じるアイコン・削除する・キャンセル
  await moreButton(row).click();
  await menuItem(page, "この受験を削除").click();
  const confirm = openDialog(page);
  for (const [target, backward] of [
    [confirm.getByRole("button", { name: "閉じる" }), false],
    [confirm.getByRole("button", { name: "削除する" }), false],
    [confirm.getByRole("button", { name: "キャンセル" }), true],
  ] as const) {
    await focusByKeyboard(target, backward);
    expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  }
  await confirm.getByRole("button", { name: "キャンセル" }).click();

  // 利用履歴の中: 閉じるアイコンと「閉じる」
  await page.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  const usage = openDialog(page);
  await expect(usage.getByTestId("usage-log-table")).toBeVisible();
  await focusByKeyboard(usage.locator(".dialog__header").getByRole("button", { name: "閉じる" }));
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await focusByKeyboard(usage.locator(".rl-usage-close"), true);
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
});

test("総論 8.5 (b) 氏名のリンクの輪郭はチップの並びに重ならず、(c) スクロールのあと見出しの行が上に残り、Shift+Tab で戻った部品はその下に出る", async ({
  page,
}) => {
  const org = seedManyRows(105);
  await loginViaUi(page, org.ownerEmail);

  // (b) 氏名のリンクは inline のまま描き、輪郭（2px を 2px 外側）の下端がチップの並びの上端を越えない
  const first = resultRows(page).first();
  const name = first.locator(".rl-name");
  await expect(name).toHaveCSS("display", "inline");
  const nameRect = await rectOf(name);
  const chipsRect = await rectOf(first.locator(".rl-chips"));
  expect(nameRect.bottom + 4).toBeLessThanOrEqual(chipsRect.top);

  // (c) 見出しの行が上に残る（position: sticky）。ある行の⋮を見出しの行の下に隠れる位置まで動かし、次の行の氏名から
  // Shift+Tab で戻ると、その⋮が見出しの行の下に出る（一覧があるときだけ根のスクロールに scroll-padding-top 48px）
  const head = page.locator("[data-testid=result-table] thead th").first();
  const k = 20;
  const hidden = moreButton(resultRows(page).nth(k));
  await hidden.scrollIntoViewIfNeeded();
  const headRect0 = await rectOf(head);
  const hiddenRect0 = await rectOf(hidden);
  await page.evaluate(
    (dy) => window.scrollBy(0, dy),
    hiddenRect0.top - Math.max(headRect0.top, 0) - 4,
  );
  const headRect = await rectOf(head);
  expect(headRect.top).toBeCloseTo(0, 0);
  const hiddenRect = await rectOf(hidden);
  expect(hiddenRect.bottom).toBeLessThanOrEqual(headRect.bottom);
  await focusByKeyboard(
    resultRows(page)
      .nth(k + 1)
      .locator(".rl-name"),
  );
  await page.keyboard.press("Shift+Tab");
  await expect(hidden).toBeFocused();
  const after = await rectOf(hidden);
  const headAfter = await rectOf(head);
  expect(headAfter.top).toBeCloseTo(0, 0);
  expect(after.top).toBeGreaterThanOrEqual(headAfter.bottom);
});

// 狭い幅（390×844）の一覧とメニュー。PR-7.13a で fixme を外す（11-2 §5.3 の M7-list-45・50・52 の狭い幅の分）
test.describe("狭い幅（390×844）の一覧とメニュー", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-list-45 狭い幅（390×844）: カード型の行（2 列 3 段）、集計カード 2 列、タブと検索が幅いっぱい、ページが横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, adminOrg.ownerEmail);
    const row = resultRows(page).first();
    await expect(row).toHaveCSS("display", "grid");
    await expect(page.locator("[data-testid=result-table] thead")).toBeHidden();
    await expect(page.locator(".rl-stats")).toHaveCSS("grid-template-columns", /^\S+ \S+$/);
    const tools = await rectOf(page.locator(".rl-tools"));
    const tabs = await rectOf(page.locator(".rl-tabs"));
    const search = await rectOf(page.locator(".rl-search"));
    expect(Math.round(tabs.right - tabs.left)).toBe(Math.round(tools.right - tools.left));
    expect(Math.round(search.right - search.left)).toBe(Math.round(tools.right - tools.left));
    await expect(row.locator(".rl-latest__time")).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("M7-list-50 狭い幅（390×844）でも区分メニューは最下部の行でチップの上に、上の方の行では下に開き、4 つの項目がすべて押せる", async ({
    page,
  }) => {
    const org = seedManyRows(105);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, org.ownerEmail);
    await expectStatusMenuDirections(page);
  });

  test("M7-list-52 390×844 の一覧（オーナー・オーナー以外・0 件・受験から1年以上）とメニュー 3 つで axe の重大・深刻な違反が無い", async ({
    page,
    browser,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAccessibleListAndMenus(page, browser, adminOrg, "390×844");
  });
});
