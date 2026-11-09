// M7-exam-46 未回答、M7-exam-47 自動保存と再開・旧ページの URL・旧キーの下書きの取り込み（11-1 §5.3、総論 5.4 の完了条件）
import { expect, test } from "../support/fixtures";

import { questionNosOfStep } from "../support/questions";
import {
  answerCurrentStep,
  computed,
  expectStep,
  linkUrl,
  openQuestions,
  questionsUrl,
  recordAnswerBodies,
  recordApiCalls,
  registerViaApi,
  startViaApi,
} from "../support/respondent";

test.describe("M7-exam-46 未回答", () => {
  test("Step 1 で Q10 だけ未回答のまま「次へ」を押すと進まず、Q10 に印を付けて最初の選択肢へ。回答すると消え、「次へ」で Step 2", async ({
    page,
    organizationId,
  }) => {
    await openQuestions(page, organizationId);
    await expectStep(page, 1);
    await answerCurrentStep(page, 1, { skip: [10] });
    const calls = recordApiCalls(page);
    await page.getByTestId("next-button").click();

    await expectStep(page, 1);
    const q10 = page.getByTestId("question-10");
    await expect(q10).toHaveAttribute("data-unanswered", "true");
    await expect(q10.locator("legend")).toHaveText(/^10\. /);
    expect(await computed(q10.locator("legend"), "color")).toBe("rgb(221, 13, 13)");
    await expect(q10.getByText("回答してください")).toBeVisible();
    expect(await computed(q10.getByText("回答してください"), "color")).toBe("rgb(221, 13, 13)");
    await expect(page.getByTestId("choice-10-1")).toBeFocused();
    await expect(page.getByTestId("choice-10-1")).toHaveAttribute("aria-describedby", "q10-error");
    await expect(q10).toBeInViewport();
    await expect(page.locator("[data-unanswered=true]")).toHaveCount(1);
    expect(calls.filter((c) => !c.endsWith("/answers"))).toEqual([]);

    // 回答した時点で印が消える。「次へ」で Step 2
    await page.getByTestId("choice-10-2").check();
    await expect(q10).not.toHaveAttribute("data-unanswered", "true");
    await expect(q10.getByText("回答してください")).toHaveCount(0);
    await page.getByTestId("next-button").click();
    await expectStep(page, 2);
    // 次のステップの見出しにフォーカスを移す
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  });

  test("Step 4 の「送信する」でも、未回答があれば送信せずに印を付ける", async ({
    page,
    organizationId,
  }) => {
    await openQuestions(page, organizationId, 3);
    await expectStep(page, 4);
    const last = questionNosOfStep(4).at(-1) ?? 144;
    await answerCurrentStep(page, 4, { skip: [last] });
    const calls = recordApiCalls(page);
    await page.getByTestId("submit-button").click();
    await expectStep(page, 4);
    await expect(page.getByTestId(`question-${last}`)).toHaveAttribute("data-unanswered", "true");
    await expect(page.getByTestId(`choice-${last}-1`)).toBeFocused();
    await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
    expect(calls.filter((c) => c.endsWith("/submit"))).toEqual([]);
  });
});

