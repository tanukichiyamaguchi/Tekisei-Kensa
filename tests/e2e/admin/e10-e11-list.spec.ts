// E-10 ログイン → 回答一覧 → ログアウト、E-11 幹部の可視性（08 §3.4.3、06 §3.1・§3.4、00 §5）
import { expect, loginViaUi, openDialog, resultRows, test } from "../support/admin-ui";

test("E-10 ログインで login-events が 1 回呼ばれ、一覧が回答日時の降順・所定の列で出る。ログアウトで戻れない", async ({
  page,
  adminOrg,
}) => {
  const { loginEvents } = await loginViaUi(page, adminOrg.adminEmail);
  expect(loginEvents).toBe(1);

  // admin には区分列が無い（06 §3.4.2）
  await expect(page.locator("[data-testid=result-table] thead th")).toHaveText([
    "詳細",
    "お名前",
    "チーム",
    "除外",
    "職業",
    "電話番号",
    "回答日時",
    "削除",
  ]);
  // シードは テストテスト 01 → 08 の順に送信しているため、降順では 08 が先頭
  const names = await resultRows(page).locator("td:nth-child(2)").allTextContents();
  expect(names).toEqual([8, 7, 6, 5, 4, 3, 2, 1].map((n) => `テストテスト 0${n}`));

  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/login");
  await page.goto("/admin");
  await page.waitForURL((url) => url.pathname === "/admin/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
});

test("E-10 誤ったパスワードは T-24 を表示してログインしない", async ({ page, adminOrg }) => {
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(adminOrg.ownerEmail);
  await page.getByLabel("パスワード", { exact: true }).fill("wrong-password-9");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator(".notice--error")).toHaveText(
    "メールアドレスまたはパスワードが正しくありません",
  );
  expect(new URL(page.url()).pathname).toBe("/admin/login");
});

test("E-11 admin には幹部が一覧・組織内分類・利用履歴に出ず、URL 直打ちは 404。owner は区分列付きで出る", async ({
  page,
  adminOrg,
}) => {
  const executive = adminOrg.submitted.find((s) => s.kind === "executive");
  if (!executive) throw new Error("シードに幹部がいません");

  await loginViaUi(page, adminOrg.adminEmail);
  await expect(resultRows(page)).toHaveCount(8);
  await expect(page.locator(".result-filters__total")).toHaveText("全 8 件");
  await expect(page.getByLabel("区分")).toHaveCount(0);

  await page.getByRole("button", { name: "利用履歴" }).click();
  // 求職者 8 人 + 送信前の下書き 1 人（幹部 2 人は含まない）
  await expect(openDialog(page).locator(".dialog__title")).toHaveText("利用履歴（全 9 件）");
  await page.keyboard.press("Escape");

  await page.goto("/admin/classification");
  await expect(page.getByText("全 8 名")).toBeVisible();

  await page.goto(`/admin/results/${executive.resultId}`);
  await expect(page.locator("main [role=alert]")).toHaveText("回答データが見つかりません");

  // owner
  await page.goto("/admin/account");
  await page.getByRole("button", { name: "ログアウト" }).first().click();
  await page.waitForURL((url) => url.pathname === "/admin/login");
  await loginViaUi(page, adminOrg.ownerEmail);
  await expect(resultRows(page)).toHaveCount(10);
  await expect(page.locator("[data-testid=result-table] thead th").nth(2)).toHaveText("区分");
  await expect(resultRows(page).filter({ hasText: "既存スタッフ" })).toHaveCount(2);
  await page.goto(`/admin/results/${executive.resultId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/様の診断結果$/);
});
