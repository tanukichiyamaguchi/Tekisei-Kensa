// E-10 ログイン → 回答一覧 → ログアウト、E-11 既存スタッフの可視性（08 §3.4.3、06 §3.1、00 §5）。
// M7-list-34 オーナーの表示、M7-list-35 オーナー以外の表示（11-2 §5.3。E-10・E-11 の改め。11-2 §2.4〜§2.9・§2.25）
import {
  answerLink,
  expect,
  grantClipboard,
  listTools,
  loginViaUi,
  logoutViaHeader,
  readClipboard,
  resultRows,
  rowNames,
  rowOf,
  seedExam,
  seedName,
  statCard,
  statusChip,
  statusToast,
  test,
  todayInTokyo,
} from "../support/admin-ui";

/** 表の列（11-2 §2.8。旧一覧の区分列・詳細・削除の列は無い） */
const COLUMNS = ["受験者", "タイプ", "最新の受験", "チーム", "集計から除外", "操作"];

test("E-10 ログインで login-events が 1 回呼ばれ、一覧が代表の受験日の新しい順・所定の列で出る。ログアウトで戻れない", async ({
  page,
  adminOrg,
}) => {
  const { loginEvents } = await loginViaUi(page, adminOrg.adminEmail);
  expect(loginEvents).toBe(1);

  await expect(page.locator("[data-testid=result-table] thead th")).toHaveText(COLUMNS);
  // シードは テストテスト 01 → 08 の順に送信しているため、新しい順（既定の並び順）では 08 が先頭
  await expect.poll(() => rowNames(page)).toEqual([8, 7, 6, 5, 4, 3, 2, 1].map(seedName));

  await logoutViaHeader(page);
  await page.goto("/admin");
  await page.waitForURL((url) => url.pathname === "/admin/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
});

test("E-10 誤ったパスワードは T-24 を表示してログインしない", async ({ page, adminOrg }) => {
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(adminOrg.ownerEmail);
  await page.getByLabel("パスワード", { exact: true }).fill("wrong-password-9");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator(".notice--error")).toHaveText(
    "メールアドレスまたはパスワードが正しくありません",
  );
  expect(new URL(page.url()).pathname).toBe("/admin/login");
});

