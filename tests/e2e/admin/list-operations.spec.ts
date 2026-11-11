// M7-list-39 チーム・除外、M7-list-40 区分・入社日・退職日、M7-list-41 ⋮メニュー、M7-list-42 役職、M7-list-43 削除、
// M7-list-44 利用履歴（11-2 §5.3。E-16・E-17 の改め。§2.10〜§2.18・§2.20）。
// 再受験のつながりは、seed:local と同じリポジトリの関数で前回の候補を付けて登録・送信して作る（直接は書かない）
import {
  addReexam,
  alertToast,
  datesDialog,
  expect,
  loginViaUi,
  menuItem,
  moreButton,
  openDialog,
  popupMenu,
  rectOf,
  resultRows,
  rowOf,
  seedExam,
  seedName,
  statusChip,
  statusToast,
  test,
  todayInTokyo,
  watchToastLifetime,
} from "../support/admin-ui";

const isPatch = (url: string, method: string) =>
  method === "PATCH" && url.includes("/api/v1/admin/respondents/");

test("M7-list-39 チームの変更と未設定への戻し、除外のスイッチは通知を出して保存され、失敗すると元に戻る", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const name = seedName(6);
  const team = rowOf(page, name).getByRole("combobox", { name: `${name}のチーム` });
  await expect(team).toHaveValue("");

  // 通知は 2.2 秒で消える（§2.20）
  const lifetime = await watchToastLifetime(page);
  const [patch] = await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    team.selectOption("A"),
  ]);
  expect(patch.request().postDataJSON()).toEqual({ teamCode: "A" });
  expect(patch.status()).toBe(200);
  await expect(statusToast(page)).toHaveText(`${name}さんをAチームにしました`);
  await expect(team).toHaveValue("A");
  const shown = await lifetime();
  expect(shown).toBeGreaterThanOrEqual(2150);
  expect(shown).toBeLessThan(2800);
  await page.reload();
  await expect(rowOf(page, name).getByRole("combobox")).toHaveValue("A");

  // チーム未設定に戻せる（K-32 ⑦。通知は 7 章の案）
  const [unset] = await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    rowOf(page, name).getByRole("combobox").selectOption(""),
  ]);
  expect(unset.request().postDataJSON()).toEqual({ teamCode: null });
  expect(unset.status()).toBe(200);
  await expect(statusToast(page)).toHaveText(`${name}さんをチーム未設定にしました`);
  await page.reload();
  await expect(rowOf(page, name).getByRole("combobox")).toHaveValue("");

  // 除外のスイッチ（§2.11）。新しい通知は前の通知を置き換える（1 件ずつ）
  const exclude = rowOf(page, name).getByRole("switch", {
    name: `${name}を組織内分類の集計から除外`,
  });
  // 送信中の行は操作の要素を aria-disabled にして重ねて送らせない（§2.23）。応答のあとに押す
  await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    exclude.click(),
  ]);
  await expect(exclude).toHaveAttribute("aria-checked", "true");
  await expect(exclude).toHaveText("除外中");
  await expect(statusToast(page)).toHaveText(`${name}さんを集計から除外しました`);
  await expect(exclude).not.toHaveAttribute("aria-disabled");
  await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    exclude.click(),
  ]);
  await expect(exclude).toHaveAttribute("aria-checked", "false");
  await expect(exclude).toHaveText("集計に含む");
  await expect(page.locator(".toast")).toHaveCount(1);
  await expect(statusToast(page)).toHaveText(`${name}さんを集計に戻しました`);
  await expect(exclude).not.toHaveAttribute("aria-disabled");

  // 失敗（500）: 応答を止めて押した直後を確かめる。表示をすぐ変えて通知を出し（保存の完了を待たない。§2.20）、送信中は行の操作の
  // 要素を aria-disabled にして重ねて送らない（§2.23）。そのあと 500 を返すと、表示を元に戻してエラーの通知（role="alert"）に置き換える
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let patches = 0;
  await page.route("**/api/v1/admin/respondents/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches += 1;
    await held;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INTERNAL_ERROR", message: "サーバでエラーが発生しました", details: {} },
      }),
    });
  });
  const row = rowOf(page, name);
  const controls = [exclude, row.getByRole("combobox"), statusChip(row), moreButton(row)];
  await exclude.click();
  await expect(exclude).toHaveAttribute("aria-checked", "true");
  await expect(exclude).toHaveText("除外中");
  await expect(statusToast(page)).toHaveText(`${name}さんを集計から除外しました`);
  for (const control of controls) await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => patches).toBe(1);
  // 送信中の行は変更を受け付けない（押しても表示は変わらず、2 回目の PATCH は送らない）
  await exclude.click({ force: true });
  await expect(exclude).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(300);
  expect(patches).toBe(1);
  release();
  await expect(alertToast(page)).toHaveText("サーバでエラーが発生しました");
  await expect(page.locator(".toast")).toHaveCount(1);
  await expect(exclude).toHaveAttribute("aria-checked", "false");
  await expect(exclude).toHaveText("集計に含む");
  for (const control of controls) await expect(control).not.toHaveAttribute("aria-disabled");
  await page.unroute("**/api/v1/admin/respondents/**");
});

