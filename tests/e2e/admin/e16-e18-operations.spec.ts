// E-16 チーム・除外・削除、E-17 組織内分類・利用履歴・アカウント、E-18 招待とパスワード設定（08 §3.4.3）
import { emulatorTask } from "../support/admin";
import {
  E2E_ADMIN_PASSWORD,
  expect,
  loginViaUi,
  openDialog,
  resultRows,
  test,
} from "../support/admin-ui";

test("E-16 チーム・除外は即時 PATCH（失敗時は元に戻る）、削除は確認ダイアログ → DELETE → 一覧から消える", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.adminEmail);
  const row = resultRows(page).filter({ hasText: "テストテスト 06" });
  const team = row.getByRole("combobox");
  await expect(team).toHaveValue("");

  const [patch] = await Promise.all([
    page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes("/api/v1/admin/respondents/"),
    ),
    team.selectOption("C"),
  ]);
  expect(patch.postDataJSON()).toEqual({ teamCode: "C" });
  await expect(team).toHaveValue("C");

  // 失敗時は元に戻り、Toast を出す
  await page.route("**/api/v1/admin/respondents/**", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "サーバでエラーが発生しました", details: {} },
          }),
        })
      : route.continue(),
  );
  const exclude = row.getByRole("checkbox");
  await exclude.check();
  await expect(page.locator(".toast--error")).toHaveText("サーバでエラーが発生しました");
  await expect(exclude).not.toBeChecked();
  await page.unroute("**/api/v1/admin/respondents/**");

  // 再読み込みしてもチームは C（保存されている）
  await page.reload();
  await expect(
    resultRows(page).filter({ hasText: "テストテスト 06" }).getByRole("combobox"),
  ).toHaveValue("C");

  // 削除
  await resultRows(page)
    .filter({ hasText: "テストテスト 06" })
    .getByRole("button", { name: /を削除$/ })
    .click();
  await expect(openDialog(page).locator(".dialog__title")).toHaveText("回答データを削除しますか？");
  const [del] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "DELETE"),
    openDialog(page).getByRole("button", { name: "削除する" }).click(),
  ]);
  expect(del.status()).toBe(204);
  await expect(resultRows(page).filter({ hasText: "テストテスト 06" })).toHaveCount(0);
  await expect(page.locator(".result-filters__total")).toHaveText("全 7 件");
});

test("E-17 組織内分類の人数合計が一覧と一致し、分類・キャラクターのポップアップ、利用履歴、受検リンクのコピー、owner の招待リンク発行", async ({
  page,
  context,
  adminOrg,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginViaUi(page, adminOrg.ownerEmail);
  await page.goto("/admin/classification");
  const counts = (await page.getByTestId("style-count").allTextContents()).map((s) =>
    Number.parseInt(s, 10),
  );
  expect(counts.reduce((a, b) => a + b, 0)).toBe(10);

  await page
    .getByTestId("classification-analytical")
    .locator(".classification-card__title")
    .click();
  await expect(openDialog(page).locator(".dialog__title")).toHaveText("Analyticalタイプ（分析型）");
  await page.keyboard.press("Escape");
  await page.getByTestId("classification-driving").locator(".character").first().click();
  await expect(openDialog(page).locator(".dialog__title")).toHaveText("ひなた（パイオニアタイプ）");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "利用履歴" }).click();
  await expect(openDialog(page).locator(".dialog__title")).toHaveText("利用履歴（全 11 件）");
  await expect(openDialog(page).getByText("未回答")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.goto("/admin/account");
  await page.getByRole("button", { name: "求職者用回答リンクをコピーする" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `http://localhost:3000/exam?q=${adminOrg.organizationId}&p=user`,
  );
  await page.getByRole("button", { name: "既存スタッフ用回答リンクをコピーする" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `http://localhost:3000/exam?q=${adminOrg.organizationId}&p=executives`,
  );

  await page.getByRole("button", { name: "管理者追加用リンクを発行する" }).click();
  await openDialog(page).getByRole("button", { name: "発行する", exact: true }).click();
  const invite = page.locator("#link-invite");
  await expect(invite).toHaveValue(/^http:\/\/localhost:3000\/admin\/signup\?q=[A-Za-z0-9_-]{43}$/);
  await page.getByRole("button", { name: "管理者追加用リンクをコピーする" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await invite.inputValue());
  // 再表示できない（再読み込みで消える）
  await page.reload();
  await expect(page.locator("#link-invite")).toHaveCount(0);
});

test("E-17 admin にはアカウント画面の招待リンク発行と管理者一覧が無い", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.adminEmail);
  await page.goto("/admin/account");
  await expect(page.getByRole("heading", { name: "受検リンク" })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理者追加用リンクを発行する" })).toHaveCount(0);
  await expect(page.getByTestId("admin-user-table")).toHaveCount(0);
});

test("E-18 招待リンクで登録すると T-35 とクレーム付きの Auth ユーザーができ、メールのリンク（oobCode）でパスワードを設定してログインできる", async ({
  page,
  adminOrg,
}) => {
  await page.goto("/admin/signup?q=invalid-token");
  await expect(page.locator("main [role=alert]")).toHaveText(
    "このリンクは無効です。管理者追加用リンクを組織の管理者から受け取ってください。",
  );

  const email = `e2e-invited-${Date.now()}@example.com`;
  await page.goto(adminOrg.inviteLink.replace("http://localhost:3000", ""));
  await expect(page.getByText("ローカル歯科医院 の管理者として登録します")).toBeVisible();
  await page.getByLabel("お名前").fill("テストテスト 招待");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "登録しました。パスワード設定用のメールを送信しました。メール内のリンクからパスワードを設定してください",
  );
  const { claims } = emulatorTask<{ claims: Record<string, unknown> | null }>("user-claims", email);
  expect(claims).toEqual({ organizationId: adminOrg.organizationId, role: "admin" });

  // Auth Emulator の REST から oobCode を取り出す（08 E-18）
  const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-tekisei";
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/oobCodes`);
  const { oobCodes } = (await res.json()) as {
    oobCodes: Array<{ email: string; requestType: string; oobCode: string }>;
  };
  const code = oobCodes
    .filter((c) => c.email === email && c.requestType === "PASSWORD_RESET")
    .at(-1);
  expect(code).toBeTruthy();

  await page.goto(`/admin/password-reset?mode=resetPassword&oobCode=${code!.oobCode}`);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByLabel("新しいパスワード（確認）").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "パスワードを設定する" }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  // 招待で登録した管理者は admin（幹部は見えない）
  await expect(page.locator("[data-testid=result-table] tbody tr")).toHaveCount(8);

  // 使用済みのリンクは T-23
  await page.goto(`/admin/password-reset?mode=resetPassword&oobCode=${code!.oobCode}`);
  await expect(page.locator(".notice--error")).toHaveText(
    "認証リンクが無効か期限切れです。もう一度お試しください",
  );
});
