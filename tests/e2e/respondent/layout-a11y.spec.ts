// M7-exam-50 見た目とレイアウト、M7-exam-51 アクセシビリティ（11-1 §5.3）
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";

import {
  alertDialog,
  answerCurrentStep,
  computed,
  expectStep,
  fillRegistration,
  linkUrl,
  openQuestions,
  pressAriaDisabled,
  registerViaApi,
  registrationFields,
  saveStepsViaApi,
  startViaApi,
} from "../support/respondent";

async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
}

/** 押せない状態のボタン（参照元どおりの色で、基準の対象外。K-48）の節点か */
const isDisabledButton = (html: string) =>
  /aria-disabled="true"/.test(html) && /data-testid="(register-submit|start-button)"/.test(html);

/**
 * axe の重大・深刻な違反が無いこと（文字のコントラスト color-contrast も検査する）。
 * color-contrast の対象から外すのは、押せない状態の「診断に進む」「開始する」だけ（ほかの規則は外さない。M7-exam-51）
 */
async function expectAccessible(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      ...v,
      nodes: v.id === "color-contrast" ? v.nodes.filter((n) => !isDisabledButton(n.html)) : v.nodes,
    }))
    .filter((v) => v.nodes.length > 0);
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    label,
  ).toEqual([]);
}

test.describe("M7-exam-50 見た目とレイアウト", () => {
  test("幅 1440px の受験者登録の寸法と色（K-48・K-50）", async ({ page, organizationId }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(linkUrl(organizationId, "user"));
    const heading = page.getByRole("heading", { level: 1 });
    const headingBox = await heading.boundingBox();
    expect(headingBox?.y ?? 0).toBeGreaterThanOrEqual(132);
    expect(headingBox?.y ?? 0).toBeLessThanOrEqual(136);
    const fields = registrationFields(page);
    const heights: number[] = [];
    for (const field of Object.values(fields)) {
      const box = await field.boundingBox();
      expect(box?.width).toBe(460);
      expect(box?.x).toBe(490);
      heights.push(box?.height ?? 0);
      // 入力欄・プルダウンの枠 #7C90B9（K-50）
      expect(await computed(field, "border-top-color")).toBe("rgb(124, 144, 185)");
    }
    expect(heights).toEqual([40, 45, 48, 48]);
    // プレースホルダーと未選択の表示 #767676（K-48）、矢印 #949494（K-50）、アイコン #D5D5D5
    expect(await computed(fields.name, "color", "::placeholder")).toBe("rgb(118, 118, 118)");
    expect(await computed(fields.occupation, "color")).toBe("rgb(118, 118, 118)");
    expect(await computed(page.locator(".exam-select__arrow").first(), "color")).toBe(
      "rgb(148, 148, 148)",
    );
    expect(await computed(page.locator(".exam-field__icon").first(), "color")).toBe(
      "rgb(213, 213, 213)",
    );
    // 押せない状態のボタン（参照元どおり）
    const submit = page.getByTestId("register-submit");
    expect(await computed(submit, "background-color")).toBe("rgba(63, 141, 165, 0.1)");
    expect(await computed(submit, "color")).toBe("rgb(63, 141, 165)");
    await fillRegistration(page);
    await expect(submit).not.toHaveAttribute("aria-disabled", "true");
    const submitBox = await submit.boundingBox();
    expect(submitBox?.height).toBe(45);
    expect(submitBox?.width).toBe(460);
    expect(await computed(submit, "background-color")).toBe("rgb(57, 127, 148)");
    expect(await computed(submit, "color")).toBe("rgb(255, 255, 255)");
    expect(await computed(fields.occupation, "color")).toBe("rgb(37, 37, 37)");
    // ログインのリンク #3B799C（K-48）。下線なし
    const login = page.getByTestId("login-link");
    expect(await computed(login, "color")).toBe("rgb(59, 121, 156)");
    expect(await computed(login, "text-decoration-line")).toBe("none");
    expect(await computed(page.locator(".exam-root"), "background-color")).toBe(
      "rgb(247, 249, 252)",
    );
  });

  test("幅 375px と 320px で R-01・R-02・R-03・R-05 に横スクロールが無い", async ({
    page,
    organizationId,
  }) => {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(linkUrl(organizationId, "user"));
      await expectNoHorizontalScroll(page, `R-01 ${width}`);
      const sessionId = await registerViaApi(page, organizationId);
      await page.goto(`/exam/${sessionId}`);
      await expectNoHorizontalScroll(page, `R-02 ${width}`);
      await startViaApi(page, sessionId);
      for (const savedSteps of [0, 3]) {
        if (savedSteps > 0) await saveStepsViaApi(page, sessionId, savedSteps);
        await page.goto(`/exam/${sessionId}/questions`);
        await expect(page.getByTestId("question-form")).toBeVisible();
        await expectNoHorizontalScroll(page, `R-03 ${width} Step ${savedSteps + 1}`);
      }
      await saveStepsViaApi(page, sessionId, 4);
      expect(
        (await page.request.post(`/api/v1/respondent/sessions/${sessionId}/submit`)).status(),
      ).toBe(200);
      await page.goto(`/exam/${sessionId}/complete`);
      await expect(page.getByTestId("complete-view")).toBeVisible();
      await expectNoHorizontalScroll(page, `R-05 ${width}`);
    }
  });

  test("ステップ表示: 920px 以下でラベルを出さず 1280px で出す。丸の色が今・済み・先で 11-1 §2.4.3 の色", async ({
    page,
    organizationId,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openQuestions(page, organizationId, 1);
    await expectStep(page, 2);
    const indicator = page.getByTestId("step-indicator");
    await expect(indicator).toHaveAttribute("aria-label", "ステップ 2 / 4");
    await expect(indicator.locator(".exam-steps__label")).toHaveText([
      "Step1",
      "Step2",
      "Step3",
      "Step4",
    ]);
    await expect(indicator.locator(".exam-steps__label").first()).toBeVisible();

    const circle = (n: number) => indicator.getByTestId(`step-${n}`).locator(".exam-steps__circle");
    // 済んだステップ: 枠 #3F8DA5、地 #397F94、番号 白
    expect(await computed(circle(1), "border-top-color")).toBe("rgb(63, 141, 165)");
    expect(await computed(circle(1), "background-color")).toBe("rgb(57, 127, 148)");
    expect(await computed(circle(1), "color")).toBe("rgb(255, 255, 255)");
    // 今のステップ: 枠 #3F8DA5、地 rgba(63, 141, 165, 0.1)、番号 #24515F
    expect(await computed(circle(2), "border-top-color")).toBe("rgb(63, 141, 165)");
    expect(await computed(circle(2), "background-color")).toBe("rgba(63, 141, 165, 0.1)");
    expect(await computed(circle(2), "color")).toBe("rgb(36, 81, 95)");
    // 先のステップ: 丸ごと不透明度 70%、番号 #141313
    expect(await computed(circle(3), "opacity")).toBe("0.7");
    expect(await computed(circle(3), "color")).toBe("rgb(20, 19, 19)");
    expect(await computed(circle(3), "background-color")).toBe("rgba(76, 75, 75, 0.1)");
    // ラベル: 今以下 #377A8F、先 #4C4B4B
    const label = (n: number) => indicator.getByTestId(`step-${n}`).locator(".exam-steps__label");
    expect(await computed(label(1), "color")).toBe("rgb(55, 122, 143)");
    expect(await computed(label(2), "color")).toBe("rgb(55, 122, 143)");
    expect(await computed(label(3), "color")).toBe("rgb(76, 75, 75)");

    await page.setViewportSize({ width: 920, height: 800 });
    await expect(indicator.locator(".exam-steps__label").first()).toBeHidden();
    await page.setViewportSize({ width: 921, height: 800 });
    await expect(indicator.locator(".exam-steps__label").first()).toBeVisible();
  });

  test("Inter の書体のファイルを同じオリジンから読み、外部への要求と CSP の違反が無い", async ({
    page,
    organizationId,
    baseURL,
  }) => {
    const external: string[] = [];
    const fonts: string[] = [];
    const cspErrors: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.origin !== new URL(baseURL ?? "http://localhost:3000").origin) {
        external.push(req.url());
      }
      if (req.resourceType() === "font") fonts.push(url.pathname);
    });
    page.on("console", (msg) => {
      if (/Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
    });
    await openQuestions(page, organizationId);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await page.evaluate(() => document.fonts.check('400 16px "Inter"'))).toBe(true);
    expect(fonts.some((path) => /inter-latin-\d{3}-normal\.[0-9a-f]+\.woff2$/.test(path))).toBe(
      true,
    );
    expect(external).toEqual([]);
    expect(cspErrors).toEqual([]);
    expect(await computed(page.locator(".exam-root"), "font-family")).toMatch(/^Inter, /);
  });
});