test("M7-list-40 区分メニューで退職にすると今日の退職のチップ、入社日・退職日のダイアログは前後の誤りと途中までの入力で閉じず、Esc では閉じない", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const today = todayInTokyo();

  // 区分チップ → 区分メニュー → 退職（§2.13）。退職日は今日（Asia/Tokyo）
  const name05 = seedName(5);
  const row05 = rowOf(page, name05);
  await statusChip(row05).click();
  await expect(popupMenu(page).locator(".rl-menu__label")).toHaveText([
    "求職者",
    "在籍",
    "退職",
    "入社日・退職日を入れる",
  ]);
  await expect(menuItem(page, "求職者").locator(".rl-menu__note")).toHaveText("現在の区分");
  const [patch] = await Promise.all([
    page.waitForRequest((r) => isPatch(r.url(), r.method())),
    menuItem(page, "退職").click(),
  ]);
  expect(patch.postDataJSON()).toEqual({
    employment: { status: "left", hiredOn: null, leftOn: today.iso },
  });
  await expect(statusToast(page)).toHaveText(`${name05}さんを「退職」にしました`);
  await expect(statusChip(row05)).toHaveText("退職 ▾");
  await expect(row05.locator(".rl-chip--date")).toHaveText(`退職 ${today.ymd}`);

  // ⋮ → 入社日・退職日を入れる（§2.14）。開くと入社日の欄に焦点
  const name04 = seedName(4);
  const row04 = rowOf(page, name04);
  await moreButton(row04).click();
  await menuItem(page, "入社日・退職日を入れる").click();
  const dialog = datesDialog(page);
  await expect(dialog.getByRole("heading")).toHaveText(`${name04}さんの入社日・退職日`);
  await expect(dialog.locator(".rl-dates__desc")).toHaveText(
    "勤続年数の計算に使います。わかる分だけでも大丈夫です。",
  );
  const hired = dialog.getByLabel("入社日", { exact: true });
  const left = dialog.getByLabel("退職日（退職した人だけ）");
  await expect(hired).toBeFocused();
  await expect(dialog.getByRole("button", { name: "閉じる" })).toHaveCount(0);

  // 退職日 < 入社日: 通知がダイアログの中に出て、ダイアログは閉じない
  await hired.fill("2025-04-01");
  await left.fill("2025-03-31");
  await dialog.getByRole("button", { name: "保存する" }).click();
  const inDialog = dialog.locator(".toast[role=status]");
  await expect(inDialog).toHaveText("退職日が入社日より前になっています");
  await expect(inDialog).toBeVisible();
  await expect(dialog).toBeVisible();

  // Esc を 2 回押しても閉じない
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  // 途中までの入力（区切りの一部を消した値）: ブラウザは値を空にして validity.badInput を立てる。空の欄（null で保存して日付が
  // 消える）と区別して通知「日付が正しくありません」を出し、閉じず、送らない（§2.14 の 1.3 版）。fill では作れないのでキーボードで作る
  let badInputPatches = 0;
  const countPatch = (request: { url(): string; method(): string }) => {
    if (isPatch(request.url(), request.method())) badInputPatches += 1;
  };
  page.on("request", countPatch);
  for (const [label, field] of [
    ["入社日", hired],
    ["退職日", left],
  ] as const) {
    await hired.fill("2025-04-01");
    await left.fill("2026-03-31");
    await field.focus();
    await page.keyboard.press("Backspace");
    await expect(field, label).toHaveValue("");
    const badInput = await field.evaluate((el) => (el as HTMLInputElement).validity.badInput);
    expect(badInput, label).toBe(true);
    await dialog.getByRole("button", { name: "保存する" }).click();
    await expect(inDialog, label).toHaveText("日付が正しくありません");
    await expect(dialog, label).toBeVisible();
  }
  await page.waitForTimeout(300);
  page.off("request", countPatch);
  expect(badInputPatches).toBe(0);
  // 欄を入れ直すと途中までの入力ではなくなる
  await hired.fill("2025-04-01");
  await left.fill("");
  for (const field of [hired, left]) {
    const badInput = await field.evaluate((el) => (el as HTMLInputElement).validity.badInput);
    expect(badInput).toBe(false);
  }

  // 直して保存: 求職者で入社日だけ → 在籍（§2.14）
  await left.fill("");
  const [save] = await Promise.all([
    page.waitForRequest((r) => isPatch(r.url(), r.method())),
    dialog.getByRole("button", { name: "保存する" }).click(),
  ]);
  expect(save.postDataJSON()).toEqual({
    employment: { status: "employed", hiredOn: "2025-04-01", leftOn: null },
  });
  await expect(datesDialog(page)).toHaveCount(0);
  await expect(statusToast(page)).toHaveText(`${name04}さんの日付を保存しました`);
  await expect(statusChip(row04)).toHaveText("在籍 ▾");
  await expect(row04.locator(".rl-chip--date")).toHaveText("入社 2025/4/1");
  // 閉じたら開いた操作の要素（⋮）に焦点を戻す
  await expect(moreButton(row04)).toBeFocused();

  // 暗幕を押すと閉じる（保存しない）
  await statusChip(row04).click();
  await menuItem(page, "入社日・退職日を入れる").click();
  await expect(datesDialog(page)).toBeVisible();
  await expect(datesDialog(page).getByLabel("入社日", { exact: true })).toHaveValue("2025-04-01");
  await page.mouse.click(8, 8);
  await expect(datesDialog(page)).toHaveCount(0);
  await expect(statusChip(row04)).toBeFocused();
});

