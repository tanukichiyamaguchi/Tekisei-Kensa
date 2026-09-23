// レイアウトとアクセシビリティ（05/T-16、T-17。08 §2.4 完了条件「幅 320px で横スクロールがない」）
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";

import {
  answerCurrentPage,
  linkUrl,
  pressAriaDisabled,
  questionUrl,
  registerViaApi,
  savePagesViaApi,
  startViaApi,
} from "../support/respondent";

async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
}

async function expectMinHeight(page: Page, selector: string, min: number) {
  const heights = await page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length, selector).toBeGreaterThan(0);
  for (const h of heights) expect(h, selector).toBeGreaterThanOrEqual(min);
}

/** axe の重大・深刻な違反がないこと（テキストのコントラストを含む） */
async function expectAccessible(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = result.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    label,
  ).toEqual([]);
}

test.describe("受検者画面のレイアウトとアクセシビリティ", () => {
  test("05/T-17: 幅 320px で横スクロールがなく、ボタン・入力欄・選択肢の高さは 48px 以上", async ({
    page,
    organizationId,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(linkUrl(organizationId));
    await expectNoHorizontalScroll(page, "R-01");
    await expectMinHeight(page, ".exam-button", 48);
    await expectMinHeight(page, ".exam-input", 48);
    await expectMinHeight(page, ".exam-radio-row", 48);

    const sessionId = await registerViaApi(page, organizationId);
    await page.goto(`/exam/${sessionId}`);
    await expectNoHorizontalScroll(page, "R-02");
    await startViaApi(page, sessionId);
    await savePagesViaApi(page, sessionId, 4);
    // 8 問のページ（最長の設問を含むページも折り返す）
    await page.goto(`/exam/${sessionId}/questions/5`);
    await expect(page).toHaveURL(questionUrl(sessionId, 5));
    await expectNoHorizontalScroll(page, "R-03");
    await expectMinHeight(page, ".exam-choice", 48);
    await expectMinHeight(page, ".exam-nav .exam-button", 48);
  });

  test("05/T-16: 各入力に label、各設問に legend、axe の重大な違反なし（R-01・R-02・R-03・R-05）", async ({
    page,
    organizationId,
  }) => {
    await page.goto(linkUrl(organizationId));
    await expectAccessible(page, "R-01");
    // 未入力で押した後（赤枠・エラー文言）
    await pressAriaDisabled(page.getByTestId("register-submit"));
    await expectAccessible(page, "R-01 エラー表示");

    const sessionId = await registerViaApi(page, organizationId);
    await page.goto(`/exam/${sessionId}`);
    await expectAccessible(page, "R-02");

    await startViaApi(page, sessionId);
    await savePagesViaApi(page, sessionId, 19);
    await page.goto(`/exam/${sessionId}/questions/20`);
    const legends = await page.locator("fieldset.exam-question > legend").allInnerTexts();
    expect(legends).toHaveLength(8);
    for (const text of legends) expect(text).toMatch(/^Q\d+/);
    await expectAccessible(page, "R-03");
    await answerCurrentPage(page, 20);
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("submit-dialog")).toBeVisible();
    await expectAccessible(page, "R-04");
    await page.getByTestId("submit-confirm").click();
    await page.waitForURL(new RegExp(`/exam/${sessionId}/complete$`));
    await expectAccessible(page, "R-05");
  });

  test("無効なページ番号は 404 と固定文言（05 §5.6 page_not_found）", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    for (const bad of ["0", "21", "1.5", "abc"]) {
      const res = await page.goto(`/exam/${sessionId}/questions/${bad}`);
      expect(res?.status(), bad).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("ページが見つかりません");
    }
  });
});
