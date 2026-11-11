// M7-zaiseki-37〜40、M7-zaiseki-41・42 の在籍・退職の分 在籍・退職の画面（11-3 §5.3。§2.1・§2.13〜§2.18・§2.20）。
// 組織は seed:local と同じ構成（adminOrg。01〜08 は求職者、09 は既存スタッフで在籍、10 は既存スタッフで除外中なので数えない。
// チームは 01・02・05・09 が A、03・04・07 が B、06・08 が未設定。タイプは 01・02・09 はるか（アテンダント）、03・08 ひなた（パイオニア）、
// 04 れい（クリエイター）、05 まい（アクター）、06 のぞみ（フリーランサー）、07 あいり（サイエンティスト））。区分・入社日・退職日は画面
// （変更ダイアログ）か、画面と同じ API（PATCH /api/v1/admin/respondents/{id}）で変える。勤続は退職日のある人（終点が固定）で確かめ、
// 基準日に左右される在籍中の勤続の値は単体テスト（retention.test.ts）で確かめる（11-3 §5 の冒頭）。0 人の表示は受験の無い組織で作る
import type { Browser, Page } from "@playwright/test";

import {
  alertToast,
  emEdit,
  emEditButton,
  emRow,
  emTab,
  expect,
  loginViaUi,
  obFold,
  obRoot,
  obSeg,
  obTeam,
  pgGo,
  retKpi,
  retRow,
  rowOf,
  seedEmptyOrg,
  seedExam,
  seedName,
  statusChip,
  statusToast,
  test,
  todayInTokyo,
  watchToastLifetime,
  type AdminOrg,
} from "../support/admin-ui";
import type { AptitudeTypeKey } from "@/lib/scoring/types";

const DESCRIPTION =
  "在籍している人と退職した人の一覧と、辞めやすいタイプの分析です。入社日・退職日は、各行の右端にある「変更」から入れられます。";
const EMPTY_HINT = "ほかのタブの一覧にある「変更」で区分を変えると、ここに出てきます。";
const LEAD =
  "在籍中と退職した人を、キャラクター別に集計しています。回答者がいないタイプは省いています。";
const NOTE_NO_LEFT =
  "退職として登録された人がまだいません。在籍者の一覧で「変更」を押し、区分を「退職」にすると、ここに出ます。";
const FOOTNOTE =
  "勤続年数は、入社日から退職日（在籍中の人は今日）までで計算しています。入社日が入っていない人は、勤続の平均に入りません。人数が3人に満たないタイプには「参考」を付けています。";
const SERVICE_UNAVAILABLE = "一時的にご利用いただけません。しばらくしてから再度お試しください";

const isPatch = (url: string, method: string) =>
  method === "PATCH" && url.includes("/api/v1/admin/respondents/");

async function openEmployment(page: Page): Promise<void> {
  await page.goto("/admin/employment");
  await expect(page.locator(".ob-pg")).toBeVisible();
}

/** 別のブラウザのコンテキストでログインし、在籍・退職を開く */
async function openEmploymentAs(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await loginViaUi(page, email);
  await openEmployment(page);
  return page;
}

/** 区分・入社日・退職日を変える（画面と同じ API。PATCH /api/v1/admin/respondents/{id}） */
async function patchEmployment(
  page: Page,
  org: AdminOrg,
  index: number,
  employment: {
    readonly status: "candidate" | "employed" | "left";
    readonly hiredOn: string | null;
    readonly leftOn: string | null;
  },
): Promise<void> {
  const res = await page.request.patch(
    `/api/v1/admin/respondents/${seedExam(org, index).respondentId}`,
    { data: { employment } },
  );
  expect(res.status()).toBe(200);
}

/** タブの名前と数（分析・在籍者・退職者・求職者） */
const expectTabs = (page: Page, stay: number, left: number, seek: number) =>
  expect(page.locator(".ob-pg .pg-tabs button")).toHaveText([
    "分析",
    `在籍者${stay}`,
    `退職者${left}`,
    `求職者${seek}`,
  ]);

/** 一覧の行の 6 つのセル（狭い幅でだけ見えるラベルを除いた表示の文字） */
const expectCells = (page: Page, org: AdminOrg, index: number, cells: readonly string[]) =>
  expect(emRow(page, seedExam(org, index).resultId).locator(":scope > div")).toHaveText(
    [...cells],
    { useInnerText: true },
  );

