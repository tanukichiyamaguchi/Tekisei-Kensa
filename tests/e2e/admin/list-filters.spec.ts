// M7-list-36 検索・絞り込み・並び順、M7-list-37 受験から1年以上、M7-list-38 さらに表示、M7-list-46 状態の保存、
// M7-list-47 0 件の表示（11-2 §5.3。§2.5〜§2.8・§2.19・§2.21）。
// 受験日を過去にするのは E2E に限った直接書き込み（M7-list-36 の並び順を分けるための受験日と、M7-list-37 の「受験から1年以上」。
// API では受験日を変えられない）。101 行以上の組織と再受験のつながりは、seed:local と同じリポジトリの関数で作る（直接は書かない）
import type { Page } from "@playwright/test";

import {
  addReexam,
  answerLink,
  backdateResult,
  expect,
  grantClipboard,
  listTools,
  loginViaUi,
  readClipboard,
  resultRows,
  rowNames,
  rowOf,
  seedEmptyOrg,
  seedExam,
  seedManyRows,
  seedName,
  statCard,
  statusToast,
  test,
} from "../support/admin-ui";

/** 検索欄に入れてから表示が変わるまでの時間（ミリ秒）。入力のイベントから件数の文字が変わるまでを測る */
async function searchAndMeasure(page: Page, text: string): Promise<number> {
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(".rl-search__input");
    const count = document.querySelector(".rl-count");
    if (!input || !count) throw new Error("検索欄か件数がありません");
    const before = count.textContent;
    let typedAt = 0;
    input.addEventListener("input", () => (typedAt = performance.now()), { once: true });
    (window as unknown as { __searchDelay: Promise<number> }).__searchDelay = new Promise(
      (resolve) => {
        const observer = new MutationObserver(() => {
          if (count.textContent === before) return;
          observer.disconnect();
          resolve(performance.now() - typedAt);
        });
        observer.observe(count, { subtree: true, childList: true, characterData: true });
      },
    );
  });
  await listTools(page).search.fill(text);
  return page.evaluate(
    () => (window as unknown as { __searchDelay: Promise<number> }).__searchDelay,
  );
}