test("M7-list-41 ⋮メニュー: 最初の項目に焦点、↓↑で回る、Esc で⋮に焦点、外・スクロールで閉じ、別の⋮では閉じるだけ。以前の受験を開ける", async ({
  page,
  adminOrg,
}) => {
  const first = seedExam(adminOrg, 1);
  addReexam(adminOrg, first.resultId, 1);
  await loginViaUi(page, adminOrg.ownerEmail);
  const today = todayInTokyo();
  const name = seedName(1);
  const row = rowOf(page, name);
  await expect(row.locator(".rl-chip--nth")).toHaveText("2回目");
  await expect(row.locator(".rl-latest__prev")).toHaveText(`前回 ${today.ymd}`);

  const more = moreButton(row);
  await more.click();
  const menu = popupMenu(page);
  await expect(menu.locator(".rl-menu__label")).toHaveText([
    "1回目の結果を開く",
    "入社日・退職日を入れる",
    "求職者",
    "在籍",
    "退職",
    "責任者",
    "幹部",
    "スタッフ",
    "この受験を削除",
  ]);
  await expect(menu.locator(".rl-menu__heading")).toHaveText([
    "以前の受験",
    "区分を変える",
    "役職を変える",
  ]);
  await expect(menuItem(page, "1回目の結果を開く").locator(".rl-menu__note")).toHaveText(today.ymd);
  // 再受験は在籍（K-28）
  await expect(menuItem(page, "在籍").locator(".rl-menu__note")).toHaveText("現在の区分");
  await expect(menuItem(page, "この受験を削除").locator(".rl-menu__note")).toHaveText(
    `${today.ymd}の分`,
  );
  await expect(menu).toHaveAttribute("aria-labelledby", /.+/);

  // 焦点とキー操作（§2.12）
  const items = menu.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  // 外を押す（見出しの説明の上）と閉じる
  await more.click();
  await expect(menu).toBeVisible();
  await page.locator(".rl-desc").click();
  await expect(menu).toHaveCount(0);

  // スクロールで閉じる
  await more.click();
  await expect(menu).toBeVisible();
  await page.mouse.wheel(0, 120);
  await expect(menu).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // 開いたまま、メニューに重ならない別の行の⋮を押すと、閉じるだけ（その行のメニューは開かない）。
  // 全部の行が画面に入る高さにする（押す⋮を画面に入れるためのスクロールでメニューが閉じないように）
  await page.setViewportSize({ width: 1440, height: 1400 });
  await more.click();
  const menuBox = await rectOf(menu);
  const others = resultRows(page);
  let target: { x: number; y: number } | null = null;
  for (let i = (await others.count()) - 1; i >= 0 && target === null; i -= 1) {
    const box = await rectOf(moreButton(others.nth(i)));
    const overlaps = box.top < menuBox.bottom && box.bottom > menuBox.top;
    if (!overlaps && box.top >= 0 && box.bottom <= 1400) {
      target = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    }
  }
  if (target === null) throw new Error("メニューに重ならない⋮がありません");
  await page.mouse.click(target.x, target.y);
  await expect(menu).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(menu).toHaveCount(0);

  // 以前の受験: 1回目の結果を開く → 前回の結果詳細
  await more.click();
  await menuItem(page, "1回目の結果を開く").click();
  await page.waitForURL(`**/admin/results/${first.resultId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${name}様の診断結果`);
});