/** 一覧の行の順（seed の番号） */
async function expectRowOrder(page: Page, org: AdminOrg, indexes: readonly number[]) {
  await expect(page.locator("[data-testid^=em-row-]")).toHaveCount(indexes.length);
  const ids = await page
    .locator("[data-testid^=em-row-]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(ids).toEqual(indexes.map((i) => `em-row-${seedExam(org, i).resultId}`));
}

/** 変更ダイアログの区分のボタン */
const statusButton = (page: Page, label: "在籍" | "退職" | "求職者") =>
  emEdit(page).locator(".pgd-seg").getByRole("button", { name: label, exact: true });

/** 暦日 YYYY-MM-DD → YYYY/MM/DD */
const slash = (iso: string) => iso.replaceAll("-", "/");

test("M7-zaiseki-37 サイドメニューの 3 番目の「在籍・退職」で開き（aria-current）、見出し・説明・タブの数（在籍者1・退職者0・求職者8）と、開いた直後は「分析」", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const sidebar = page.getByRole("navigation", { name: "メインメニュー" });
  await expect(sidebar.getByRole("link")).toHaveText([
    "回答一覧",
    "組織内分類",
    "在籍・退職",
    "アカウント",
  ]);
  await sidebar.getByRole("link").nth(2).click();
  await page.waitForURL((url) => url.pathname === "/admin/employment");
  await expect(sidebar.getByRole("link", { name: "在籍・退職" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const name of ["回答一覧", "組織内分類", "アカウント"]) {
    await expect(sidebar.getByRole("link", { name }), name).not.toHaveAttribute("aria-current");
  }

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("在籍・退職");
  await expect(page.locator(".ob-pg .pg-sub")).toHaveText(DESCRIPTION);
  await expect(page.getByRole("button", { name: "利用履歴" })).toHaveCount(0);
  // 在籍者は 09（既存スタッフ）、求職者は 01〜08。10 は除外中で数えない
  await expectTabs(page, 1, 0, 8);
  await expect(emTab(page, "an")).toHaveAttribute("aria-pressed", "true");
  await expect(emTab(page, "an")).toHaveClass("on");
  for (const tab of ["stay", "left", "seek"] as const) {
    await expect(emTab(page, tab), tab).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.locator(".ob-ret h2")).toHaveText("辞めやすいタイプと勤続年数");
  await expect(retKpi(page)).toBeVisible();

  // タブで一覧に切り替わる
  await emTab(page, "seek").click();
  await expect(emTab(page, "seek")).toHaveAttribute("aria-pressed", "true");
  await expect(emTab(page, "an")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-testid^=em-row-]")).toHaveCount(8);
  await expect(retKpi(page)).toHaveCount(0);
});

test("M7-zaiseki-38 一覧: 退職者は退職日・ほかは職業の列、YYYY/MM/DD、勤続の長い順と「—」の人は後ろで氏名順、0 人の文 3 種と共通の 2 行目、「回答一覧を開く →」で回答一覧へ（分析のタブには無い）", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  // 退職日のある人（終点が固定）: 01 は 11か月、02 は 1年11か月。03・05 は入社日が無く勤続が出ない
  await patchEmployment(page, adminOrg, 1, {
    status: "left",
    hiredOn: "2025-04-01",
    leftOn: "2026-03-31",
  });
  await patchEmployment(page, adminOrg, 2, {
    status: "left",
    hiredOn: "2024-04-01",
    leftOn: "2026-03-31",
  });
  await patchEmployment(page, adminOrg, 5, { status: "left", hiredOn: null, leftOn: "2026-10-14" });
  await patchEmployment(page, adminOrg, 3, { status: "left", hiredOn: null, leftOn: "2026-10-30" });
  await openEmployment(page);
  await expectTabs(page, 1, 4, 4);
  await expect(pgGo(page)).toHaveCount(0);

  // 退職者
  await emTab(page, "left").click();
  await expect(page.locator(".ob-pg .pg-row.hd > div")).toHaveText([
    "お名前",
    "タイプ",
    "入社日",
    "退職日",
    "勤続",
    "",
  ]);
  await expectRowOrder(page, adminOrg, [2, 1, 3, 5]);
  await expectCells(page, adminOrg, 2, [
    "テストテスト 02",
    "アテンダント",
    "2024/04/01",
    "2026/03/31",
    "1年11か月",
    "変更",
  ]);
  await expectCells(page, adminOrg, 1, [
    "テストテスト 01",
    "アテンダント",
    "2025/04/01",
    "2026/03/31",
    "11か月",
    "変更",
  ]);
  await expectCells(page, adminOrg, 3, [
    "テストテスト 03",
    "パイオニア",
    "—",
    "2026/10/30",
    "—",
    "変更",
  ]);
  // 入社日の無い「—」は薄い文字（span.pg-mu）、勤続の「—」は太字のまま
  await expect(emRow(page, seedExam(adminOrg, 3).resultId).locator(".pg-mu")).toHaveText("—");
  await expect(pgGo(page)).toHaveText("回答一覧を開く →");

  // 在籍者（09。入社日なし・職業はアイリスト）
  await emTab(page, "stay").click();
  await expect(page.locator(".ob-pg .pg-row.hd > div")).toHaveText([
    "お名前",
    "タイプ",
    "入社日",
    "職業",
    "勤続",
    "",
  ]);
  await expectRowOrder(page, adminOrg, [9]);
  await expectCells(page, adminOrg, 9, [
    "テストテスト 09",
    "アテンダント",
    "—",
    "アイリスト",
    "—",
    "変更",
  ]);

  // 求職者（04・06・07・08。入社日が無いので氏名の日本語順）
  await emTab(page, "seek").click();
  await expectRowOrder(page, adminOrg, [4, 6, 7, 8]);
  await expectCells(page, adminOrg, 8, [
    "テストテスト 08",
    "パイオニア",
    "—",
    "責任者",
    "—",
    "変更",
  ]);

  // 「回答一覧を開く →」で回答一覧へ
  await expect(pgGo(page)).toHaveAttribute("href", "/admin");
  await pgGo(page).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();

  // 0 人の文（受験の無い組織）。一覧の代わりの点線の枠に、タブごとの 1 行目と、改行して共通の 2 行目
  const empty = seedEmptyOrg();
  const emptyPage = await openEmploymentAs(browser, empty.ownerEmail);
  await expectTabs(emptyPage, 0, 0, 0);
  const firstLines = [
    ["stay", "在籍している人がいません。"],
    ["left", "退職した人はまだいません。"],
    ["seek", "面接だけの人（求職者）はまだいません。"],
  ] as const;
  for (const [tab, first] of firstLines) {
    await emTab(emptyPage, tab).click();
    const box = emptyPage.locator(".ob-pg .pg-emp");
    await expect(box, tab).toHaveText(`${first}${EMPTY_HINT}`);
    await expect(box.locator("br"), tab).toHaveCount(1);
    await expect(emptyPage.locator(".ob-pg .pg-list"), tab).toHaveCount(0);
    await expect(pgGo(emptyPage), tab).toBeVisible();
  }
  // 分析: 表は「回答者がいません」の行だけ
  await emTab(emptyPage, "an").click();
  await expect(emptyPage.locator(".ret-tb .ret-r:not(.hd)")).toHaveText(["回答者がいません"]);
  await expect(pgGo(emptyPage)).toHaveCount(0);
  await emptyPage.context().close();
});

test("M7-zaiseki-39 変更ダイアログ: 選択中の区分のボタンに焦点、Esc・カードの外・「やめる」は送らずに閉じて「変更」に焦点、退職日の欄は退職のときだけ（隠しても値が残る）、前後の誤りと範囲の外・途中までの日付は赤字で閉じない", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  let patches = 0;
  page.on("request", (req) => {
    if (isPatch(req.url(), req.method())) patches += 1;
  });
  await openEmployment(page);
  await emTab(page, "stay").click();
  const button = emEditButton(emRow(page, seedExam(adminOrg, 9).resultId));
  const dialog = emEdit(page);

  await button.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-testid", "em-edit");
  await expect(dialog).toHaveAccessibleName("テストテスト 09さん");
  await expect(dialog.locator(".pgd-s")).toHaveText(
    "区分と、入社日・退職日を変えられます。わかる分だけでも大丈夫です。",
  );
  await expect(dialog.locator(".pgd-seg button")).toHaveText(["在籍", "退職", "求職者"]);
  await expect(statusButton(page, "在籍")).toHaveAttribute("aria-pressed", "true");
  await expect(statusButton(page, "退職")).toHaveAttribute("aria-pressed", "false");
  await expect(statusButton(page, "在籍")).toBeFocused();
  const hired = dialog.getByLabel("入社日");
  const left = dialog.getByLabel("退職日");
  await expect(hired).toHaveValue("");
  await expect(hired).toHaveAttribute("type", "date");
  await expect(hired).toHaveAttribute("min", "1900-01-01");
  await expect(hired).toHaveAttribute("max", "2100-12-31");
  await expect(left).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveText("");
  await expect(dialog.locator(".pgd-b button")).toHaveText(["やめる", "保存する"]);

  // Esc・カードの外・「やめる」: 保存せずに閉じ、押した「変更」に焦点が戻る
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await statusButton(page, "退職").click();
  await dialog.getByRole("button", { name: "やめる" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();

  // 開き直すと今の値で作り直す。退職日の欄は「退職」のときだけで、隠しても入力した値は残る
  await button.click();
  await expect(statusButton(page, "在籍")).toHaveAttribute("aria-pressed", "true");
  await expect(left).toHaveCount(0);
  await statusButton(page, "退職").click();
  await expect(statusButton(page, "退職")).toHaveAttribute("aria-pressed", "true");
  await expect(statusButton(page, "在籍")).toHaveAttribute("aria-pressed", "false");
  await expect(left).toBeVisible();
  await hired.fill("2026-04-01");
  await left.fill("2026-03-31");
  await statusButton(page, "求職者").click();
  await expect(left).toHaveCount(0);
  await statusButton(page, "退職").click();
  await expect(left).toHaveValue("2026-03-31");

  // 退職日 < 入社日: 赤字（role="alert"）で閉じない
  const save = dialog.getByRole("button", { name: "保存する" });
  await save.click();
  await expect(dialog.getByRole("alert")).toHaveText("退職日が入社日より前になっています。");
  await expect(dialog).toBeVisible();
  // 範囲の外・実在しない日（7 章の 1 の案。範囲の外と前後の逆が重なると範囲の外）
  await hired.fill("1899-12-31");
  await save.click();
  await expect(dialog.getByRole("alert")).toHaveText("日付が正しくありません。");
  await hired.fill("2025-04-01");
  await left.fill("2101-01-01");
  await save.click();
  await expect(dialog.getByRole("alert")).toHaveText("日付が正しくありません。");
  // 押すたびに判定し直す
  await left.fill("2025-03-31");
  await save.click();
  await expect(dialog.getByRole("alert")).toHaveText("退職日が入社日より前になっています。");
  await expect(dialog).toBeVisible();
  // 途中までの入力（区切りの一部を消した値）。ブラウザは値を空にして validity.badInput を立てるので、空の欄（入社日は null、
  // 退職日は今日）と区別して「日付が正しくありません。」にする（§2.15 の 3）。fill では作れないのでキーボードで作る
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
    await save.click();
    await expect(dialog.getByRole("alert"), label).toHaveText("日付が正しくありません。");
    await expect(dialog, label).toBeVisible();
  }
  await dialog.getByRole("button", { name: "やめる" }).click();
  await expect(button).toBeFocused();

  // どの閉じ方でも PATCH を送らず、表示も変わらない
  await page.waitForTimeout(300);
  expect(patches).toBe(0);
  await expectTabs(page, 1, 0, 8);
});

test("M7-zaiseki-39 開いた直後: 退職・求職者の人も今の区分が選ばれ、日付の欄に今の値が入り、何も変えずに保存すると同じ値を送る", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await patchEmployment(page, adminOrg, 1, {
    status: "left",
    hiredOn: "2025-04-01",
    leftOn: "2026-03-31",
  });
  await patchEmployment(page, adminOrg, 4, {
    status: "candidate",
    hiredOn: "2024-04-01",
    leftOn: null,
  });
  await openEmployment(page);
  const dialog = emEdit(page);
  const hired = dialog.getByLabel("入社日");
  const left = dialog.getByLabel("退職日");
  const saveUnchanged = async () => {
    const [patch] = await Promise.all([
      page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
      dialog.getByRole("button", { name: "保存する" }).click(),
    ]);
    expect(patch.status()).toBe(200);
    return patch.request().postDataJSON() as unknown;
  };

  // 退職者（01。入社日・退職日あり）
  await emTab(page, "left").click();
  const button01 = emEditButton(emRow(page, seedExam(adminOrg, 1).resultId));
  await button01.click();
  await expect(dialog).toHaveAccessibleName("テストテスト 01さん");
  await expect(statusButton(page, "退職")).toHaveAttribute("aria-pressed", "true");
  await expect(statusButton(page, "退職")).toBeFocused();
  for (const label of ["在籍", "求職者"] as const) {
    await expect(statusButton(page, label), label).toHaveAttribute("aria-pressed", "false");
  }
  await expect(hired).toHaveValue("2025-04-01");
  await expect(left).toHaveValue("2026-03-31");
  expect(await saveUnchanged()).toEqual({
    employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-03-31" },
  });
  await expect(dialog).toHaveCount(0);
  await expect(button01).toBeFocused();

  // 求職者（04。入社日あり）。退職日の欄は出ない
  await emTab(page, "seek").click();
  await emEditButton(emRow(page, seedExam(adminOrg, 4).resultId)).click();
  await expect(statusButton(page, "求職者")).toHaveAttribute("aria-pressed", "true");
  await expect(statusButton(page, "求職者")).toBeFocused();
  for (const label of ["在籍", "退職"] as const) {
    await expect(statusButton(page, label), label).toHaveAttribute("aria-pressed", "false");
  }
  await expect(hired).toHaveValue("2024-04-01");
  await expect(left).toHaveCount(0);
  expect(await saveUnchanged()).toEqual({
    employment: { status: "candidate", hiredOn: "2024-04-01", leftOn: null },
  });

  // 表示もサーバの値も変わらない
  await expectTabs(page, 1, 1, 7);
  await page.reload();
  await expectTabs(page, 1, 1, 7);
  await emTab(page, "left").click();
  await expectCells(page, adminOrg, 1, [
    "テストテスト 01",
    "アテンダント",
    "2025/04/01",
    "2026/03/31",
    "11か月",
    "変更",
  ]);
});

