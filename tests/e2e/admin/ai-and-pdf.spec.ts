// E-20 AI 解説（stub）（08 §3.4.3、06 §3.5.9、要件定義書 §6.2 A-09、付録D §1）
// E-21 PDF ダウンロード（06 §3.5.11、07 §9、要件定義書 §6.2 A-10）
import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

import { emulatorTask } from "../support/admin";
import { expect, loginViaUi, test } from "../support/admin-ui";

const AI_BLOCK_HEADINGS = [
  "この人物の要約",
  "総合判定／即戦力性／離職リスク",
  "このサロンで活きる強み",
  "採用前に見極めたい注意点",
  "面接で深掘りすべき質問",
  "長く働いてもらうための接し方・育て方",
  "辞めそうなサイン＆引き止めの一手",
];
const DISCLAIMER =
  "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は責任者が内容をご確認のうえご活用ください。";

test("E-20 AI解説を表示 → 生成中 → 7 ブロック → 非表示 → 再表示で再生成しない、免責表示", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = emulatorTask<{ resultId: string }>(
    "submit-type",
    adminOrg.organizationId,
    "conductor",
  );
  await loginViaUi(page, adminOrg.ownerEmail);
  await page.goto(`/admin/results/${resultId}`);

  const section = page.getByTestId("ai-analysis-section");
  await expect(section).toHaveAttribute("data-status", "not_generated");
  await expect(section).toContainText(DISCLAIMER);

  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith(`/results/${resultId}/ai-analysis`)) {
      posts.push(req.url());
    }
  });

  // ヘッダーのボタンから生成（セクション 7 へスクロールし、生成中表示）
  await page.locator(".result-header").getByRole("button", { name: "AI解説を表示" }).click();
  await expect(section.getByRole("status")).toContainText(
    "AI解説を生成しています。1〜2 分かかることがあります。",
  );
  await expect(section).toBeInViewport();

  const body = page.getByTestId("ai-analysis-body");
  await expect(body).toBeVisible({ timeout: 30_000 });
  await expect(section).toHaveAttribute("data-status", "completed");
  await expect(body.locator("h3")).toHaveText(AI_BLOCK_HEADINGS);
  await expect(body.locator("h4")).toHaveText(["関わり方", "任せ方", "認め方", "伸ばし方"]);
  await expect(body).toContainText("総合判定: 要検討");
  await expect(body).toContainText(/生成日時 \d{4}\/\d{2}\/\d{2}/);
  await expect(body).toContainText(DISCLAIMER);
  expect(posts).toHaveLength(1);

  // 非表示 → 再表示（保存済みを表示するだけで POST しない）
  await section.getByRole("button", { name: "AI解説を非表示" }).click();
  await expect(body).toBeHidden();
  await section.getByRole("button", { name: "AI解説を表示" }).click();
  await expect(body).toBeVisible();
  expect(posts).toHaveLength(1);

  // 再読み込みしても保存済みを表示し、再生成しない
  await page.reload();
  await expect(page.getByTestId("ai-analysis-section")).toHaveAttribute("data-status", "completed");
  await expect(page.getByTestId("ai-analysis-body")).toBeVisible();
  expect(posts).toHaveLength(1);
});

const RISK_LABELS = [
  "不祥事",
  "苦情",
  "メンタル面の不服",
  "不注意ミス",
  "退職時トラブル",
  "コミュニケーション起因の業務支障",
  "モチベーション不足による就業辞退",
];

/**
 * PDF のテキスト。Chromium が埋め込む Noto Sans JP の ToUnicode は一部の漢字を康熙部首（例: 立 → ⽴）に写すため
 * NFKC で正規化し、中黒（・ → ‧ U+2027）を戻し、行の折り返しに左右されないよう空白をすべて除く
 * （08 D08-23 のテキスト抽出で日本語を確かめる）
 */
async function pdfText(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.normalize("NFKC").replaceAll("\u2027", "・").replace(/\s+/g, "");
}

async function downloadVia(
  page: Page,
  mode: "full" | "restricted",
): Promise<{ filename: string; bytes: Buffer }> {
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog
    .getByLabel(
      mode === "full"
        ? "全画面ダウンロード"
        : "評価・組織との合致度・リスクを非表示にしてダウンロード",
    )
    .check();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    dialog.getByRole("button", { name: "ダウンロードを開始する" }).click(),
  ]);
  const path = await download.path();
  await expect(dialog).toHaveCount(0);
  return { filename: download.suggestedFilename(), bytes: await readFile(path) };
}