test("M7-list-42 オーナーが幹部にすると札と「現在の役職」。オーナー以外が責任者にすると通知のあと行が消え、オーナーの一覧には出る", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  // 職業 10（責任者）で役職が未設定の 08 は「責任者」に「現在の役職」（K-32 ⑤）
  await moreButton(rowOf(page, seedName(8))).click();
  await expect(menuItem(page, "責任者").locator(".rl-menu__note")).toHaveText("現在の役職");
  await page.keyboard.press("Escape");

  const name03 = seedName(3);
  const row03 = rowOf(page, name03);
  await moreButton(row03).click();
  await expect(popupMenu(page).locator(".rl-menu__note")).toHaveText(["現在の区分"]);
  const [patch] = await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    menuItem(page, "幹部").click(),
  ]);
  expect(patch.request().postDataJSON()).toEqual({ staffRole: "leader" });
  await expect(statusToast(page)).toHaveText(`${name03}さんの役職を「幹部」にしました`);
  await expect(row03.locator(".rl-chip--leader")).toHaveText("幹部");
  await page.reload();
  await expect(rowOf(page, name03).locator(".rl-chip--leader")).toHaveText("幹部");
  await moreButton(rowOf(page, name03)).click();
  await expect(menuItem(page, "幹部").locator(".rl-menu__note")).toHaveText("現在の役職");
  await page.keyboard.press("Escape");

  // オーナー以外（別のブラウザのコンテキスト）: 責任者にすると閲覧範囲の外になり、読み直しで行が消える（Q-02、§2.15）
  const adminPage = await (await browser.newContext()).newPage();
  await loginViaUi(adminPage, adminOrg.adminEmail);
  const name04 = seedName(4);
  // 03 は幹部（既存スタッフ）になったので、オーナー以外の一覧には無い
  await expect(resultRows(adminPage)).toHaveCount(7);
  await moreButton(rowOf(adminPage, name04)).click();
  await menuItem(adminPage, "責任者").click();
  await expect(statusToast(adminPage)).toHaveText(`${name04}さんの役職を「責任者」にしました`);
  await expect(rowOf(adminPage, name04)).toHaveCount(0);
  await expect(resultRows(adminPage)).toHaveCount(6);
  await adminPage.context().close();

  await page.reload();
  await expect(rowOf(page, name04).locator(".rl-chip--manager")).toHaveText("責任者");
  await expect(resultRows(page)).toHaveCount(10);
});

