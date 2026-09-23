// 受検者画面の E2E の共通操作（08 §3.4.3）
import { expect, type Locator, type Page } from "@playwright/test";

import { questionNosOfPage } from "./questions";

let seq = 0;
/** シナリオが作る受検者は名前で区別する（08 §3.4.2） */
export const e2eName = (): string => `E2E-${Date.now()}-${++seq}`;

export const linkUrl = (organizationId: string, p: "user" | "executives" = "user"): string =>
  `/exam?q=${organizationId}&p=${p}`;

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

export interface RegistrationValues {
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly occupationCode?: string;
  readonly experience?: "初めて診断する" | "過去に診断したことがある";
}

/** R-01 を画面から入力して「診断に進む」。/exam/{sessionId} へ遷移したら sessionId を返す */
export async function registerViaUi(
  page: Page,
  organizationId: string,
  values: RegistrationValues = {},
): Promise<string> {
  await page.goto(linkUrl(organizationId));
  await page.getByRole("textbox", { name: "お名前", exact: true }).fill(values.name ?? e2eName());
  await page
    .getByRole("textbox", { name: "電話番号", exact: true })
    .fill(values.phoneNumber ?? "090-1111-2222");
  await page
    .getByRole("combobox", { name: "職業", exact: true })
    .selectOption(values.occupationCode ?? "2");
  await page
    .getByRole("radio", { name: values.experience ?? "初めて診断する", exact: true })
    .check();
  await page.getByTestId("register-submit").click();
  await page.waitForURL(/\/exam\/[A-Za-z0-9]+$/);
  return sessionIdFromUrl(page.url());
}

/** API で登録する（ブラウザのコンテキストに tk_session が入る） */
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
      phoneNumber: "090-1111-2222",
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

/** ページ 1〜lastPageNo の全設問に choice を API で保存する */
export async function savePagesViaApi(
  page: Page,
  sessionId: string,
  lastPageNo: number,
  choice = 3,
): Promise<void> {
  for (let pageNo = 1; pageNo <= lastPageNo; pageNo += 1) {
    const res = await page.request.put(`/api/v1/respondent/sessions/${sessionId}/answers`, {
      data: {
        pageNo,
        answers: questionNosOfPage(pageNo).map((questionNo) => ({
          questionNo,
          choiceCode: choice,
        })),
      },
    });
    expect(res.status()).toBe(200);
  }
}

/** 表示中のページの設問に回答する。count を指定すると先頭から count 問だけ */
export async function answerCurrentPage(
  page: Page,
  pageNo: number,
  choice: (questionNo: number) => number = () => 3,
  count?: number,
): Promise<readonly number[]> {
  const questions = questionNosOfPage(pageNo).slice(0, count);
  for (const q of questions) await page.getByTestId(`choice-${q}-${choice(q)}`).check();
  return questions;
}

export const questionUrl = (sessionId: string, pageNo: number): RegExp =>
  new RegExp(`/exam/${sessionId}/questions/${pageNo}$`);

/**
 * aria-disabled のボタンを押す。05 §5.1.5・§5.3.6 のとおり無効表示でも押下を受け付けて未入力・未回答を示すが、
 * Playwright は aria-disabled="true" を操作不可とみなして待ち続けるため、実行可能性の確認を省いて押す
 */
export async function pressAriaDisabled(button: Locator): Promise<void> {
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await button.click({ force: true });
}
