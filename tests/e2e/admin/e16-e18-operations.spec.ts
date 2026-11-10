// E-17 組織内分類・アカウント、E-18 招待とパスワード設定（08 §3.4.3）。
// E-16（チーム・除外・削除）は回答一覧の作り直しで M7-list-39・43（list-operations.spec.ts）に、E-17 の利用履歴は M7-list-44 に移した
// （11-2 §5.5。利用履歴はヘッダーではなく回答一覧の見出しの横から開く）。E-17 の組織内分類は作り直した画面の部品で確かめる（11-3 §5.5）
import { emulatorTask } from "../support/admin";
import {
  E2E_ADMIN_PASSWORD,
  expect,
  loginViaUi,
  obCell,
  obHeading,
  obPanel,
  obTotal,
  openDialog,
  resultRows,
  test,
} from "../support/admin-ui";

test("E-17 組織内分類の人数が一覧の除外中でない行の数と一致し、分類・キャラクターのパネル、受検リンクのコピー、owner の招待リンク発行", async ({
  page,
  context,
  adminOrg,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginViaUi(page, adminOrg.ownerEmail);
  // 一覧は 10 行で、除外中は 10 の 1 行。組織内分類は除外した受験を数えない（11-3 §2.2。K-39 Q-24）
  await expect(resultRows(page)).toHaveCount(10);
  const included = await resultRows(page).getByRole("switch", { checked: false }).count();
  expect(included).toBe(9);
  await page.goto("/admin/classification");
  await expect(obTotal(page).label).toHaveText("回答者");
  await expect(obTotal(page).count).toHaveText(String(included));

  await obHeading(page, "analytical").click();
  await expect(obPanel(page).getByRole("heading", { level: 2 })).toHaveText("アナリティカル");
  await page.keyboard.press("Escape");
  await expect(obPanel(page)).toBeHidden();
  await obCell(page, "pioneer").click();
  await expect(obPanel(page).getByRole("heading", { level: 2 })).toHaveText("ひなた");
  await page.keyboard.press("Escape");
  await expect(obPanel(page)).toBeHidden();

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