test("M7-list-36 ハイフン・空白を入れた検索が 150 ミリ秒後に当たり、チームは使われているものだけ、並び順 4 種、解除で すべて に戻る", async ({
  page,
  adminOrg,
}) => {
  // 03 を再受験して新しい代表にし（11-2 §2.2）、07 を 1 年以上前にする（E2E に限った直接書き込み）。
  // 送信の順（01→10、03 の再受験が最後）と氏名の順と受験日の順を分ける
  addReexam(adminOrg, seedExam(adminOrg, 3).resultId, 3);
  backdateResult(seedExam(adminOrg, 7).resultId, 400);
  await loginViaUi(page, adminOrg.ownerEmail);
  const tools = listTools(page);
  await expect(resultRows(page)).toHaveCount(10);

  // 電話番号: 半角・全角の空白と「-」「‐」を除いて部分一致（§2.7）。入力から 150 ミリ秒たってから絞る
  const delay = await searchAndMeasure(page, "090　0000‐00 03");
  expect(delay).toBeGreaterThanOrEqual(149);
  expect(delay).toBeLessThan(1500);
  await expect.poll(() => rowNames(page)).toEqual([seedName(3)]);
  await expect(tools.count).toHaveText("1人を表示 ・ 絞り込みを解除");
  // 氏名: 空白なしの語でも一致する
  await tools.search.fill("テストテスト05");
  await expect.poll(() => rowNames(page)).toEqual([seedName(5)]);
  await tools.search.fill("");
  await expect(resultRows(page)).toHaveCount(10);
  await expect(tools.count).toHaveText("10人を表示");

  // チームで絞り込む: 使われているチーム（A・B）だけ（§2.7）
  await expect(tools.team.locator("option")).toHaveText([
    "チーム：すべて",
    "チーム未設定",
    "Aチーム",
    "Bチーム",
  ]);
  await tools.team.selectOption("A");
  await expect.poll(() => rowNames(page)).toEqual([9, 5, 2, 1].map(seedName));
  await expect(tools.count).toHaveText("4人を表示 ・ 絞り込みを解除");
  await tools.team.selectOption("none");
  // 03 の代表は再受験（チーム未設定で始まる。§2.24）
  await expect.poll(() => rowNames(page)).toEqual([3, 10, 8, 6].map(seedName));
  await tools.team.selectOption("");

  // 並び順 4 種（§2.7）。最後まで同じなら resultId の昇順
  await expect(tools.sort.locator("option")).toHaveText([
    "並び順：受験日が新しい順",
    "並び順：受験日が古い順",
    "並び順：氏名順",
    "並び順：1年以上たった人を先に",
  ]);
  await expect.poll(() => rowNames(page)).toEqual([3, 10, 9, 8, 6, 5, 4, 2, 1, 7].map(seedName));
  await tools.sort.selectOption("old");
  await expect.poll(() => rowNames(page)).toEqual([7, 1, 2, 4, 5, 6, 8, 9, 10, 3].map(seedName));
  await tools.sort.selectOption("name");
  await expect.poll(() => rowNames(page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(seedName));
  await tools.sort.selectOption("due");
  // 受験から1年以上の行（07）を先に、各群は古い順
  await expect.poll(() => rowNames(page)).toEqual([7, 1, 2, 4, 5, 6, 8, 9, 10, 3].map(seedName));

  // 受験から1年以上 → チーム B → 検索のあと「絞り込みを解除」: 検索語とチームが空になり、すべて に戻る（K-32 ④）。並び順は保つ
  await statCard(page, 3).click();
  await tools.team.selectOption("B");
  await tools.search.fill("テスト");
  await expect(tools.count).toHaveText("1人を表示 ・ 絞り込みを解除");
  await tools.clear.click();
  await expect(tools.search).toHaveValue("");
  await expect(tools.team).toHaveValue("");
  await expect(tools.sort).toHaveValue("due");
  await expect(tools.tabs).toHaveText(["すべて10", "求職者7", "在籍3", "退職0"]);
  await expect(tools.tab("すべて")).toHaveAttribute("aria-selected", "true");
  await expect(resultRows(page)).toHaveCount(10);
  await expect(tools.count).toHaveText("10人を表示");
});

test("M7-list-37 受験から1年以上: 0 人のカードは押せず、1 人以上は押すと 5 番目のタブで絞り込み、ほかのタブで消える", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await expect(statCard(page, 3)).toHaveText("受験から1年以上たった人0人再受験の時期はまだです");
  await expect(page.locator(".rl-stats button")).toHaveCount(0);

  // 02 の受験日を 400 日前にする（E2E に限った直接書き込み）
  backdateResult(seedExam(adminOrg, 2).resultId, 400);
  await page.reload();
  const card = page.locator(".rl-stats").getByRole("button");
  await expect(card).toHaveText("受験から1年以上たった人1人押すと一覧に絞り込みます");
  await card.click();
  const tools = listTools(page);
  await expect(tools.tabs).toHaveText([
    "すべて10",
    "求職者8",
    "在籍2",
    "退職0",
    "受験から1年以上1",
  ]);
  await expect(tools.tab("受験から1年以上")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => rowNames(page)).toEqual([seedName(2)]);
  await expect(rowOf(page, seedName(2)).locator(".rl-chip--one-year")).toHaveText(
    "受験から1年以上",
  );
  await expect(tools.count).toHaveText("1人を表示 ・ 絞り込みを解除");

  await tools.tab("求職者").click();
  await expect(tools.tabs).toHaveText(["すべて10", "求職者8", "在籍2", "退職0"]);
  await expect(resultRows(page)).toHaveCount(8);
});

test("M7-list-38 105 人の組織で 100 行と「さらに表示（残り5人）」。タブ・チーム・検索の入力で 100 行に戻り、並び順では戻らない", async ({
  page,
}) => {
  const org = seedManyRows(105);
  await loginViaUi(page, org.ownerEmail);
  const tools = listTools(page);
  const more = page.getByRole("button", { name: "さらに表示（残り5人）" });
  const showAll = async () => {
    await more.click();
    await expect(resultRows(page)).toHaveCount(105);
    await expect(more).toHaveCount(0);
  };

  await expect(resultRows(page)).toHaveCount(100);
  await expect(tools.count).toHaveText("105人を表示");
  await showAll();

  await tools.tab("求職者").click();
  await expect(resultRows(page)).toHaveCount(100);
  await showAll();

  await tools.team.selectOption("none");
  await expect(resultRows(page)).toHaveCount(100);
  await showAll();

  await tools.search.fill("テスト");
  await expect(resultRows(page)).toHaveCount(100);
  await showAll();

  // 並び順では戻らない
  await tools.sort.selectOption("old");
  expect((await rowNames(page))[0]).toBe("テストテスト 101");
  await expect(resultRows(page)).toHaveCount(105);
});