test("M7-zaiseki-39 保存: 退職で退職日が空なら今日（Asia/Tokyo）で送り、丸形の通知（2.6 秒）とタブの数が変わり、焦点は今のタブのボタンへ。組織内分類の「退職 n」と回答一覧の区分のチップにも出る", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const today = todayInTokyo();
  const exam09 = seedExam(adminOrg, 9);
  await openEmployment(page);
  await emTab(page, "stay").click();
  await emEditButton(emRow(page, exam09.resultId)).click();
  await statusButton(page, "退職").click();
  await emEdit(page).getByLabel("入社日").fill("2025-04-01");
  await expect(emEdit(page).getByLabel("退職日")).toHaveValue("");

  const lifetime = await watchToastLifetime(page);
  const [patch] = await Promise.all([
    page.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    emEdit(page).getByRole("button", { name: "保存する" }).click(),
  ]);
  expect(new URL(patch.url()).pathname).toBe(`/api/v1/admin/respondents/${exam09.respondentId}`);
  expect(patch.request().postDataJSON()).toEqual({
    employment: { status: "left", hiredOn: "2025-04-01", leftOn: today.iso },
  });
  expect(patch.status()).toBe(200);
  await expect(emEdit(page)).toHaveCount(0);

  // 丸形の通知（.toast.toast--pill・role="status"。11-3 §2.20）。2.6 秒で消える
  const toast = statusToast(page);
  await expect(toast).toHaveText("テストテスト 09さんを保存しました");
  await expect(toast).toHaveClass("toast toast--pill");
  await expect(toast).toHaveCSS("border-radius", "999px");
  await expect(toast).toHaveCSS("background-color", "rgb(31, 41, 51)");

  // タブの数が変わり、09 は退職者に移る。押した「変更」は一覧から消えたので、焦点は今のタブのボタン（11 総論 8.5）
  await expectTabs(page, 0, 1, 8);
  await expect(page.locator(".ob-pg .pg-emp")).toContainText("在籍している人がいません。");
  await expect(emTab(page, "stay")).toBeFocused();
  const shown = await lifetime();
  expect(shown).toBeGreaterThanOrEqual(2550);
  expect(shown).toBeLessThan(3300);

  // 退職者の一覧: 入社日と、今日の退職日（勤続は今日に左右されるので見ない）
  await emTab(page, "left").click();
  const cells = emRow(page, exam09.resultId).locator(":scope > div");
  await expect(cells.nth(2)).toHaveText("2025/04/01", { useInnerText: true });
  await expect(cells.nth(3)).toHaveText(slash(today.iso), { useInnerText: true });

  // 再読み込みしてもサーバの値（つながった全受験に書いた区分）で出る
  await page.reload();
  await expectTabs(page, 0, 1, 8);

  // 組織内分類の「退職 1」「在籍 0」と、回答一覧の区分のチップ
  const sidebar = page.getByRole("navigation", { name: "メインメニュー" });
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await expect(obRoot(page)).toBeVisible();
  await expect(obSeg(page, "left")).toHaveText("退職 1");
  await expect(obSeg(page, "stay")).toHaveText("在籍 0");
  await sidebar.getByRole("link", { name: "回答一覧" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  await expect(statusChip(rowOf(page, seedName(9)))).toHaveText("退職 ▾");
});

test("M7-zaiseki-39 送信中はその行の「変更」が aria-disabled で開かず、失敗（503）すると元の表示に戻してエラーの通知（role=alert）", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openEmployment(page);
  await emTab(page, "seek").click();
  const row04 = emRow(page, seedExam(adminOrg, 4).resultId);

  // 応答を止める。区分を変えずに入社日だけを入れる（行は求職者のタブに残る）
  let release = () => {};
  let held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let patches = 0;
  let fail = false;
  await page.route("**/api/v1/admin/respondents/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches += 1;
    await held;
    if (!fail) return route.continue();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "SERVICE_UNAVAILABLE", message: SERVICE_UNAVAILABLE, details: {} },
      }),
    });
  });
  await emEditButton(row04).click();
  await emEdit(page).getByLabel("入社日").fill("2025-04-01");
  await emEdit(page).getByRole("button", { name: "保存する" }).click();
  await expect(emEdit(page)).toHaveCount(0);
  // 手元の値ですぐに出し、通知も保存の完了を待たない。押した「変更」に焦点が戻る
  await expect(row04.locator(":scope > div").nth(2)).toHaveText("2025/04/01", {
    useInnerText: true,
  });
  await expect(statusToast(page)).toHaveText("テストテスト 04さんを保存しました");
  await expect(emEditButton(row04)).toBeFocused();
  await expect(emEditButton(row04)).toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => patches).toBe(1);
  // 送信中の行の「変更」は押しても開かない（ほかの行は開ける）
  await emEditButton(row04).click({ force: true });
  await page.waitForTimeout(300);
  await expect(emEdit(page)).toHaveCount(0);
  await expect(emEditButton(emRow(page, seedExam(adminOrg, 6).resultId))).not.toHaveAttribute(
    "aria-disabled",
  );
  release();
  await expect(emEditButton(row04)).not.toHaveAttribute("aria-disabled");
  await expect(row04.locator(":scope > div").nth(2)).toHaveText("2025/04/01", {
    useInnerText: true,
  });

  // 失敗（503）: 05 を退職にすると手元の値ですぐに退職者に移り、503 で元の表示に戻してエラーの通知に置き換える
  held = new Promise<void>((resolve) => {
    release = resolve;
  });
  fail = true;
  const row05 = emRow(page, seedExam(adminOrg, 5).resultId);
  await emEditButton(row05).click();
  await statusButton(page, "退職").click();
  await emEdit(page).getByRole("button", { name: "保存する" }).click();
  await expectTabs(page, 1, 1, 7);
  await expect(row05).toHaveCount(0);
  await expect(statusToast(page)).toHaveText("テストテスト 05さんを保存しました");
  await expect(emTab(page, "seek")).toBeFocused();
  await expect.poll(() => patches).toBe(2);
  release();
  await expect(alertToast(page)).toHaveText(SERVICE_UNAVAILABLE);
  await expect(page.locator(".toast")).toHaveCount(1);
  await expect(alertToast(page)).not.toHaveClass(/toast--pill/);
  await expectTabs(page, 1, 0, 8);
  await expect(row05).toBeVisible();
  await expect(emEditButton(row05)).not.toHaveAttribute("aria-disabled");
  await page.unroute("**/api/v1/admin/respondents/**");
  // サーバの値は変わっていない
  await page.reload();
  await expectTabs(page, 1, 0, 8);
});