test.describe("M7-exam-47 自動保存と再開", () => {
  test("選ぶたびに保存し、再読み込みしても選んだまま。Step 2 で開き直すと Step 2。ブラウザの戻るで Step 1 が出ない。「次へ」で採点の API を呼ばない", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    // 履歴に受験者登録の画面を積んでから受験画面を開く（戻るの確かめのため）
    await page.goto(linkUrl(organizationId, "user"));
    await page.goto(`/exam/${sessionId}/questions`);
    await expectStep(page, 1);

    const bodies = recordAnswerBodies(page);
    const chosen = questionNosOfStep(1).slice(0, 10);
    for (const q of chosen) {
      // 選ぶたびに PUT …/answers（その設問を含む 1 本）
      const saved = page.waitForResponse(
        (res) => res.request().method() === "PUT" && res.url().endsWith("/answers"),
      );
      await page.getByTestId(`choice-${q}-4`).check();
      expect((await saved).status()).toBe(200);
    }
    expect(bodies).toHaveLength(10);
    for (const [i, body] of bodies.entries()) {
      expect(body).toEqual({ stepNo: 1, answers: [{ questionNo: chosen[i], choiceCode: 4 }] });
    }

    await page.reload();
    await expectStep(page, 1);
    for (const q of chosen) await expect(page.getByTestId(`choice-${q}-4`)).toBeChecked();

    await answerCurrentStep(page, 1, { count: 41, skip: chosen });
    const calls = recordApiCalls(page);
    await page.getByTestId("next-button").click();
    await expectStep(page, 2);
    expect(calls.filter((c) => !c.endsWith("/answers"))).toEqual([]);

    // Step 2 で開き直すと Step 2（Step 1 に戻らない）
    await page.reload();
    await expectStep(page, 2);
    // ブラウザの戻るは受験画面の前の画面（受験者登録）。Step 1 は出ない
    await page.goBack();
    await expect(page.getByTestId("registration-form")).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(questionsUrl(sessionId));
    await expectStep(page, 2);
  });

  test("旧ページの URL は受験画面へリダイレクトし、旧キーの下書き（保存前の選択）を取り込んで保存してから旧キーを消す", async ({
    page,
    organizationId,
  }) => {
    const sessionId = await registerViaApi(page, organizationId);
    await startViaApi(page, sessionId);
    for (const legacy of ["1", "3", "20", "3/4"]) {
      await page.goto(`/exam/${sessionId}/questions/${legacy}`);
      await expect(page).toHaveURL(questionsUrl(sessionId));
      await expectStep(page, 1);
    }

    // M7 より前の画面の退避（tk_exam_draft:{sessionId}:{pageNo}）と「戻る」用のキー、ほかのセッションの旧キー
    await page.goto(linkUrl(organizationId, "user"));
    await page.evaluate((id) => {
      sessionStorage.setItem(`tk_exam_draft:${id}:1`, JSON.stringify({ 5: 2, 6: 4, 145: 1 }));
      sessionStorage.setItem(`tk_exam_draft:${id}:7`, JSON.stringify({ 50: 5, 51: 6 }));
      sessionStorage.setItem(`tk_exam_flash:${id}`, "1");
      sessionStorage.setItem("tk_exam_draft:OtherSession0000001:1", JSON.stringify({ 1: 1 }));
    }, sessionId);

    const bodies = recordAnswerBodies(page);
    await page.goto(`/exam/${sessionId}/questions/3`);
    await expect(page).toHaveURL(questionsUrl(sessionId));
    await expectStep(page, 1);
    await expect(page.getByTestId("choice-5-2")).toBeChecked();
    await expect(page.getByTestId("choice-6-4")).toBeChecked();
    // 取り込んだ選択はステップごとに保存する（設問番号 145 や値 6 は捨てる）
    await expect
      .poll(() => bodies.map((b) => JSON.stringify(b)).sort())
      .toEqual(
        [
          {
            stepNo: 1,
            answers: [
              { questionNo: 5, choiceCode: 2 },
              { questionNo: 6, choiceCode: 4 },
            ],
          },
          { stepNo: 2, answers: [{ questionNo: 50, choiceCode: 5 }] },
        ]
          .map((b) => JSON.stringify(b))
          .sort(),
      );
    // 旧キーと「戻る」用のキーは消え、ほかのセッションの旧キーは残る。保存が済んだ退避も消える
    await expect
      .poll(() => page.evaluate(() => Object.keys(sessionStorage).sort()))
      .toEqual(["tk_exam_draft:OtherSession0000001:1"]);
    await page.reload();
    await expect(page.getByTestId("choice-50-5")).toHaveCount(0); // Step 2 の設問は出ない（Step 1 のまま）
    await expect(page.getByTestId("choice-5-2")).toBeChecked();
  });
});