test("M7-list-43 削除の確認は Esc・背景で閉じず、削除すると「完了」の通知（2 秒）と行が消え、つながりの行は前回が代表になる", async ({
  page,
  adminOrg,
}) => {
  const first = seedExam(adminOrg, 1);
  addReexam(adminOrg, first.resultId, 1);
  await loginViaUi(page, adminOrg.ownerEmail);
  const today = todayInTokyo();

  const name02 = seedName(2);
  await moreButton(rowOf(page, name02)).click();
  await menuItem(page, "この受験を削除").click();
  const dialog = openDialog(page);
  await expect(dialog.locator(".dialog__title")).toHaveText("この受験を削除しますか？");
  await expect(dialog.locator(".rl-popup-text")).toHaveText(
    `${name02}さん（${today.ymd} 受験）の診断結果を削除します。削除すると元に戻せません。`,
  );
  await expect(dialog.getByRole("button", { name: "閉じる" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();

  const lifetime = await watchToastLifetime(page);
  const [del] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "DELETE"),
    dialog.getByRole("button", { name: "削除する" }).click(),
  ]);
  expect(del.status()).toBe(204);
  await expect(openDialog(page)).toHaveCount(0);
  await expect(statusToast(page)).toHaveText("完了回答データを削除しました。");
  await expect(statusToast(page).locator(".toast__title")).toHaveText("完了");
  await expect(rowOf(page, name02)).toHaveCount(0);
  const shown = await lifetime();
  expect(shown).toBeGreaterThanOrEqual(1950);
  expect(shown).toBeLessThan(2190);

  // つながりの行（01 の再受験が代表）: 代表を削除すると前回が代表になり、「2回目」が消える
  const row01 = rowOf(page, seedName(1));
  await expect(row01.locator(".rl-chip--nth")).toHaveText("2回目");
  await moreButton(row01).click();
  await expect(menuItem(page, "この受験を削除").locator(".rl-menu__note")).toHaveText(
    `${today.ymd}の分`,
  );
  await menuItem(page, "この受験を削除").click();
  await openDialog(page).getByRole("button", { name: "削除する" }).click();
  await expect(openDialog(page)).toHaveCount(0);
  await expect(rowOf(page, seedName(1)).locator(".rl-chip--nth")).toHaveCount(0);
  await expect(rowOf(page, seedName(1)).getByRole("link", { name: "結果を見る" })).toHaveAttribute(
    "href",
    `/admin/results/${first.resultId}`,
  );
  await expect(resultRows(page)).toHaveCount(9);
});

test("M7-list-44 利用履歴: 見出し・4 列・日時の形・全件（オーナー 10 行、オーナー以外 8 行）、Esc・背景で閉じず「閉じる」で閉じる。ヘッダーにボタンが無い", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await expect(page.locator(".admin-header").getByRole("button", { name: "利用履歴" })).toHaveCount(
    0,
  );
  await page.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  const dialog = openDialog(page);
  await expect(dialog.locator(".dialog__title")).toHaveText("利用履歴（ローカル歯科医院）");
  const table = dialog.getByTestId("usage-log-table");
  await expect(table.locator("thead th")).toHaveText([
    "回答日時",
    "名前",
    "電話番号",
    "過去の受講経験",
  ]);
  // 送信済みの全件（送信前の下書きは無い）。ページ送りは無い
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table.locator("tbody tr").first().locator("td").first()).toHaveText(
    /^\d{4}\/[1-9]\d?\/\d{2} \d{2}:\d{2}$/,
  );
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(seedName(10));
  await expect(dialog.getByText(/全 \d+ 件|未回答/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /次|前/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  await dialog.locator(".rl-usage-close").click();
  await expect(openDialog(page)).toHaveCount(0);

  // 組織内分類の画面のヘッダーにも利用履歴ボタンは無い（ヘッダーの廃止は PR-7.13a）
  await page.goto("/admin/classification");
  await expect(page.getByRole("button", { name: "利用履歴" })).toHaveCount(0);

  // オーナー以外: 既存スタッフ（09・10）の履歴が無い（K-29）
  const adminPage = await (await browser.newContext()).newPage();
  await loginViaUi(adminPage, adminOrg.adminEmail);
  await adminPage.locator(".rl-head").getByRole("button", { name: "利用履歴" }).click();
  const rows = openDialog(adminPage).getByTestId("usage-log-table").locator("tbody tr");
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: seedName(9) })).toHaveCount(0);
  await expect(rows.filter({ hasText: seedName(10) })).toHaveCount(0);
  await adminPage.context().close();
});