test("E-21 PDF: 2 モード、ファイル名、restricted の非表示、比較組織の引き継ぎ", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(240_000);
  const { resultId } = emulatorTask<{ resultId: string }>(
    "submit-type",
    adminOrg.organizationId,
    "conductor",
  );
  await loginViaUi(page, adminOrg.ownerEmail);
  await page.goto(`/admin/results/${resultId}`);
  // AI 解説を completed にしておく（full には掲載、restricted には掲載しない）
  await page.locator(".result-header").getByRole("button", { name: "AI解説を表示" }).click();
  await expect(page.getByTestId("ai-analysis-body")).toBeVisible({ timeout: 30_000 });

  // 比較組織を選んだ状態でダウンロード
  await page.getByLabel("比較組織").selectOption("organization");
  await expect(page.getByTestId("population-label")).toBeVisible();
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await expect(page.locator("dialog[open]").getByTestId("pdf-comparison")).toContainText(
    "比較対象: 組織全体",
  );
  await page.keyboard.press("Escape");

  const full = await downloadVia(page, "full");
  expect(full.filename).toBe(`result-${resultId.slice(0, 8)}-full.pdf`);
  expect(full.bytes.length).toBeGreaterThan(1024);
  expect(full.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const fullText = await pdfText(full.bytes);
  expect(fullText).toContain("様の診断結果");
  expect(fullText).toContain("個別特性評価");
  expect(fullText).toContain("組織との合致度");
  for (const label of RISK_LABELS) expect(fullText).toContain(label);
  expect(fullText).toContain("比較対象内での立ち位置");
  expect(fullText).not.toContain("比較組織を選択すると表示されます");
  expect(fullText).toContain("AI解説");
  expect(fullText).toContain("この人物の要約");
  expect(fullText).toContain("診断スコア(16特性・ソーシャルスタイル・リスク指標)");

  const restricted = await downloadVia(page, "restricted");
  expect(restricted.filename).toBe(`result-${resultId.slice(0, 8)}-restricted.pdf`);
  expect(restricted.filename).not.toMatch(/テスト/);
  const restrictedText = await pdfText(restricted.bytes);
  // 評価（レター）・合致度（ゲージ）・リスク 7 ゲージの見出しと AI 解説（セクション 7）が無い
  expect(restrictedText).not.toContain("個別特性評価");
  expect(restrictedText).not.toContain("組織との合致度");
  for (const label of RISK_LABELS) expect(restrictedText).not.toContain(label);
  expect(restrictedText).not.toContain("比較対象内での立ち位置・リスク");
  expect(restrictedText).not.toContain("AI解説");
  expect(restrictedText).not.toContain("この人物の要約");
  expect(restrictedText).not.toContain("診断スコア(16特性・ソーシャルスタイル・リスク指標)");
  // 立ち位置（名称）は印字する（06 D06-26）。フッターに非表示の注記
  expect(restrictedText).toContain("比較対象内での立ち位置");
  expect(restrictedText).toContain("評価・合致度・リスク非表示");

  // 比較組織を外すと、比較項目は固定文言のまま印字する（06 D06-16）
  await page.getByLabel("比較組織").selectOption("");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await expect(page.locator("dialog[open]").getByTestId("pdf-comparison")).toHaveText(
    "比較組織: 未選択",
  );
  await page.keyboard.press("Escape");
  const noScope = await pdfText((await downloadVia(page, "full")).bytes);
  expect(noScope).toContain("比較組織を選択すると表示されます");
});

test("E-21 印刷用ページはトークンなしで 404（ログイン画面へ転送しない）、検索避けと Referer 抑止のヘッダー", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = emulatorTask<{ resultId: string }>(
    "submit-type",
    adminOrg.organizationId,
    "conductor",
  );
  await loginViaUi(page, adminOrg.ownerEmail);
  // 管理者 Cookie があってもトークンが無ければ 404（08 I-47 (h)）
  const res = await page.request.get(`/admin/results/${resultId}/print?mode=full`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(404);
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});