test("M7-zaiseki-40 分析: 退職日のある人で決まる値（全体の %・平均の勤続・人数）、カード 5 枚と 4 枚、注意書き（退職 0・2・3 人で出し分け。5 人でも出ない）、表の並びと「参考」、脚注", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openEmployment(page);
  const cards = retKpi(page).locator(".ret-k");
  const note = page.locator(".ob-ret .ret-note");
  const rows = page.locator(".ret-tb .ret-r:not(.hd)");

  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(LEAD);
  await expect(page.locator(".ret-tb .ret-r.hd > div")).toHaveText([
    "タイプ",
    "在籍",
    "退職",
    "退職の割合",
    "勤続（退職した人）",
    "勤続（在籍中）",
  ]);
  await expect(page.locator(".ob-ret .ret-ft")).toHaveText(FOOTNOTE);

  // 退職 0 人（在籍は 09 だけで入社日なし）: カード 5 枚（勤続未入力者）と「まだいません」の注意書き
  await expect(cards).toHaveText([
    "退職した人0人全体の 0%",
    "在籍中の人1人求職者は含みません",
    "平均の勤続（退職した人）—0人の平均",
    "平均の勤続（在籍中）—0人の平均（今日まで）",
    "勤続未入力者1人入社日1人／退職日0人が未入力",
  ]);
  await expect(cards.nth(4)).toHaveClass("ret-k warn");
  await expect(note).toHaveText(NOTE_NO_LEFT);
  await expect(rows).toHaveCount(1);
  await expect(retRow(page, "attendant").locator(":scope > div")).toHaveText([
    "アテンダントはるか",
    "1",
    "0",
    "0%参考",
    "—",
    "—",
  ]);

  // 01・02 を退職（退職日あり。11か月と 23か月）: 全体の 67%（2 ÷ 3）、平均の勤続（退職した人）1年5か月（17）、注意書きは 2 人
  await patchEmployment(page, adminOrg, 1, {
    status: "left",
    hiredOn: "2025-04-01",
    leftOn: "2026-03-31",
  });
  await patchEmployment(page, adminOrg, 2, {
    status: "left",
    hiredOn: "2024-04-01",
    leftOn: "2026-03-31",
  });
  await page.reload();
  await expect(cards).toHaveText([
    "退職した人2人全体の 67%",
    "在籍中の人1人求職者は含みません",
    "平均の勤続（退職した人）1年5か月2人の平均",
    "平均の勤続（在籍中）—0人の平均（今日まで）",
    "勤続未入力者1人入社日1人／退職日0人が未入力",
  ]);
  await expect(note).toHaveText(
    "退職した人がまだ2人なので、割合は参考値です。人数が増えるほど、傾向が確かになります。",
  );
  await expect(retRow(page, "attendant").locator(":scope > div")).toHaveText([
    "アテンダントはるか",
    "1",
    "2",
    "67%",
    "1年5か月",
    "—",
  ]);

  // 09 に入社日（在籍のまま）: 未入力が 0 人になりカード 4 枚。在籍中の平均は 1 人（値は基準日に左右されるので人数だけ）
  await patchEmployment(page, adminOrg, 9, {
    status: "employed",
    hiredOn: "2020-04-01",
    leftOn: null,
  });
  await page.reload();
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(3).locator(".s")).toHaveText("1人の平均（今日まで）");
  await expect(page.locator(".ret-k.warn")).toHaveCount(0);

  // 03 を退職（退職日あり。35 か月）: 退職 3 人は注意書きが出なくなる境目。全体の 75%（3 ÷ 4）、平均の勤続（退職した人）
  // 1年11か月（11・23・35 か月の平均 23）
  await patchEmployment(page, adminOrg, 3, {
    status: "left",
    hiredOn: "2023-04-01",
    leftOn: "2026-03-31",
  });
  await page.reload();
  await expectTabs(page, 1, 3, 5);
  await expect(cards.nth(0)).toHaveText("退職した人3人全体の 75%");
  await expect(cards.nth(1)).toHaveText("在籍中の人1人求職者は含みません");
  await expect(cards.nth(2)).toHaveText("平均の勤続（退職した人）1年11か月3人の平均");
  await expect(cards).toHaveCount(4);
  await expect(note).toHaveCount(0);

  // 退職 5 人・在籍 4 人（どれも日付あり）: 注意書きは出ない。表は 退職の割合 → 退職の人数 → 人数 → マップの順、3 人未満に「参考」
  await patchEmployment(page, adminOrg, 5, {
    status: "left",
    hiredOn: "2025-10-01",
    leftOn: "2026-04-30",
  });
  await patchEmployment(page, adminOrg, 6, {
    status: "left",
    hiredOn: "2025-01-15",
    leftOn: "2026-01-14",
  });
  for (const [index, hiredOn] of [
    [8, "2022-04-01"],
    [7, "2023-04-01"],
    [4, "2024-04-01"],
  ] as const) {
    await patchEmployment(page, adminOrg, index, { status: "employed", hiredOn, leftOn: null });
  }
  await page.reload();
  await expectTabs(page, 4, 5, 0);
  // 退職した人の勤続 11・23・35・6・11 か月の平均 17.2 → 17
  await expect(cards.nth(0)).toHaveText("退職した人5人全体の 56%");
  await expect(cards.nth(1)).toHaveText("在籍中の人4人求職者は含みません");
  await expect(cards.nth(2)).toHaveText("平均の勤続（退職した人）1年5か月5人の平均");
  await expect(cards.nth(3).locator(".s")).toHaveText("4人の平均（今日まで）");
  await expect(cards).toHaveCount(4);
  await expect(note).toHaveCount(0);
  const order: readonly AptitudeTypeKey[] = [
    "actor",
    "freelancer",
    "attendant",
    "pioneer",
    "scientist",
    "creator",
  ];
  const ids = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(ids).toEqual(order.map((type) => `ret-row-${type}`));
  const rates: Readonly<Record<string, readonly string[]>> = {
    actor: ["アクターまい", "0", "1", "100%参考", "6か月"],
    freelancer: ["フリーランサーのぞみ", "0", "1", "100%参考", "11か月"],
    attendant: ["アテンダントはるか", "1", "2", "67%", "1年5か月"],
    pioneer: ["パイオニアひなた", "1", "1", "50%参考", "2年11か月"],
    scientist: ["サイエンティストあいり", "1", "0", "0%参考", "—"],
    creator: ["クリエイターれい", "1", "0", "0%参考", "—"],
  };
  // 勤続（在籍中）の列は基準日に左右されるので、5 列目（勤続（退職した人））まで見る
  for (const type of order) {
    const cellsOf = retRow(page, type).locator(":scope > div");
    for (const [i, text] of (rates[type] ?? []).entries()) {
      await expect(cellsOf.nth(i), `${type} ${i}`).toHaveText(text);
    }
    await expect(retRow(page, type).locator("img"), type).toHaveAttribute("alt", "");
  }
  await expect(page.locator(".ob-ret .ret-ft")).toHaveText(FOOTNOTE);
});

