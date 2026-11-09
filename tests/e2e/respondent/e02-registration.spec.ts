// M7-exam-42 無効なリンクと R-07 の通知、M7-exam-43 「amp;」、M7-exam-44 登録の入力チェック（11-1 §5.3）
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";

import { emulatorTask } from "../support/admin";
import {
  alertDialog,
  computed,
  e2eName,
  fillRegistration,
  linkUrl,
  pressAriaDisabled,
  recordApiCalls,
  registrationFields,
  sessionIdFromUrl,
} from "../support/respondent";

/** R-07 の通知が出ていて、見出しと 2 行の本文が 11-1 §2.8 の文言 */
async function expectInvalidLinkAlert(page: Page): Promise<void> {
  const alert = alertDialog(page);
  await expect(alert).toBeVisible();
  await expect(alert.locator(".swal-title")).toHaveText("エラー");
  await expect(alert.locator(".swal-content")).toHaveText(
    "リンクが正しくありません。\n再度ご確認の上、リンクにアクセスしてください。",
  );
  // 改行で折り返す（11-1 §1.4 の 15）
  expect(await alert.locator(".swal-content").innerText()).toBe(
    "リンクが正しくありません。\n再度ご確認の上、リンクにアクセスしてください。",
  );
}

test.describe("M7-exam-42 無効なリンク", () => {
  test("q が無い・存在しない組織でもフォームを出し、「診断に進む」で「エラー」の通知を出して約 2 秒で消す（画面は移らない）", async ({
    page,
  }) => {
    for (const url of ["/exam?p=user", "/exam?q=NoSuchOrganization00&p=user", "/exam?q=bad-id!"]) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(200);
      await expect(page.getByTestId("registration-form"), url).toBeVisible();
    }

    // 形の違う q は API を呼ばずに通知する（11-1 §2.2.6 手順 2）
    const calls = recordApiCalls(page);
    await fillRegistration(page);
    await page.getByTestId("register-submit").click();
    await expectInvalidLinkAlert(page);
    expect(calls).toEqual([]);
    await expect(alertDialog(page)).toBeHidden({ timeout: 3_000 });

    // 存在しない組織は登録の API が 404 で、同じ通知（画面はそのまま）
    await page.goto("/exam?q=NoSuchOrganization00&p=user");
    await fillRegistration(page);
    const shownAt = Date.now();
    await page.getByTestId("register-submit").click();
    await expectInvalidLinkAlert(page);
    await expect(alertDialog(page)).toBeHidden({ timeout: 3_000 });
    const elapsed = Date.now() - shownAt;
    expect(elapsed).toBeGreaterThanOrEqual(2_000);
    expect(elapsed).toBeLessThan(3_500);
    await expect(page).toHaveURL(/\/exam\?q=NoSuchOrganization00&p=user$/);
    await expect(registrationFields(page).phoneNumber).toHaveValue("00000000000");
  });

  test("通知の色がトークンの値（描いた要素の計算された色）。キーボードで出すと箱に焦点が移り輪郭を描かない。Esc で閉じ、背景では閉じない", async ({
    page,
  }) => {
    await page.goto("/exam?p=user");
    await fillRegistration(page);
    const submit = page.getByTestId("register-submit");
    await submit.focus();
    await page.keyboard.press("Enter");
    const alert = alertDialog(page);
    await expect(alert).toBeVisible();

    // 色（11-1 §2.1.5）。通知の描く先にもトークンが効く
    expect(await computed(alert, "background-color", "::backdrop")).toBe("rgba(0, 0, 0, 0.4)");
    const box = alert.locator(".swal-modal");
    expect(await computed(box, "background-color")).toBe("rgb(255, 255, 255)");
    expect(await computed(alert.locator(".swal-title"), "color")).toBe("rgb(89, 89, 89)");
    expect(await computed(alert.locator(".swal-content"), "color")).toBe("rgb(84, 84, 84)");
    expect(await alert.evaluate((el) => el.closest(".exam-root") !== null)).toBe(true);

    // 箱に焦点が移り、輪郭を描かない
    await expect(box).toBeFocused();
    expect(await computed(box, "outline-style")).toBe("none");

    // 背景を押しても閉じない
    await page.mouse.click(5, 5);
    await expect(alert).toBeVisible();
    // Esc で閉じ、焦点は「診断に進む」へ戻る
    await page.keyboard.press("Escape");
    await expect(alert).toBeHidden();
    await expect(submit).toBeFocused();
  });
});

