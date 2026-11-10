// 受験者側の画面の E2E の共通操作（11-1 §5.3）。受験者名は「E2E-{連番}」、電話番号は見本の値（00000000000 など）
import { expect, type Locator, type Page } from "@playwright/test";

import { EXAM_STEP_TOTAL, questionNosOfStep } from "./questions";

let seq = 0;
/** シナリオが作る受検者は名前で区別する（08 §3.4.2） */
export const e2eName = (): string => `E2E-${Date.now()}-${++seq}`;

/** 見本の電話番号（実在しない値） */
export const SAMPLE_PHONE = "00000000000";

/** 受験リンク。p を省くと p の無いリンク。prev を付けると再受験リンク（11-1 §2.2.8） */
export const linkUrl = (organizationId: string, p?: string, prev?: string): string => {
  const base = p === undefined ? `/exam?q=${organizationId}` : `/exam?q=${organizationId}&p=${p}`;
  return prev === undefined ? base : `${base}&prev=${prev}`;
};

export function sessionIdFromUrl(url: string): string {
  const match = /\/exam\/([A-Za-z0-9]+)/.exec(new URL(url).pathname);
  if (!match?.[1]) throw new Error(`sessionId を含む URL ではありません: ${url}`);
  return match[1];
}

/** API 呼び出し（/api/ 以下）を「メソッド パス」で記録する */
export function recordApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith("/api/")) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

/** PUT …/answers の本文を記録する */
export function recordAnswerBodies(
  page: Page,
): Array<{ stepNo: number; answers: Array<{ questionNo: number; choiceCode: number }> }> {
  const bodies: Array<{
    stepNo: number;
    answers: Array<{ questionNo: number; choiceCode: number }>;
  }> = [];
  page.on("request", (req) => {
    if (req.method() === "PUT" && new URL(req.url()).pathname.endsWith("/answers")) {
      bodies.push(req.postDataJSON() as (typeof bodies)[number]);
    }
  });
  return bodies;
}

/** R-01 の入力欄とプルダウン（ラベルが無いので読み上げの名前とプレースホルダーで探す） */
export const registrationFields = (page: Page) => ({
  name: page.getByRole("textbox", { name: "お名前", exact: true }),
  phoneNumber: page.getByRole("textbox", { name: "電話番号", exact: true }),
  occupation: page.getByRole("combobox", { name: "職業", exact: true }),
  experience: page.getByRole("combobox", { name: "過去の診断経験", exact: true }),
});

export interface RegistrationValues {
  readonly name?: string;
  readonly phoneNumber?: string;
  /** 職業の表示名 */
  readonly occupation?: string;
  readonly experience?: "初めて診断する" | "過去に診断したことがある";
}

/** R-01 に入力する（「診断に進む」は押さない） */
export async function fillRegistration(page: Page, values: RegistrationValues = {}): Promise<void> {
  const fields = registrationFields(page);
  await fields.name.fill(values.name ?? e2eName());
  await fields.phoneNumber.fill(values.phoneNumber ?? SAMPLE_PHONE);
  await fields.occupation.selectOption({
    label: values.occupation ?? "アイリスト（アシスタント・見習い）",
  });
  await fields.experience.selectOption({ label: values.experience ?? "初めて診断する" });
}

/** R-01 を画面から入力して「診断に進む」。/exam/{sessionId} へ移ったら sessionId を返す */
export async function registerViaUi(
  page: Page,
  organizationId: string,
  values: RegistrationValues = {},
  p: string | undefined = "user",
  prev?: string,
): Promise<string> {
  await page.goto(linkUrl(organizationId, p, prev));
  await fillRegistration(page, values);
  await page.getByTestId("register-submit").click();
  await page.waitForURL(/\/exam\/[A-Za-z0-9]+$/);
  return sessionIdFromUrl(page.url());
}

