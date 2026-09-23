// E-20 AI 解説（stub）（08 §3.4.3、06 §3.5.9、要件定義書 §6.2 A-09、付録D §1）
import { emulatorTask } from "../support/admin";
import { expect, loginViaUi, test } from "../support/admin-ui";

const AI_BLOCK_HEADINGS = [
  "この人物の要約",
  "総合判定／即戦力性／離職リスク",
  "このクリニックで活きる強み",
  "採用前に見極めたい注意点",
  "面接で深掘りすべき質問",
  "長く働いてもらうための接し方・育て方",
  "辞めそうなサイン＆引き止めの一手",
];
const DISCLAIMER =
  "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は院長が内容をご確認のうえご活用ください。";

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
