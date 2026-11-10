// M7-exam-40 受験の流れ、M7-exam-41 幹部用の見出しと p、M7-exam-45 ログインのリンク、M7-exam-49 再受験リンク（11-1 §5.3）
import { expect, test } from "../support/fixtures";

import { emulatorTask } from "../support/admin";
import { INACTIVE_QUESTION_TEXTS, questionNosOfStep } from "../support/questions";
import {
  answerCurrentStep,
  completeUrl,
  computed,
  e2eName,
  expectStep,
  fillRegistration,
  linkUrl,
  questionsUrl,
  recordApiCalls,
  registerViaApi,
  registerViaUi,
  saveStepsViaApi,
  SAMPLE_PHONE,
  sessionIdFromUrl,
  startViaApi,
} from "../support/respondent";

test("M7-exam-40 受験の流れ（求職者）: 登録 → 開始 → 4 ステップ → 送信 → 完了", async ({
  page,
  organizationId,
}) => {
  const name = e2eName();
  const calls = recordApiCalls(page);

  // R-01: 見出し「受験者登録」、プレースホルダー 4 つ、ラベルが無い
  await page.goto(linkUrl(organizationId, "user"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録");
  await expect(page.getByPlaceholder("お名前を入力")).toBeVisible();
  await expect(page.getByPlaceholder("電話番号を入力")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "職業" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "職業" }).locator("option").first()).toHaveText(
    "職業を選択",
  );
  await expect(
    page.getByRole("combobox", { name: "過去の診断経験" }).locator("option").first(),
  ).toHaveText("選択してください。");
  await expect(page.locator("main label")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("*");
  await fillRegistration(page, { name });
  await page.getByTestId("register-submit").click();
  await page.waitForURL(/\/exam\/[A-Za-z0-9]+$/);
  const sessionId = new URL(page.url()).pathname.split("/")[2] ?? "";
  expect(calls).toEqual(["POST /api/v1/respondent/sessions"]);
  // URL に sessionId 以外の識別子を含めない
  expect(new URL(page.url()).search).toBe("");

  // R-02: 「診断を開始する」（アプリが足していた補足の箇条書きが無い）
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("診断を開始する");
  await expect(
    page.getByText("下記のボタンをクリックして、診断を開始してください。"),
  ).toBeVisible();
  await expect(page.locator("main li")).toHaveCount(0);
  await page.getByTestId("start-button").click();
  await page.waitForURL(questionsUrl(sessionId));
  expect(calls.at(-1)).toBe(`POST /api/v1/respondent/sessions/${sessionId}/start`);

  for (const stepNo of [1, 2, 3, 4]) {
    await expectStep(page, stepNo);
    const expected = questionNosOfStep(stepNo).length;
    expect(expected).toBe(stepNo === 4 ? 21 : 41);
    await expect(page.locator("fieldset.exam-question")).toHaveCount(expected);
    await expect(page.locator("fieldset.exam-question input[type=radio]")).toHaveCount(
      expected * 5,
    );
    // 「戻る」と確認ダイアログが無い。URL は /questions のまま
    await expect(page.getByRole("button", { name: "戻る" })).toHaveCount(0);
    await expect(page).toHaveURL(questionsUrl(sessionId));
    const body = await page.locator("body").innerText();
    // 出題しない Q145〜Q204 の設問文が一度も出ない（決定事項 3）
    for (const text of INACTIVE_QUESTION_TEXTS) expect(body).not.toContain(text);

    await answerCurrentStep(page, stepNo, { choice: (q) => ((q - 1) % 5) + 1 });
    if (stepNo < 4) {
      await expect(page.getByTestId("submit-button")).toHaveCount(0);
      await page.getByTestId("next-button").click();
      continue;
    }
    // Step 4: 「次へ」が無く「送信する」がカードの中
    await expect(page.getByTestId("next-button")).toHaveCount(0);
    await expect(page.getByTestId("step-card").getByTestId("submit-button")).toHaveText("送信する");
  }

  // 「送信する」で確認なしにロード中（描いた要素の計算された色がトークンの値。11-1 §2.1.3・§2.1.6）
  const clickedAt = Date.now();
  await page.getByTestId("submit-button").click();
  const overlay = page.getByTestId("loading-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("status")).toHaveText("ロード中");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await computed(overlay, "background-color")).toBe("rgba(255, 255, 255, 0.5)");
  expect(await computed(overlay.locator(".exam-loading__text"), "color")).toBe("rgb(56, 125, 147)");
  expect(await computed(overlay.locator(".exam-loading__icon"), "color")).toBe("rgb(63, 141, 165)");
  await page.waitForURL(completeUrl(sessionId));
  // 送信の応答のあと 2,000 ミリ秒待ってから完了画面へ
  expect(Date.now() - clickedAt).toBeGreaterThanOrEqual(2000);
  expect(calls.filter((c) => c.endsWith("/submit"))).toHaveLength(1);

  // R-05: 「回答完了」と本文。氏名・電話番号・点数が無い
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("回答完了");
  const main = await page.locator("main").innerText();
  expect(main).toContain("お疲れ様でした");
  expect(main).toContain("回答の送信が完了しました。");
  expect(main).not.toContain(name);
  expect(main).not.toContain(SAMPLE_PHONE);
  expect(main).not.toMatch(/\d{4}[-/年]\d{1,2}/); // 日付
  expect(main).not.toMatch(/タイプ|スコア|偏差|適性|点/);
  const result = emulatorTask<{ respondentKind: string; employmentStatus: string }>(
    "result-of-session",
    sessionId,
  );
  expect(result).toMatchObject({ respondentKind: "applicant", employmentStatus: "candidate" });
});

test("M7-exam-41 p=executives は「受験者登録(幹部用)」。p 無し・ほかの値は「受験者登録」で、結果は求職者", async ({
  page,
  organizationId,
}) => {
  await page.goto(linkUrl(organizationId, "executives"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録(幹部用)");
  await page.goto(linkUrl(organizationId, "x"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録");

  // p 無しで登録して送信すると、求職者の結果（オーナー以外の回答一覧に出る受検者区分）
  const sessionId = await registerViaUi(page, organizationId, {}, undefined);
  const respondent = emulatorTask<{ kind: string }>("respondent-of-session", sessionId);
  expect(respondent.kind).toBe("applicant");
  await page.getByTestId("start-button").click();
  await page.waitForURL(questionsUrl(sessionId));
  await saveStepsViaApi(page, sessionId, 4);
  const submitted = await page.request.post(`/api/v1/respondent/sessions/${sessionId}/submit`);
  expect(submitted.status()).toBe(200);
  expect(
    emulatorTask<{ respondentKind: string; employmentStatus: string; usageLogCount: number }>(
      "result-of-session",
      sessionId,
    ),
  ).toMatchObject({ respondentKind: "applicant", employmentStatus: "candidate", usageLogCount: 1 });
});

test("M7-exam-45 「すでに受験された方・ログインはこちら」で /admin/login へ。/ でも R-01 が出る", async ({
  page,
  organizationId,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録");
  await expect(page.getByTestId("registration-form")).toBeVisible();

  await page.goto(linkUrl(organizationId, "user"));
  const link = page.getByTestId("login-link");
  await expect(link).toHaveText("すでに受験された方・ログインはこちら");
  await expect(link).toHaveAttribute("href", "/admin/login");
  await link.click();
  await page.waitForURL((url) => url.pathname === "/admin/login");
});

test("M7-exam-49 再受験リンク（prev）で受けると前回の結果がつながり、同じリンクの 2 人目はつながらない", async ({
  page,
  organizationId,
}) => {
  type ResultOfSession = {
    resultId: string;
    previousResultId: string | null;
    respondentKind: string;
    employmentStatus: string;
  };
  /** 受験画面の「開始する」から先を API で済ませて送信する（つながりは送信のときに決まる。11-1 §2.7.3） */
  const startAndSubmit = async (sessionId: string) => {
    await page.getByTestId("start-button").click();
    await page.waitForURL(questionsUrl(sessionId));
    await saveStepsViaApi(page, sessionId, 4);
    const submitted = await page.request.post(`/api/v1/respondent/sessions/${sessionId}/submit`);
    expect(submitted.status()).toBe(200);
    return emulatorTask<ResultOfSession>("result-of-session", sessionId);
  };

  // 前回の受験 P（同じ組織の送信済みの求職者の受験）
  const previousSessionId = await registerViaApi(page, organizationId);
  await startViaApi(page, previousSessionId);
  await saveStepsViaApi(page, previousSessionId, 4);
  expect(
    (await page.request.post(`/api/v1/respondent/sessions/${previousSessionId}/submit`)).status(),
  ).toBe(200);
  const previous = emulatorTask<ResultOfSession>("result-of-session", previousSessionId);
  expect(previous.previousResultId).toBeNull();

  // 再受験リンク: 見た目は既存スタッフ用リンクと同じ。prev は画面に出さない
  const registrations: Array<Record<string, unknown>> = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/v1/respondent/sessions") {
      registrations.push(req.postDataJSON() as Record<string, unknown>);
    }
  });
  await page.goto(linkUrl(organizationId, "executives", previous.resultId));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("受験者登録(幹部用)");
  expect(await page.locator("body").innerText()).not.toContain(previous.resultId);
  await expect(page.locator(`[value="${previous.resultId}"]`)).toHaveCount(0);
  await fillRegistration(page);
  await page.getByTestId("register-submit").click();
  await page.waitForURL(/\/exam\/[A-Za-z0-9]+$/);
  const sessionId = sessionIdFromUrl(page.url());
  // 登録の本文に前回の結果の ID を付ける（prev が文書 ID の形のときだけ。11-1 §2.2.6 の手順 4）
  expect(registrations).toEqual([
    expect.objectContaining({ kind: "executive", previousResultId: previous.resultId }),
  ]);
  const linked = await startAndSubmit(sessionId);
  expect(linked).toMatchObject({
    previousResultId: previous.resultId,
    respondentKind: "executive",
    employmentStatus: "employed",
  });

  // 同じ再受験リンクでもう 1 人受けると、P はすでにほかの結果の前回なのでつながらない（通常の既存スタッフの受験。K-31 ①）
  const secondSessionId = await registerViaUi(
    page,
    organizationId,
    {},
    "executives",
    previous.resultId,
  );
  expect(registrations).toHaveLength(2);
  expect(registrations[1]).toMatchObject({ previousResultId: previous.resultId });
  const second = await startAndSubmit(secondSessionId);
  expect(second).toMatchObject({
    previousResultId: null,
    respondentKind: "executive",
    employmentStatus: "employed",
  });
});