/** API で登録する（ブラウザのコンテキストに受検者の Cookie が入る） */
export async function registerViaApi(
  page: Page,
  organizationId: string,
  kind: "applicant" | "executive" = "applicant",
): Promise<string> {
  const res = await page.request.post("/api/v1/respondent/sessions", {
    data: {
      organizationId,
      kind,
      name: e2eName(),
      phoneNumber: SAMPLE_PHONE,
      occupationCode: 2,
      diagnosisExperience: "first_time",
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { sessionId: string }).sessionId;
}

export async function startViaApi(page: Page, sessionId: string): Promise<void> {
  const res = await page.request.post(`/api/v1/respondent/sessions/${sessionId}/start`);
  expect(res.status()).toBe(200);
}

/** Step 1〜lastStepNo の全設問に choice を API で保存する（ステップごとの PUT { stepNo, answers }） */
export async function saveStepsViaApi(
  page: Page,
  sessionId: string,
  lastStepNo: number,
  choice = 3,
): Promise<void> {
  for (let stepNo = 1; stepNo <= Math.min(lastStepNo, EXAM_STEP_TOTAL); stepNo += 1) {
    const res = await page.request.put(`/api/v1/respondent/sessions/${sessionId}/answers`, {
      data: {
        stepNo,
        answers: questionNosOfStep(stepNo).map((questionNo) => ({
          questionNo,
          choiceCode: choice,
        })),
      },
    });
    expect(res.status()).toBe(200);
  }
}

/** 登録・開始・Step 1〜lastStepNo の保存を API で済ませて、受験画面を開く */
export async function openQuestions(
  page: Page,
  organizationId: string,
  savedSteps = 0,
): Promise<string> {
  const sessionId = await registerViaApi(page, organizationId);
  await startViaApi(page, sessionId);
  if (savedSteps > 0) await saveStepsViaApi(page, sessionId, savedSteps);
  await page.goto(`/exam/${sessionId}/questions`);
  await expect(page.getByTestId("question-form")).toBeVisible();
  return sessionId;
}

/** 表示中のステップの設問に回答する。count を指定すると先頭から count 問だけ。skip の設問は飛ばす */
export async function answerCurrentStep(
  page: Page,
  stepNo: number,
  options: {
    readonly choice?: (questionNo: number) => number;
    readonly count?: number;
    readonly skip?: readonly number[];
  } = {},
): Promise<readonly number[]> {
  const choice = options.choice ?? (() => 3);
  const questions = questionNosOfStep(stepNo)
    .slice(0, options.count)
    .filter((q) => !(options.skip ?? []).includes(q));
  for (const q of questions) await page.getByTestId(`choice-${q}-${choice(q)}`).check();
  return questions;
}

/** 受験画面に出ているステップ */
export async function expectStep(page: Page, stepNo: number): Promise<void> {
  await expect(page.getByTestId("question-form")).toHaveAttribute("data-step-no", String(stepNo));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Step ${stepNo}`);
}

/** 受験画面の URL（ステップ番号は URL に入れない。11-1 §2.1.1） */
export const questionsUrl = (sessionId: string): RegExp =>
  new RegExp(`/exam/${sessionId}/questions$`);

export const completeUrl = (sessionId: string): RegExp =>
  new RegExp(`/exam/${sessionId}/complete$`);

/** R-07 エラーの通知（.exam-root の中に描く。11-1 §2.1.5） */
export const alertDialog = (page: Page): Locator =>
  page.getByTestId("alert-dialog").getByRole("alertdialog");

/** 描いた要素の計算されたスタイル */
export function computed(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate(
    (el, [prop, pseudoElement]) =>
      getComputedStyle(el, pseudoElement ?? null).getPropertyValue(prop ?? ""),
    [property, pseudo] as const,
  );
}

/**
 * aria-disabled のボタンを押す。押せない状態でも押せて検査する（11-1 §2.2.3）が、
 * Playwright は aria-disabled="true" を操作できないとみなして待ち続けるため、実行できるかの確かめを省いて押す
 */
export async function pressAriaDisabled(button: Locator): Promise<void> {
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await button.click({ force: true });
}
