// E-03 未回答で「次へ」、「戻る」の部分保存、再読み込み、再開（05/T-06〜T-10、T-19）
import type { Page } from "@playwright/test";

import { createOrganization, expect, test } from "../support/fixtures";

import { questionNosOfPage } from "../support/questions";
import {
  answerCurrentPage,
  linkUrl,
  pressAriaDisabled,
  questionUrl,
  recordApiCalls,
  registerViaApi,
  savePagesViaApi,
  startViaApi,
} from "../support/respondent";

/** 登録・開始を API で済ませ、ページ 1 を開く */
async function openFirstPage(page: Page, organizationId: string): Promise<string> {
  const sessionId = await registerViaApi(page, organizationId);
  await startViaApi(page, sessionId);
  await page.goto(`/exam/${sessionId}`);
  await page.waitForURL(questionUrl(sessionId, 1));
  return sessionId;
}

function putBodies(page: Page): Array<{ pageNo: number; answers: unknown[] }> {
  const bodies: Array<{ pageNo: number; answers: unknown[] }> = [];
  page.on("request", (req) => {
    if (req.method() === "PUT" && new URL(req.url()).pathname.endsWith("/answers")) {
      bodies.push(req.postDataJSON() as { pageNo: number; answers: unknown[] });
    }
  });
  return bodies;
}

