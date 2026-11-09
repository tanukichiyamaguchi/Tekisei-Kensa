// M7-exam-48 二重送信、M7-exam-52 続けられないとき（11-1 §5.3）。送信の応答ごとの画面の動作（11-1 §2.4.7）
import { expect, test } from "../support/fixtures";

import { emulatorTask } from "../support/admin";
import { questionNosOfStep } from "../support/questions";
import {
  alertDialog,
  answerCurrentStep,
  completeUrl,
  expectStep,
  openQuestions,
  questionsUrl,
  recordApiCalls,
  registerViaApi,
  saveStepsViaApi,
  startViaApi,
} from "../support/respondent";

test.describe("M7-exam-48 二重送信", () => {
  test("「送信する」を続けて押しても POST …/submit は 1 回で、完了画面に移る", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openQuestions(page, organizationId, 3);
    await expectStep(page, 4);
    await answerCurrentStep(page, 4);
    const calls = recordApiCalls(page);
    const submit = page.getByTestId("submit-button");
    await submit.click();
    await submit.click({ force: true }).catch(() => undefined);
    await submit.click({ force: true }).catch(() => undefined);
    await page.waitForURL(completeUrl(sessionId));
    expect(calls.filter((c) => c.endsWith("/submit"))).toHaveLength(1);
    expect(emulatorTask<{ count: number }>("count-results-of-session", sessionId).count).toBe(1);
    expect(
      emulatorTask<{ resultCount: number; usageLogCount: number }>("result-of-session", sessionId),
    ).toMatchObject({ resultCount: 1, usageLogCount: 1 });
  });

  test("ほかのタブで送信済み（409）でも成功と同じに完了画面へ", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openQuestions(page, organizationId, 3);
    await answerCurrentStep(page, 4);
    // 画面の外で送信する
    await saveStepsViaApi(page, sessionId, 4);
    expect(
      (await page.request.post(`/api/v1/respondent/sessions/${sessionId}/submit`)).status(),
    ).toBe(200);
    await page.getByTestId("submit-button").click();
    await page.waitForURL(completeUrl(sessionId));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答完了");
  });

  test("送信の 422 ANSWERS_INCOMPLETE は、その設問のステップを出して印を付ける。5xx は R-07（E-01）で、押し直すと送れる", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openQuestions(page, organizationId, 3);
    await answerCurrentStep(page, 4);
    await page.route("**/submit", (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "ANSWERS_INCOMPLETE", message: "x", details: { missing: [45] } },
        }),
      }),
    );
    await page.getByTestId("submit-button").click();
    await expectStep(page, 2);
    await expect(page.getByTestId("question-45")).toHaveAttribute("data-unanswered", "true");
    await expect(page.getByTestId("choice-45-1")).toBeFocused();
    await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
    await page.unroute("**/submit");

    // Step 2 から進み直して送信する。送信の 5xx は R-07（E-01）
    await page.getByTestId("choice-45-3").check();
    for (const stepNo of [2, 3]) {
      await expectStep(page, stepNo);
      await page.getByTestId("next-button").click();
    }
    await expectStep(page, 4);
    await page.route("**/submit", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "x", details: {} } }),
      }),
    );
    await page.getByTestId("submit-button").click();
    await expect(alertDialog(page).locator(".swal-content")).toHaveText(
      "通信に失敗しました。電波の良い場所で、もう一度お試しください。",
    );
    await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
    await expect(page).toHaveURL(questionsUrl(sessionId));
    await expect(alertDialog(page)).toBeHidden({ timeout: 3_000 });
    await page.unroute("**/submit");
    await page.getByTestId("submit-button").click();
    await page.waitForURL(completeUrl(sessionId));
  });
});

test.describe("M7-exam-52 続けられないとき", () => {
  test("Cookie なしで開くと「回答を続けられません」（404）。個人情報を出さない", async ({
    page,
    browser,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    const other = await browser.newContext();
    const stranger = await other.newPage();
    for (const path of [
      `/exam/${sessionId}`,
      `/exam/${sessionId}/questions`,
      `/exam/${sessionId}/questions/1`,
      `/exam/${sessionId}/complete`,
    ]) {
      const res = await stranger.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
      await expect(stranger.locator("main")).toContainText(
        "回答の有効期限が切れたか、別の端末・ブラウザで開いています。お手数ですが、受験リンクからもう一度登録してください。",
      );
      await expect(stranger.locator("main")).not.toContainText("E2E-");
    }
    await other.close();
  });

  test("保存の途中で期限切れにすると、その場に E-04 を出して退避を消す。開き直すと 404", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    await page.goto(`/exam/${sessionId}/questions`);
    await answerCurrentStep(page, 1, { count: 3 });

    emulatorTask("expire-session", sessionId);
    const q = questionNosOfStep(1)[5] ?? 6;
    await page.getByTestId(`choice-${q}-2`).check();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
    await expect(page.locator("main")).toContainText(
      "回答の有効期限が切れました。受験リンクからもう一度登録してください。",
    );
    await expect(page).toHaveURL(questionsUrl(sessionId));
    const drafts = await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("tk_exam_")),
    );
    expect(drafts).toEqual([]);

    const res = await page.goto(`/exam/${sessionId}/questions`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答を続けられません");
  });
});
