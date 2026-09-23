// 管理画面の E2E の共通操作（08 §3.4.3 E-10〜E-18）。ログインは画面から行い、Cookie の注入はしない（08 §3.4.1）
import { test as base, expect, type Page } from "@playwright/test";

import { emulatorTask } from "./admin";

export const E2E_ADMIN_PASSWORD = "e2e-admin-pass-1234";

export interface AdminOrg {
  readonly organizationId: string;
  readonly inviteLink: string;
  readonly ownerEmail: string;
  readonly adminEmail: string;
  readonly ownerUid: string;
  readonly adminUid: string;
  readonly submitted: ReadonlyArray<{
    readonly respondentId: string;
    readonly resultId: string;
    readonly kind: "applicant" | "executive";
  }>;
}

/** seed:local と同じ構成の組織（求職者 8 人・幹部 2 人・下書き 1 人）をテストごとに作る */
export const test = base.extend<{ adminOrg: AdminOrg }>({
  // eslint-disable-next-line no-empty-pattern
  adminOrg: async ({}, use) => {
    await use(emulatorTask<AdminOrg>("seed-admin-org", E2E_ADMIN_PASSWORD));
  },
});
export { expect };

/** M-01 から画面でログインし、/admin（または next）に着くまで待つ。login-events の呼び出し回数を返す */
export async function loginViaUi(
  page: Page,
  email: string,
  password = E2E_ADMIN_PASSWORD,
): Promise<{ loginEvents: number }> {
  let loginEvents = 0;
  const listener = (req: { url(): string; method(): string }) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/v1/admin/me/login-events"
    ) {
      loginEvents += 1;
    }
  };
  page.on("request", listener);
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  page.off("request", listener);
  return { loginEvents };
}

export const resultRows = (page: Page) => page.locator("[data-testid=result-table] tbody tr");

/** 表示中のダイアログ（閉じたダイアログの中身も DOM に残るため open のものに限る） */
export const openDialog = (page: Page) => page.locator("dialog[open]");
