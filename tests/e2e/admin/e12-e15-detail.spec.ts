// E-12 結果詳細の 7 セクション、E-13 比較の未選択と選択、E-14 色、E-15 2 タブの独立性（08 §3.4.3、06 §3.5）
import { emulatorTask } from "../support/admin";
import { E2E_ADMIN_PASSWORD, expect, loginViaUi, openDialog, test } from "../support/admin-ui";

const CONDUCTOR_DETAILS = [
  "対人関係",
  "人の面倒をよく見ることができ、自主的に行動することができる。",
  "指導者的立場をとるよりも人の意見を素直に聞こうとする意識が強い。",
  "外向的であるが目立つことを好まず、初対面では大人しく見られがちである。",
  "行動特性",
  "決断力がありじっくり考えるより行動を優先する。臨機応変で好奇心が強い。",
  "情緒及び精神面",
  "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
  "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
  "業務対応",
  "目標達成に対する意識が高い。責任感が強く負けず嫌い。積極的で根性あり。",
  "自信を持っており仕事の処理も早い。体を動かすことが好きである。",
  "環境適応",
  "集団内でのバランス感覚に優れ、周りを考えながら自己の主張ができる。",
  "自己実現への達成意欲が高く粘り強い。集団依存せず個としての行動ができる。",
  "環境に順応しやすく、組織を重視し現実主義。客観的かつ冷静な判断ができる。",
  "現状肯定的・妥協的に物事を考え、周りを意識して意思決定することが多い。",
];

test("E-12 7 セクションの見出し順、タイプ・キャラクター・イラスト、項目詳細、特性詳細（コンダクタータイプ例）、第二候補", async ({
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

  await expect(page.locator(".result-section > h2")).toHaveText([
    "サマリー",
    "個人特性",
    "組織との相性",
    "比較対象内での立ち位置・リスク",
    "育成方法",
    "ソーシャルスタイル",
    "AI 解説",
  ]);
  await expect(page.getByTestId("type-label")).toHaveText("コンダクタータイプ");
  await expect(page.getByTestId("character-name")).toHaveText("キャラクター: アカリ");
  await expect(page.locator("img.illustration").first()).toHaveAttribute(
    "src",
    "/images/types/conductor.svg",
  );
  await expect(page.getByTestId("highest-trait")).toContainText("（");
  await expect(page.getByTestId("lowest-trait")).toContainText("（");

  const details = page.getByTestId("trait-details");
  await expect(details.locator("h4, li")).toHaveText(CONDUCTOR_DETAILS);

  await page.getByRole("button", { name: "他項目のポジティブ・ネガティブを確認" }).click();
  await expect(openDialog(page).locator("tbody tr")).toHaveCount(16);
  await page.keyboard.press("Escape");

  const heading = page.getByTestId("development-heading");
  await expect(heading).toHaveText(/^第一候補: /);
  await page.getByRole("button", { name: "第二候補を見る" }).click();
  await expect(heading).toHaveText(/^第二候補: /);
  await page.getByRole("button", { name: "第一候補に戻る" }).click();
  await expect(heading).toHaveText(/^第一候補: /);
});

test("E-13 未選択は固定文言、組織全体の選択で比較依存項目が出て比較 API は 1 本。再読み込みで状態が保たれる", async ({
  page,
  adminOrg,
}) => {
  const target = adminOrg.submitted[0]!;
  const comparisonCalls: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith("/comparison")) comparisonCalls.push(req.url());
  });
  await loginViaUi(page, adminOrg.ownerEmail);
  await page.goto(`/admin/results/${target.resultId}`);
  await expect(page.locator(".grade-cell")).toContainText("比較組織を選択すると表示されます");
  await expect(page.getByText("比較組織を選択すると表示されます")).toHaveCount(5);
  expect(comparisonCalls).toHaveLength(0);

  await page.getByLabel("比較組織").selectOption("organization");
  await page.waitForURL(/scope=organization/);
  await expect(page.getByTestId("population-label")).toContainText("比較対象: 組織全体（");
  await expect(page.locator(".grade-letter").first()).toHaveText(/^[A-E]$/);
  await expect(page.locator(".position-view__label").first()).toBeVisible();
  await expect(
    page.locator(".apexcharts-legend-text", { hasText: "比較対象" }).first(),
  ).toBeVisible();
  expect(comparisonCalls).toHaveLength(1);

  await page.reload();
  await expect(page.getByTestId("population-label")).toContainText("比較対象: 組織全体（");
  await expect(page.getByLabel("比較組織")).toHaveValue("organization");
  expect(comparisonCalls).toHaveLength(2);

  // 誰もいないチームは T-10（409 POPULATION_EMPTY）
  await page.getByLabel("比較組織").selectOption("team:Z");
  await expect(page.locator(".notice-inline")).toHaveText(
    "比較できる回答データがありません（除外されていない・現在の採点版の回答データが 0 件です）",
  );
  await expect(page.locator(".grade-cell")).toContainText("比較組織を選択すると表示されます");
});

test("E-14 信頼係数 90% は濃い緑、リスク 90% は赤、評価 A は赤", async ({ page }) => {
  const { ownerEmail, resultId } = emulatorTask<{ ownerEmail: string; resultId: string }>(
    "seed-grade-a-org",
    E2E_ADMIN_PASSWORD,
  );
  await loginViaUi(page, ownerEmail);
  await page.goto(`/admin/results/${resultId}?scope=organization`);
  await expect(page.locator(".grade-letter").first()).toHaveText("A");

  const reliability = page.getByRole("img", { name: "信頼係数 90%" }).first();
  await expect(reliability.locator(".donut-gauge__value")).toHaveAttribute("stroke", "#1b7f4b");
  const misconduct = page
    .getByTestId("risk-gauges")
    .first()
    .getByRole("img", { name: "不祥事 90%" });
  await expect(misconduct.locator(".donut-gauge__value")).toHaveAttribute("stroke", "#d32f2f");
  // 合致度 96%（03 T-12）は既存規則どおり 80 以上で赤
  const match = page.getByRole("img", { name: "組織との合致度 96%" }).first();
  await expect(match.locator(".donut-gauge__value")).toHaveAttribute("stroke", "#d32f2f");
  await expect(page.locator(".grade-letter").first()).toHaveCSS("color", "rgb(211, 47, 47)");
});

test("E-15 2 つのタブで別の比較組織を選んでも互いに影響せず、adminUsers 文書も変わらない", async ({
  page,
  context,
  adminOrg,
}) => {
  const target = adminOrg.submitted[0]!;
  await loginViaUi(page, adminOrg.ownerEmail);
  const before = emulatorTask<{ updatedAt: number }>("admin-user-doc", adminOrg.ownerUid);

  await page.goto(`/admin/results/${target.resultId}?scope=organization`);
  const tab2 = await context.newPage();
  await tab2.goto(`/admin/results/${target.resultId}?scope=team&teamCode=A`);

  await expect(page.getByTestId("population-label")).toContainText("組織全体");
  await expect(tab2.getByTestId("population-label")).toContainText("Aチーム");
  await page.reload();
  await expect(page.getByTestId("population-label")).toContainText("組織全体");
  await expect(tab2.getByTestId("population-label")).toContainText("Aチーム");

  const after = emulatorTask<{ updatedAt: number }>("admin-user-doc", adminOrg.ownerUid);
  expect(after.updatedAt).toBe(before.updatedAt);
});
