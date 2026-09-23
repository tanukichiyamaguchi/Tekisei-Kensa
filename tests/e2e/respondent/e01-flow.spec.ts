// E-01 受検リンク → 登録 → 開始 → 20 ページ回答 → 送信確認 → 完了（05/T-02、T-07、T-11、T-18、決定事項 3）
import { expect, test } from "../support/fixtures";

import { INACTIVE_QUESTION_TEXTS, questionNosOfPage } from "../support/questions";
import {
  answerCurrentPage,
  e2eName,
  questionUrl,
  recordApiCalls,
  registerViaUi,
} from "../support/respondent";

test("E-01 受検リンクから 144 問に回答して送信し、完了画面に結果・個人情報を出さない", async ({
  page,
  organizationId,
}) => {
  const name = e2eName();
  const phoneNumber = "090-3333-4444";
  const calls = recordApiCalls(page);

  const sessionId = await registerViaUi(page, organizationId, { name, phoneNumber });
  expect(calls).toEqual(["POST /api/v1/respondent/sessions"]);
  // URL に sessionId 以外の識別子を含めない
  expect(new URL(page.url()).pathname).toBe(`/exam/${sessionId}`);
  expect(new URL(page.url()).search).toBe("");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("診断を開始する");
  await page.getByTestId("start-button").click();
  await page.waitForURL(questionUrl(sessionId, 1));
  expect(calls.at(-1)).toBe(`POST /api/v1/respondent/sessions/${sessionId}/start`);

  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    await expect(page.getByTestId("question-page")).toHaveAttribute("data-page-no", String(pageNo));
    const expected = questionNosOfPage(pageNo).length;
    // 05/T-02: fieldset が 7 または 8 個、ラジオが 35 または 40 個
    await expect(page.locator("fieldset.exam-question")).toHaveCount(expected);
    await expect(page.locator("fieldset.exam-question input[type=radio]")).toHaveCount(
      expected * 5,
    );
    const body = await page.locator("body").innerText();
    // 出題しない Q145〜Q204 の設問文が一度も現れない（決定事項 3）
    for (const text of INACTIVE_QUESTION_TEXTS) expect(body).not.toContain(text);

    await answerCurrentPage(page, pageNo, (q) => ((q - 1) % 5) + 1);
    const before = calls.length;
    if (pageNo < 20) {
      await page.getByTestId("next-button").click();
      await page.waitForURL(questionUrl(sessionId, pageNo + 1));
      // 05/T-07: 「次へ」で呼ぶ API は PUT answers の 1 本だけ
      expect(calls.slice(before)).toEqual([`PUT /api/v1/respondent/sessions/${sessionId}/answers`]);
    } else {
      await page.getByTestId("submit-button").click();
      await expect(page.getByTestId("submit-dialog")).toBeVisible();
      expect(calls.length).toBe(before); // ダイアログを開くだけでは通信しない
      await page.getByTestId("submit-confirm").click();
      await page.waitForURL(new RegExp(`/exam/${sessionId}/complete$`));
      expect(calls.slice(before)).toEqual([
        `PUT /api/v1/respondent/sessions/${sessionId}/answers`,
        `POST /api/v1/respondent/sessions/${sessionId}/submit`,
      ]);
    }
  }

  // 05/T-18: 完了画面は C-01・C-02 のみ。氏名・電話番号・日時・スコアを含まない
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答が完了しました");
  const main = await page.locator("main").innerText();
  expect(main).toContain("ご回答ありがとうございました。");
  expect(main).not.toContain(name);
  expect(main).not.toContain("3333");
  expect(main).not.toMatch(/\d{4}[-/年]\d{1,2}/); // 日付
  expect(main).not.toMatch(/タイプ|スコア|偏差|適性/);
});