test("M7-list-46 区分・検索・チーム・並び順は結果詳細から「回答一覧に戻る」で戻り、表示の上限は 100 に戻る", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const tools = listTools(page);
  await tools.tab("求職者").click();
  await tools.search.fill("テストテスト");
  await tools.team.selectOption("A");
  await tools.sort.selectOption("old");
  await expect(tools.count).toHaveText("3人を表示 ・ 絞り込みを解除");
  await expect.poll(() => rowNames(page)).toEqual([1, 2, 5].map(seedName));

  // 行を押して結果詳細を開き、「回答一覧に戻る」
  await rowOf(page, seedName(2)).locator(".rl-td--type").click();
  await page.waitForURL(`**/admin/results/${seedExam(adminOrg, 2).resultId}`);
  await page.getByRole("link", { name: /回答一覧に戻る/ }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(tools.tab("求職者")).toHaveAttribute("aria-selected", "true");
  await expect(tools.search).toHaveValue("テストテスト");
  await expect(tools.team).toHaveValue("A");
  await expect(tools.sort).toHaveValue("old");
  await expect.poll(() => rowNames(page)).toEqual([1, 2, 5].map(seedName));

  // 105 人の組織（別のブラウザのコンテキスト）: 「さらに表示」のあと結果詳細から戻ると 100 行（上限は保存しない）
  const many = seedManyRows(105);
  const other = await (await browser.newContext()).newPage();
  await loginViaUi(other, many.ownerEmail);
  await other.getByRole("button", { name: "さらに表示（残り5人）" }).click();
  await expect(resultRows(other)).toHaveCount(105);
  await resultRows(other).last().locator(".rl-td--type").click();
  await other.waitForURL(/\/admin\/results\//);
  await other.getByRole("link", { name: /回答一覧に戻る/ }).click();
  await other.waitForURL((url) => url.pathname === "/admin");
  await expect(resultRows(other)).toHaveCount(100);
  await other.context().close();
});

test("M7-list-47 0 件の表示: すべて・在籍・求職者・退職のタブごとの文言とコピーのボタン、検索で 0 件は「絞り込みを解除」", async ({
  page,
  context,
  browser,
  adminOrg,
}) => {
  await grantClipboard(context);
  const empty = seedEmptyOrg();
  await loginViaUi(page, empty.ownerEmail);
  const tools = listTools(page);
  const box = page.locator(".rl-empty");
  await expect(tools.count).toHaveText("0人を表示");
  await expect(page.locator(".rl-note")).toHaveCount(0);
  await expect(page.locator("[data-testid=result-table]")).toHaveCount(0);

  await expect(box).toHaveText(
    "受験はまだありません求職者用の回答リンクを送ると、回答した人がここに表示されます。求職者用リンクをコピー",
  );
  await box.getByRole("button", { name: "求職者用リンクをコピー" }).click();
  await expect(statusToast(page)).toHaveText("求職者用の回答リンクをコピーしました");
  expect(await readClipboard(page)).toBe(answerLink(empty.organizationId, "applicant"));

  await tools.tab("在籍").click();
  await expect(box).toHaveText(
    "既存スタッフの受験はまだありません既存スタッフ用の回答リンクを送ると、ここに表示されます。既存スタッフ用リンクをコピー",
  );
  await box.getByRole("button", { name: "既存スタッフ用リンクをコピー" }).click();
  await expect(statusToast(page)).toHaveText("既存スタッフ用の回答リンクをコピーしました");
  expect(await readClipboard(page)).toBe(answerLink(empty.organizationId, "executive"));

  // 7 章の案（求職者タブ・退職タブ。11-2 7 章の 1・2）
  await tools.tab("求職者").click();
  await expect(box).toHaveText(
    "求職者の受験はまだありません求職者用の回答リンクを送ると、ここに表示されます。求職者用リンクをコピー",
  );
  await tools.tab("退職").click();
  await expect(box).toHaveText(
    "退職した人はいません区分を「退職」にした人が、ここに表示されます。",
  );
  await expect(box.getByRole("button")).toHaveCount(0);

  // オーナー以外も 0 件の在籍タブから既存スタッフ用の回答リンクをコピーできる（§2.17・§2.19。別のブラウザのコンテキスト）
  const adminContext = await browser.newContext();
  await grantClipboard(adminContext);
  const adminPage = await adminContext.newPage();
  await loginViaUi(adminPage, empty.adminEmail);
  await listTools(adminPage).tab("在籍").click();
  await adminPage
    .locator(".rl-empty")
    .getByRole("button", { name: "既存スタッフ用リンクをコピー" })
    .click();
  await expect(statusToast(adminPage)).toHaveText("既存スタッフ用の回答リンクをコピーしました");
  expect(await readClipboard(adminPage)).toBe(answerLink(empty.organizationId, "executive"));
  await adminContext.close();

  // seed の組織: 一致しない検索語は「条件に合う受験者がいません」と「絞り込みを解除」
  const seedPage = await (await browser.newContext()).newPage();
  await loginViaUi(seedPage, adminOrg.ownerEmail);
  const seedTools = listTools(seedPage);
  await seedTools.search.fill("一致しない語");
  await expect(seedPage.locator(".rl-empty")).toHaveText(
    "条件に合う受験者がいません検索や絞り込みを変えてみてください。絞り込みを解除",
  );
  await expect(seedTools.count).toHaveText("0人を表示 ・ 絞り込みを解除");
  await seedPage.locator(".rl-empty").getByRole("button", { name: "絞り込みを解除" }).click();
  await expect(seedTools.search).toHaveValue("");
  await expect(resultRows(seedPage)).toHaveCount(10);
  await seedPage.context().close();
});