test("E-11 admin には既存スタッフが一覧・組織内分類に出ず、URL 直打ちは 404。owner は既存スタッフの結果を開ける", async ({
  page,
  adminOrg,
}) => {
  const executive = adminOrg.submitted.find((s) => s.kind === "executive");
  if (!executive) throw new Error("シードに既存スタッフがいません");

  await loginViaUi(page, adminOrg.adminEmail);
  await expect(resultRows(page)).toHaveCount(8);
  await expect(rowOf(page, seedName(9))).toHaveCount(0);
  await expect(rowOf(page, seedName(10))).toHaveCount(0);

  await page.goto("/admin/classification");
  await expect(page.getByText("全 8 名")).toBeVisible();

  await page.goto(`/admin/results/${executive.resultId}`);
  await expect(page.locator("main [role=alert]")).toHaveText("回答データが見つかりません");

  // owner（結果が見つからないページには枠が無いので、一覧に戻ってからログアウトする）
  await page.goto("/admin");
  await logoutViaHeader(page);
  await loginViaUi(page, adminOrg.ownerEmail);
  await expect(resultRows(page)).toHaveCount(10);
  await page.goto(`/admin/results/${executive.resultId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/様の診断結果$/);
});

test("M7-list-34 オーナー: 見出し・ボタン・集計カード・タブ・列・注記・チップ・小さい文字。既存スタッフの行が混ざり区分列が無い", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  const today = todayInTokyo();

  // 見出し行（§2.4）。オーナーの「回答リンクをコピー」は山のアイコン付きでメニューを開く
  await expect(page.locator(".rl-desc")).toHaveText(
    "受験した人の診断結果を開けます。同じ人の受験は1行にまとめ、最新の受験を表示しています。",
  );
  await expect(page.locator(".rl-head").getByRole("button", { name: "利用履歴" })).toBeVisible();
  const copy = page.getByRole("button", { name: "回答リンクをコピー" });
  await expect(copy).toHaveAttribute("aria-haspopup", "menu");
  await expect(copy.locator("svg")).toHaveCount(2); // リンクと下向きの山

  // 集計カード（§2.5）。0 人のカード 3 は押せない
  await expect(statCard(page, 1)).toHaveText("受験した人10人受講者 8 ／ 既存スタッフ 2");
  await expect(statCard(page, 2)).toHaveText("今月の受験10回先月 0 回");
  await expect(statCard(page, 3)).toHaveText("受験から1年以上たった人0人再受験の時期はまだです");
  await expect(page.locator(".rl-stats button")).toHaveCount(0);
  await expect(statCard(page, 4)).toHaveText("経年比較レポート0件2回以上受験した人：0人");

  // 区分タブ（§2.6）。「受験から1年以上」のタブは区分がそれの間だけ出る
  const tools = listTools(page);
  await expect(tools.tabs).toHaveText(["すべて10", "求職者8", "在籍2", "退職0"]);
  await expect(tools.tab("すべて")).toHaveAttribute("aria-selected", "true");
  await expect(tools.count).toHaveText("10人を表示");

  // 表（§2.8）。既存スタッフ（09・10）の行も同じ表に混ぜ、区分列・既存スタッフのラベルは無い
  await expect(page.locator("[data-testid=result-table] thead th")).toHaveText(COLUMNS);
  await expect(
    page.locator("[data-testid=result-table] thead th").filter({ hasText: "集計から除外" }),
  ).toHaveAttribute("title", "オンにすると、組織内分類の人数に入れません。診断結果は消えません。");
  await expect.poll(() => rowNames(page)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(seedName));
  await expect(page.getByText("既存スタッフ", { exact: true })).toHaveCount(0);
  await expect(page.locator(".rl-note")).toHaveText(
    "行を押すと診断結果を開きます。削除や以前の受験は「…」から選べます。",
  );

  // チップ（§2.9）と「{職業} ・ {電話番号}」。08 は職業 10（責任者）で、役職が未設定でも「責任者」の札が付く（K-21）
  const row01 = rowOf(page, seedName(1));
  await expect(statusChip(row01)).toHaveText("求職者 ▾");
  await expect(statusChip(row01)).toHaveAttribute("title", "タップして区分を変える");
  await expect(statusChip(row01)).toHaveAttribute("aria-haspopup", "menu");
  await expect(row01.locator(".rl-meta")).toHaveText(
    "アイリスト（アシスタント・見習い） ・ 090-0000-0001",
  );
  await expect(row01.locator(".rl-chip--manager, .rl-chip--leader")).toHaveCount(0);
  const row08 = rowOf(page, seedName(8));
  await expect(row08.locator(".rl-chips > *")).toHaveText([
    "責任者",
    "求職者 ▾",
    "責任者 ・ 090-0000-0008",
  ]);
  await expect(statusChip(rowOf(page, seedName(9)))).toHaveText("在籍 ▾");

  // タイプ（点と短縮名、title に所属分類）、最新の受験（Y/M/D HH:MM）、チーム、集計から除外
  await expect(row01.locator(".rl-type")).toHaveAttribute(
    "title",
    /^(Analytical（分析型）|Driving（実行型）|Amiable（温和型）|Expressive（直感型）)$/,
  );
  await expect(row01.locator(".rl-td--latest")).toHaveText(
    new RegExp(`^${today.ymd.replaceAll("/", "\\/")} \\d{2}:\\d{2}$`),
  );
  await expect(row01.getByRole("combobox", { name: `${seedName(1)}のチーム` })).toHaveValue("A");
  await expect(rowOf(page, seedName(6)).getByRole("combobox")).toHaveValue("");
  await expect(
    rowOf(page, seedName(10)).getByRole("switch", {
      name: `${seedName(10)}を組織内分類の集計から除外`,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(rowOf(page, seedName(10)).locator(".rl-switch__label")).toHaveText("除外中");
  await expect(row01.locator(".rl-switch__label")).toHaveText("集計に含む");
  await expect(row01.getByRole("link", { name: "結果を見る" })).toHaveAttribute(
    "href",
    `/admin/results/${seedExam(adminOrg, 1).resultId}`,
  );
});

test("M7-list-35 オーナー以外: 既存スタッフの行が無く、カード 1 の下は延べ回数。回答リンクをコピーはすぐ求職者用をコピーする", async ({
  page,
  context,
  adminOrg,
}) => {
  await grantClipboard(context);
  await loginViaUi(page, adminOrg.adminEmail);
  await expect(resultRows(page)).toHaveCount(8);
  await expect(rowOf(page, seedName(9))).toHaveCount(0);
  await expect(statCard(page, 1)).toHaveText("受験した人8人受験は延べ 8 回");
  await expect(listTools(page).tabs).toHaveText(["すべて8", "求職者8", "在籍0", "退職0"]);

  const copy = page.getByRole("button", { name: "回答リンクをコピー" });
  await expect(copy).not.toHaveAttribute("aria-haspopup");
  await expect(copy.locator("svg")).toHaveCount(1); // 山のアイコンが無い
  await copy.click();
  await expect(statusToast(page)).toHaveText("求職者用の回答リンクをコピーしました");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await readClipboard(page)).toBe(answerLink(adminOrg.organizationId, "applicant"));
});
