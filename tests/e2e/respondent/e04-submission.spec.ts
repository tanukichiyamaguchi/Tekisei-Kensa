// E-04 二重送信、送信後の戻る、Cookie なし、期限切れ（05/T-12〜T-15、T-15a、T-15b）
import { expect, test, type Page } from "@playwright/test";

import { emulatorTask } from "../support/admin";
import {
  answerCurrentPage,
  questionUrl,
  recordApiCalls,
  registerViaApi,
  savePagesViaApi,
  startViaApi,
} from "../support/respondent";
import { readState } from "../support/state";

/** 19 ページ分を保存済みにして最終ページを開く */
async function openLastPage(page: Page): Promise<string> {
  const { organizationId } = readState();
  const sessionId = await registerViaApi(page, organizationId);
  await startViaApi(page, sessionId);
  await savePagesViaApi(page, sessionId, 19);
  await page.goto(`/exam/${sessionId}/questions/20`);
  await expect(page).toHaveURL(questionUrl(sessionId, 20));
  return sessionId;
}

const completeUrl = (sessionId: string) => new RegExp(`/exam/${sessionId}/complete$`);

test.describe("E-04 送信と無効なセッション", () => {
  test("05/T-12: 「送信する」を連打しても submit は 1 回で、完了画面に着地する", async ({
    page,
  }) => {
    const sessionId = await openLastPage(page);
    const calls = recordApiCalls(page);
    await answerCurrentPage(page, 20);
    await page.getByTestId("submit-button").click();
    const confirm = page.getByTestId("submit-confirm");
    await expect(confirm).toBeVisible();
    await confirm.click();
    await confirm.click({ force: true }).catch(() => undefined);
    await confirm.click({ force: true }).catch(() => undefined);
    await page.waitForURL(completeUrl(sessionId));
    const submits = calls.filter((c) => c.endsWith("/submit"));
    expect(submits).toHaveLength(1);
    expect(emulatorTask<{ count: number }>("count-results-of-session", sessionId).count).toBe(1);
  });

  test("05/T-12: 送信済みの 409 も成功扱いで完了画面へ（別タブで送信済みの場合）", async ({
    page,
  }) => {
    const sessionId = await openLastPage(page);
    await answerCurrentPage(page, 20);
    // 別タブ相当: 画面の外で最終ページを保存して送信する
    await savePagesViaApi(page, sessionId, 20);
    expect(
      (await page.request.post(`/api/v1/respondent/sessions/${sessionId}/submit`)).status(),
    ).toBe(200);
    await page.getByTestId("submit-button").click();
    await page.getByTestId("submit-confirm").click();
    await page.waitForURL(completeUrl(sessionId));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答が完了しました");
  });

  test("05/T-13: 送信後に設問・開始の URL を開くと完了画面へ。ブラウザの戻るでも回答画面に戻れない", async ({
    page,
  }) => {
    const sessionId = await openLastPage(page);
    // 履歴にページ 19 → 20 を積み、「次へ」で最終ページへ進んだ状態にする
    await page.goto(`/exam/${sessionId}/questions/19`);
    await page.getByTestId("next-button").click();
    await page.waitForURL(questionUrl(sessionId, 20));
    await answerCurrentPage(page, 20);
    await page.getByTestId("submit-button").click();
    await page.getByTestId("submit-confirm").click();
    await page.waitForURL(completeUrl(sessionId));
    // 完了画面は router.replace で履歴のページ 20 を置き換えるため、戻るとページ 19 の URL になるが、
    // サーバの判定（05 §1.3）で完了画面へ戻される
    await page.goBack();
    await expect(page).toHaveURL(completeUrl(sessionId));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答が完了しました");
    for (const path of [`/exam/${sessionId}/questions/20`, `/exam/${sessionId}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(completeUrl(sessionId));
    }
  });

  test("05/T-14: Cookie なしで開くと 404 と固定文言（個人情報を出さない）", async ({
    page,
    browser,
  }) => {
    const { organizationId } = readState();
    const sessionId = await registerViaApi(page, organizationId);
    const other = await browser.newContext();
    const stranger = await other.newPage();
    for (const path of [
      `/exam/${sessionId}`,
      `/exam/${sessionId}/questions/1`,
      `/exam/${sessionId}/complete`,
    ]) {
      const res = await stranger.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
      await expect(stranger.locator("main")).not.toContainText("E2E-");
    }
    await other.close();
  });

  test("05/T-15: 期限切れは開くと 404 の再登録案内、表示中なら保存で E-04 を全面表示", async ({
    page,
  }) => {
    const { organizationId } = readState();
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    await page.goto(`/exam/${sessionId}/questions/1`);
    await answerCurrentPage(page, 1);

    emulatorTask("expire-session", sessionId);
    await page.getByTestId("next-button").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
    await expect(page.locator("main")).toContainText(
      "回答の有効期限が切れました。受検リンクからもう一度登録してください。",
    );
    await expect(page).toHaveURL(questionUrl(sessionId, 1));
    // 退避した選択は消す（05 §6.4）
    const drafts = await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("tk_exam_draft:")),
    );
    expect(drafts).toEqual([]);

    const res = await page.goto(`/exam/${sessionId}/questions/1`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
  });

  test("05/T-15a: start が 5xx なら R-02 に留まり E-01、再試行で成功すると設問ページへ", async ({
    page,
  }) => {
    const { organizationId } = readState();
    const sessionId = await registerViaApi(page, organizationId);
    await page.route("**/start", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "x", details: {} } }),
      }),
    );
    await page.goto(`/exam/${sessionId}`);
    await page.getByTestId("start-button").click();
    await expect(page.getByTestId("error-banner")).toHaveAttribute("data-text-id", "E-01");
    await expect(page).toHaveURL(new RegExp(`/exam/${sessionId}$`));
    await page.unroute("**/start");
    await page.getByTestId("error-banner-action").click();
    await page.waitForURL(questionUrl(sessionId, 1));
  });

  test("05/T-15b: submit が ANSWERS_INCOMPLETE なら E-03 と「未回答のページへ移動」", async ({
    page,
  }) => {
    const sessionId = await openLastPage(page);
    await page.route("**/submit", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "ANSWERS_INCOMPLETE", message: "x", details: { missing: [141, 142] } },
        }),
      }),
    );
    await answerCurrentPage(page, 20);
    await page.getByTestId("submit-button").click();
    await page.getByTestId("submit-confirm").click();
    await expect(page.getByTestId("error-banner")).toHaveAttribute("data-text-id", "E-03");
    await expect(page.getByTestId("submit-dialog")).not.toBeVisible();
    await page.unroute("**/submit");
    await page.getByTestId("error-banner-action").click();
    await expect(page).toHaveURL(questionUrl(sessionId, 20));
  });
});