test("M7-exam-43 「amp;」を含む URL は取り除いた URL へリダイレクトする", async ({
  page,
  organizationId,
}) => {
  await page.goto(`/exam?q=${organizationId}&amp;p=executives`);
  await expect(page).toHaveURL(new RegExp(`/exam\\?q=${organizationId}&p=executives$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録(幹部用)");
});

test.describe("M7-exam-44 登録の入力チェック", () => {
  test("未入力で押すと API を呼ばず、未入力の項目を赤枠にして最初の項目へ。入力すると赤枠が消える", async ({
    page,
    organizationId,
  }) => {
    const calls = recordApiCalls(page);
    await page.goto(linkUrl(organizationId, "user"));
    const fields = registrationFields(page);
    await pressAriaDisabled(page.getByTestId("register-submit"));

    await expect(fields.name).toBeFocused();
    for (const field of Object.values(fields)) {
      await expect(field).toHaveAttribute("aria-invalid", "true");
    }
    // 入力欄の不正の枠 rgba(221, 13, 13, 0.7)（フォーカスの無い欄）、プルダウンは #FF0000（11-1 §2.2.3）
    expect(await computed(fields.phoneNumber, "border-top-color")).toBe("rgba(221, 13, 13, 0.7)");
    expect(await computed(fields.occupation, "border-top-color")).toBe("rgb(255, 0, 0)");
    expect(await computed(fields.experience, "border-top-color")).toBe("rgb(255, 0, 0)");
    // 見えないエラー文言を aria-describedby で結び、V-00 を読み上げる
    await expect(fields.name).toHaveAttribute("aria-describedby", "reg-name-error");
    await expect(page.getByTestId("error-name")).toHaveText("お名前を入力してください");
    await expect(page.getByTestId("error-phoneNumber")).toHaveText("電話番号を入力してください");
    await expect(page.getByTestId("error-occupationCode")).toHaveText("職業を選択してください");
    await expect(page.getByTestId("error-diagnosisExperience")).toHaveText(
      "過去の診断経験を選択してください",
    );
    await expect(page.getByTestId("registration-announcement")).toHaveText(
      "未入力の項目があります",
    );
    expect(calls).toEqual([]);

    // 入力すると赤枠が消える
    await fields.phoneNumber.fill("00000000000");
    await expect(fields.phoneNumber).not.toHaveAttribute("aria-invalid", "true");
    await fields.occupation.selectOption({ label: "責任者" });
    await expect(fields.occupation).not.toHaveAttribute("aria-invalid", "true");
    expect(await computed(fields.occupation, "border-top-color")).not.toBe("rgb(255, 0, 0)");
  });

  test("上限を超えたお名前は送らずに R-07（V-02）。全角の電話番号でも、前後の空白を除いてそのまま登録できる", async ({
    page,
    organizationId,
  }) => {
    const calls = recordApiCalls(page);
    await page.goto(linkUrl(organizationId, "executives"));
    await fillRegistration(page, { name: "あ".repeat(101) });
    await page.getByTestId("register-submit").click();
    await expect(alertDialog(page).locator(".swal-content")).toHaveText(
      "お名前は 100 文字以内で入力してください",
    );
    await expect(registrationFields(page).name).toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
    await expect(alertDialog(page)).toBeHidden({ timeout: 3_000 });

    const name = e2eName();
    const fields = registrationFields(page);
    await fields.name.fill(`\u3000${name}\u3000`); // 前後に全角の空白
    await fields.phoneNumber.fill(" ０９０－１２３４－５６７８ ");
    await fields.occupation.selectOption({ label: "受付" });
    await fields.experience.selectOption({ label: "過去に診断したことがある" });
    await expect(page.getByTestId("register-submit")).not.toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("register-submit").click();
    await page.waitForURL(/\/exam\/[A-Za-z0-9]+$/);
    const respondent = emulatorTask<{
      name: string;
      phoneNumber: string;
      occupationCode: number;
      kind: string;
    }>("respondent-of-session", sessionIdFromUrl(page.url()));
    expect(respondent).toEqual({
      name,
      phoneNumber: "０９０－１２３４－５６７８",
      occupationCode: 6,
      kind: "executive",
    });
  });
});