test("M7-zaiseki-41（在籍・退職の分）組織内分類で選んだチームが在籍・退職のタブの数と分析の説明に効き、タブはサイドメニューの移動で残り、再読み込みで既定に戻る。選んだチームの人を回答一覧で移すと「すべて」に戻る", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const sidebar = page.getByRole("navigation", { name: "メインメニュー" });
  await page.goto("/admin/classification");
  await expect(obRoot(page)).toBeVisible();
  await obTeam(page).selectOption("A");
  await obSeg(page, "stay").click();
  await obFold(page, "analytical").click();

  // Aチーム（01・02・05 は求職者、09 は在籍）で数え、分析の説明の先頭が「Aチームの」。在籍・退職にチームの選択欄は無い
  await sidebar.getByRole("link", { name: "在籍・退職" }).click();
  await expect(page.locator(".ob-pg")).toBeVisible();
  await expectTabs(page, 1, 0, 3);
  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(`Aチームの${LEAD}`);
  await expect(page.locator(".ob-pg select")).toHaveCount(0);

  // 退職者のタブを選んで組織内分類へ行き、戻るとタブが残る（組織内分類のチーム・対象・折りたたみも残る）
  await emTab(page, "left").click();
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await expect(obRoot(page)).toBeVisible();
  await expect(obTeam(page)).toHaveValue("A");
  await expect(obSeg(page, "stay")).toHaveAttribute("aria-pressed", "true");
  await expect(obFold(page, "analytical")).toHaveAttribute("aria-expanded", "false");
  await sidebar.getByRole("link", { name: "在籍・退職" }).click();
  await expect(emTab(page, "left")).toHaveAttribute("aria-pressed", "true");
  await expectTabs(page, 1, 0, 3);
  await expect(page.locator(".ob-pg .pg-emp")).toContainText("退職した人はまだいません。");

  // 再読み込みで既定（すべて・分析）に戻る
  await page.reload();
  await expect(emTab(page, "an")).toHaveAttribute("aria-pressed", "true");
  await expectTabs(page, 1, 0, 8);
  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(LEAD);

  // 未設定（06・08）で絞ると「未設定の」
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await obTeam(page).selectOption("none");
  await sidebar.getByRole("link", { name: "在籍・退職" }).click();
  await expectTabs(page, 0, 0, 2);
  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(`未設定の${LEAD}`);

  // Bチーム（03・04・07）を選び、回答一覧でその 3 人を Aチームに移すと、在籍・退職でも「すべて」に戻る（K-20 (3)）
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await obTeam(page).selectOption("B");
  await sidebar.getByRole("link", { name: "在籍・退職" }).click();
  await expectTabs(page, 0, 0, 3);
  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(`Bチームの${LEAD}`);
  await sidebar.getByRole("link", { name: "回答一覧" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  for (const index of [3, 4, 7]) {
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          r.url().includes(`/api/v1/admin/respondents/${seedExam(adminOrg, index).respondentId}`),
      ),
      rowOf(page, seedName(index)).getByRole("combobox").selectOption("A"),
    ]);
  }
  await sidebar.getByRole("link", { name: "在籍・退職" }).click();
  await expect(page.locator(".ob-pg")).toBeVisible();
  await expectTabs(page, 1, 0, 8);
  await expect(page.locator(".ob-ret .ret-h p")).toHaveText(LEAD);
  // 保存している値も「すべて」に書き換えた（組織内分類でも「すべて」）
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await expect(obRoot(page)).toBeVisible();
  await expect(obTeam(page)).toHaveValue("");
});

