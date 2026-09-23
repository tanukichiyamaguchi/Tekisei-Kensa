// E-02 登録の入力チェック（05/T-03〜T-05、05 §5.1.4〜§5.1.6）
import { expect, test } from "@playwright/test";

import { emulatorTask } from "../support/admin";
import {
  e2eName,
  linkUrl,
  pressAriaDisabled,
  recordApiCalls,
  sessionIdFromUrl,
} from "../support/respondent";
import { readState } from "../support/state";

test.describe("E-02 受検者登録の入力チェック", () => {
  test("05/T-03: 未入力で押すと送信せずに全項目を赤枠と V-xx、最初の項目へフォーカス、V-00", async ({
    page,
  }) => {
    const { organizationId } = readState();
    const calls = recordApiCalls(page);
    await page.goto(linkUrl(organizationId));
    await pressAriaDisabled(page.getByTestId("register-submit"));

    const name = page.getByRole("textbox", { name: "お名前", exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("error-name")).toHaveText("お名前を入力してください");
    await expect(page.getByTestId("error-phoneNumber")).toHaveText("電話番号を入力してください");
    await expect(page.getByTestId("error-occupationCode")).toHaveText("職業を選択してください");
    await expect(page.getByTestId("error-diagnosisExperience")).toHaveText(
      "過去の診断経験を選択してください",
    );
    await expect(page.getByText("未入力の項目があります")).toBeVisible();
    // エラー文言は aria-describedby で入力と結びつく（05 §8）
    await expect(name).toHaveAttribute("aria-describedby", "reg-name-error");
    expect(calls).toEqual([]);
  });

  test("blur で項目ごとに検証し、正しい値になった時点で赤枠を消す", async ({ page }) => {
    const { organizationId } = readState();
    await page.goto(linkUrl(organizationId));
    const phone = page.getByRole("textbox", { name: "電話番号", exact: true });
    await phone.fill("12345");
    await phone.blur();
    await expect(page.getByTestId("error-phoneNumber")).toContainText(
      "電話番号の形式が正しくありません",
    );
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await phone.fill("03(1234)5678");
    await expect(page.getByTestId("error-phoneNumber")).toHaveCount(0);
    await expect(phone).not.toHaveAttribute("aria-invalid", "true");
  });

  test("05/T-04: 全角の電話番号・前後の空白は正規化して登録され、区分は p から決まる", async ({
    page,
  }) => {
    const { organizationId } = readState();
    const name = e2eName();
    await page.goto(linkUrl(organizationId, "executives"));
    await page.getByRole("textbox", { name: "お名前", exact: true }).fill(`\u3000${name}\u3000`);
    await page
      .getByRole("textbox", { name: "電話番号", exact: true })
      .fill("０９０－１２３４－５６７８");
    await page.getByRole("combobox", { name: "職業", exact: true }).selectOption({ label: "TC" });
    await page.getByRole("radio", { name: "過去に診断したことがある", exact: true }).check();
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
      phoneNumber: "090-1234-5678",
      occupationCode: 6,
      kind: "executive",
    });
  });

  test("05/T-05: q・p の不正、存在しない組織は 404 と固定文言（理由を区別しない）", async ({
    page,
  }) => {
    const { organizationId } = readState();
    for (const url of [
      `/exam?q=${organizationId}&p=admin`,
      `/exam?q=${organizationId}`,
      "/exam?p=user",
      "/exam?q=bad-id!&p=user",
      "/exam?q=NoSuchOrganization00&p=user",
    ]) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "この受検リンクは利用できません",
      );
      await expect(page.getByTestId("registration-form")).toHaveCount(0);
    }
  });

  test("登録の直前に組織が使えなくなった場合（404）は E-05 を表示する", async ({ page }) => {
    const { organizationId } = readState();
    await page.route("**/api/v1/respondent/sessions", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "ORGANIZATION_NOT_FOUND", message: "x", details: {} },
        }),
      }),
    );
    await page.goto(linkUrl(organizationId));
    await page.getByRole("textbox", { name: "お名前", exact: true }).fill(e2eName());
    await page.getByRole("textbox", { name: "電話番号", exact: true }).fill("09011112222");
    await page.getByRole("combobox", { name: "職業", exact: true }).selectOption("1");
    await page.getByRole("radio", { name: "初めて診断する", exact: true }).check();
    await page.getByTestId("register-submit").click();
    await expect(page.getByTestId("error-banner")).toHaveAttribute("data-text-id", "E-05");
    await expect(page).toHaveURL(new RegExp(`/exam\\?q=${organizationId}`));
  });
});