test.describe("E-03 設問ページの操作と再開", () => {
  test("05/T-06: 未回答があると遷移せず、未回答カードを赤枠にして最初の未回答へフォーカス。全回答で PUT 1 回", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openFirstPage(page, organizationId);
    const calls = recordApiCalls(page);
    const questions = questionNosOfPage(1);
    await answerCurrentPage(page, 1, () => 2, questions.length - 2);
    const next = page.getByTestId("next-button");
    await expect(page.getByTestId("unanswered-count")).toHaveText("未回答 2 問");
    await pressAriaDisabled(next);
    await expect(page).toHaveURL(questionUrl(sessionId, 1));
    const [firstMissing, secondMissing] = questions.slice(-2);
    for (const q of [firstMissing, secondMissing]) {
      const card = page.getByTestId(`question-${q}`);
      await expect(card).toHaveAttribute("data-unanswered-error", "true");
      await expect(card).toContainText("回答してください");
    }
    await expect(page.getByTestId(`choice-${firstMissing}-1`)).toBeFocused();
    await expect(page.locator("[data-unanswered-error=true]")).toHaveCount(2);
    expect(calls).toEqual([]);

    // 回答した設問の赤枠はその場で消える
    await page.getByTestId(`choice-${firstMissing}-4`).check();
    await expect(page.getByTestId(`question-${firstMissing}`)).not.toHaveAttribute(
      "data-unanswered-error",
      "true",
    );
    await page.getByTestId(`choice-${secondMissing}-4`).check();
    await expect(page.getByTestId("unanswered-count")).toHaveCount(0);
    await next.click();
    await page.waitForURL(questionUrl(sessionId, 2));
    expect(calls).toEqual([`PUT /api/v1/respondent/sessions/${sessionId}/answers`]);
    await expect(page.getByTestId("answered-count")).toHaveText(`${questions.length} / 144`);
  });

  test("05/T-09: 3 問だけ選んで「戻る」→ PUT に 3 件、前ページへ。戻ってくると 3 問が選択済み", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openFirstPage(page, organizationId);
    await answerCurrentPage(page, 1);
    await page.getByTestId("next-button").click();
    await page.waitForURL(questionUrl(sessionId, 2));

    const bodies = putBodies(page);
    const chosen = await answerCurrentPage(page, 2, () => 5, 3);
    await page.getByTestId("back-button").click();
    await page.waitForURL(questionUrl(sessionId, 1));
    expect(bodies).toEqual([
      { pageNo: 2, answers: chosen.map((questionNo) => ({ questionNo, choiceCode: 5 })) },
    ]);

    await page.getByTestId("next-button").click();
    await page.waitForURL(questionUrl(sessionId, 2));
    for (const q of chosen) await expect(page.getByTestId(`choice-${q}-5`)).toBeChecked();
    const rest = questionNosOfPage(2).slice(3);
    for (const q of rest) {
      await expect(page.getByTestId(`question-${q}`).locator("input:checked")).toHaveCount(0);
    }
  });

  test("「戻る」の部分保存に失敗しても遷移し、戻ると選択が sessionStorage から復元される。E-02 の再試行で保存できる", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openFirstPage(page, organizationId);
    await answerCurrentPage(page, 1);
    await page.getByTestId("next-button").click();
    await page.waitForURL(questionUrl(sessionId, 2));
    const chosen = await answerCurrentPage(page, 2, () => 1, 2);

    await page.route("**/answers", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    );
    await page.getByTestId("back-button").click();
    await page.waitForURL(questionUrl(sessionId, 1));
    await expect(page.getByTestId("error-banner")).toHaveAttribute("data-text-id", "E-02");

    await page.unroute("**/answers");
    const bodies = putBodies(page);
    await page.getByTestId("error-banner-action").click();
    await expect(page.getByTestId("error-banner")).toHaveCount(0);
    expect(bodies).toEqual([
      { pageNo: 2, answers: chosen.map((questionNo) => ({ questionNo, choiceCode: 1 })) },
    ]);
  });

  test("05/T-10: 未保存の選択は再読み込みで sessionStorage から復元される", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await openFirstPage(page, organizationId);
    const chosen = await answerCurrentPage(page, 1, () => 4, 4);
    await page.reload();
    await expect(page).toHaveURL(questionUrl(sessionId, 1));
    for (const q of chosen) await expect(page.getByTestId(`choice-${q}-4`)).toBeChecked();
    await expect(page.getByTestId("answered-count")).toHaveText("4 / 144");
  });

  test("05/T-08: ページ 3 まで保存すると /exam/{id} と先のページは /questions/4 へ。保存済みのページは開き直せる", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    await savePagesViaApi(page, sessionId, 3, 2);
    await page.goto(`/exam/${sessionId}`);
    await expect(page).toHaveURL(questionUrl(sessionId, 4));
    await page.goto(`/exam/${sessionId}/questions/10`);
    await expect(page).toHaveURL(questionUrl(sessionId, 4));
    await page.goto(`/exam/${sessionId}/questions/2`);
    await expect(page).toHaveURL(questionUrl(sessionId, 2));
    for (const q of questionNosOfPage(2)) {
      await expect(page.getByTestId(`choice-${q}-2`)).toBeChecked();
    }
    // 開始前は設問ページへ進めない
    const fresh = await registerViaApi(page, organizationId);
    await page.goto(`/exam/${fresh}/questions/1`);
    await expect(page).toHaveURL(new RegExp(`/exam/${fresh}$`));
  });

  test("05/T-19: 同一組織・同一区分の draft があると再開バナー（氏名なし）。別区分・別組織では出さない", async ({
    page,
    organizationId,
  }) => {
    const otherOrganizationId = createOrganization("E2E 別医院");
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    await savePagesViaApi(page, sessionId, 1);

    await page.goto(linkUrl(organizationId));
    const banner = page.getByTestId("resume-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("回答中の診断があります");
    await expect(banner).toContainText(`${questionNosOfPage(1).length} 問まで回答済みです`);
    await expect(banner).not.toContainText("E2E-");
    await page.getByTestId("resume-link").click();
    await expect(page).toHaveURL(questionUrl(sessionId, 2));

    await page.goto(linkUrl(organizationId, "executives"));
    await expect(page.getByTestId("registration-form")).toBeVisible();
    await expect(page.getByTestId("resume-banner")).toHaveCount(0);
    await page.goto(linkUrl(otherOrganizationId));
    await expect(page.getByTestId("registration-form")).toBeVisible();
    await expect(page.getByTestId("resume-banner")).toHaveCount(0);
  });
});