test("M7-zaiseki-42（在籍・退職の分）オーナー以外には既存スタッフ（テストテスト 09）が在籍者・分析に出ず（在籍者0）、オーナーには出る（K-29）。オーナー以外も見えている人の区分を変えられる", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openEmployment(page);
  await expectTabs(page, 1, 0, 8);
  await expect(retRow(page, "attendant").locator(".n").first()).toHaveText("1");
  await emTab(page, "stay").click();
  await expect(emRow(page, seedExam(adminOrg, 9).resultId)).toBeVisible();

  const adminPage = await openEmploymentAs(browser, adminOrg.adminEmail);
  await expectTabs(adminPage, 0, 0, 8);
  // 分析: 在籍中の人 0 人で、表は求職者を数えないので「回答者がいません」だけ
  await expect(retKpi(adminPage).locator(".ret-k").nth(1).locator(".v")).toHaveText("0人");
  await expect(adminPage.locator(".ret-tb .ret-r:not(.hd)")).toHaveText(["回答者がいません"]);
  await emTab(adminPage, "stay").click();
  await expect(adminPage.locator(".ob-pg .pg-emp")).toContainText("在籍している人がいません。");
  await expect(adminPage.locator(".ob-root").getByText(seedName(9))).toHaveCount(0);

  // オーナー以外の管理者も、見えている人（求職者の 01）の区分を変更ダイアログで変えられる
  await emTab(adminPage, "seek").click();
  await emEditButton(emRow(adminPage, seedExam(adminOrg, 1).resultId)).click();
  await statusButton(adminPage, "在籍").click();
  const [patch] = await Promise.all([
    adminPage.waitForResponse((r) => isPatch(r.url(), r.request().method())),
    emEdit(adminPage).getByRole("button", { name: "保存する" }).click(),
  ]);
  expect(patch.request().postDataJSON()).toEqual({
    employment: { status: "employed", hiredOn: null, leftOn: null },
  });
  expect(patch.status()).toBe(200);
  await expectTabs(adminPage, 1, 0, 7);
  await adminPage.reload();
  await expectTabs(adminPage, 1, 0, 7);
  await adminPage.context().close();

  // オーナーには 09 と 01 の 2 人が在籍者
  await page.reload();
  await expectTabs(page, 2, 0, 7);
});