test.describe("M7-exam-51 アクセシビリティ", () => {
  test("入力欄・プルダウンの名前、各設問の legend、エラーの項目の aria-invalid。各画面で axe の重大・深刻な違反が無い", async ({
    page,
    organizationId,
  }) => {
    // R-01
    await page.goto(linkUrl(organizationId, "user"));
    const fields = registrationFields(page);
    for (const field of Object.values(fields)) await expect(field).toBeVisible();
    await expectAccessible(page, "R-01");
    await pressAriaDisabled(page.getByTestId("register-submit"));
    await expect(fields.name).toHaveAttribute("aria-invalid", "true");
    await expectAccessible(page, "R-01 エラーの表示");
    // R-07（q の無いリンク）
    await page.goto("/exam?p=user");
    await fillRegistration(page);
    await page.getByTestId("register-submit").click();
    await expect(alertDialog(page)).toBeVisible();
    await expectAccessible(page, "R-07");

    // R-02
    const sessionId = await registerViaApi(page, organizationId);
    await page.goto(`/exam/${sessionId}`);
    await expectAccessible(page, "R-02");

    // R-03（Step 1 と、未回答の印のある Step 4）
    await startViaApi(page, sessionId);
    await page.goto(`/exam/${sessionId}/questions`);
    await expectStep(page, 1);
    const legends = await page.locator("fieldset.exam-question > legend").allInnerTexts();
    expect(legends).toHaveLength(41);
    for (const text of legends) expect(text).toMatch(/^\d+\. /);
    await expectAccessible(page, "R-03 Step 1");
    await saveStepsViaApi(page, sessionId, 3);
    await page.reload();
    await expectStep(page, 4);
    await answerCurrentStep(page, 4, { count: 10 });
    await page.getByTestId("submit-button").click();
    await expect(page.locator("[data-unanswered=true]").first()).toBeVisible();
    await expectAccessible(page, "R-03 Step 4 未回答の印");

    // R-05
    await answerCurrentStep(page, 4);
    await page.getByTestId("submit-button").click();
    await page.waitForURL(new RegExp(`/exam/${sessionId}/complete$`));
    await expectAccessible(page, "R-05");

    // R-06（Cookie の無いコンテキスト）
    const other = await page.context().browser()?.newContext();
    const stranger = await other?.newPage();
    if (!stranger) throw new Error("別のコンテキストを作れません");
    await stranger.goto(`/exam/${sessionId}/questions`);
    await expectAccessible(stranger, "R-06");
    await other?.close();
  });
});
