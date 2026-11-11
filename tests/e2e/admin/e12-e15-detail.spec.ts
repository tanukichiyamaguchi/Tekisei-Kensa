// 結果詳細の新しいレイアウト（11-4 §5.3。PR-7.8a）: M7-result-21 構成（E-12 の置き換え）、M7-result-22 比較の流れ（E-13 の置き換え）、
// M7-result-23 0 人と失敗、M7-result-24 色（E-14 の置き換え）、M7-result-25 2 つのタブの独立（E-15）、M7-result-26 並び替えと保持、
// M7-result-27 項目の説明、M7-result-28 吹き出し、M7-result-29 2 つのポップアップ、M7-result-32 折りたたみ。
// 待ち合わせは #rs2 の data-comparison と 11-4 §2.1 の要素の id で行い、旧の要素（.result-section の見出しの並び・.grade-cell・
// population-label・.grade-letter・ドーナツゲージ・ApexCharts の凡例・.notice-inline など）は使わない。旧のセクション 5・6（育成方法・
// ソーシャルスタイル）は PR-7.8b まで新しいレイアウトの後ろに残る。コンダクタータイプの見本は submit-type（固定シードの乱数回答。
// テストテスト 50。職業コード 6「受付」）で、16 の特性の値は採点で決まる（協力性・リーダーシップ 19 〜 優劣性 9.5、信頼係数 75.745）
import type { Page } from "@playwright/test";

import { emulatorTask } from "../support/admin";
import {
  alertToast,
  E2E_ADMIN_PASSWORD,
  expect,
  expectComparison,
  loginViaUi,
  moreTraitsButton,
  noComparisonPlaces,
  openResultDetail,
  rdFold,
  rdPopup,
  rdSection,
  rectOf,
  resultDetail,
  rowOf,
  seedExam,
  seedName,
  submitType,
  test,
  todayInTokyo,
  traitHelpButton,
  traitRowNames,
  traitSortButtons,
} from "../support/admin-ui";

/** 比較なしの文言（11-4 §2.6） */
const NO_COMPARISON = "右上で比較組織を選ぶと表示されます";
const LOADING = "データを読み込んでいます";

/** 16 の特性の項目順（00 §1.2） */
const ITEM_ORDER = [
  "協力性",
  "適応力",
  "優劣性",
  "謙虚さ",
  "反省力",
  "規則遵守力",
  "こだわり",
  "感情の豊かさ",
  "敏感さ",
  "自己肯定感",
  "革新的思考",
  "行動力",
  "前向きさ",
  "リーダーシップ",
  "発想力",
  "コミュニケーション力",
];

/** コンダクタータイプの見本の「点数の高い順」（同じ値はいちばん高い特性を先、ほかは項目順。11-4 §2.8.6）と値の表示 */
const CONDUCTOR_SCORE_ORDER = [
  ["協力性", "19"],
  ["リーダーシップ", "19"],
  ["行動力", "18.5"],
  ["感情の豊かさ", "18"],
  ["コミュニケーション力", "18"],
  ["規則遵守力", "16"],
  ["革新的思考", "16"],
  ["反省力", "15.5"],
  ["こだわり", "15"],
  ["適応力", "14"],
  ["発想力", "13.5"],
  ["自己肯定感", "13"],
  ["前向きさ", "13"],
  ["謙虚さ", "12"],
  ["敏感さ", "11.5"],
  ["優劣性", "9.5"],
] as const;

/** コンダクタータイプの特性の詳細（11-4 §2.9 の並び。見出しは「情緒及び精神面」の最初の「及び」を「・」に） */
const CONDUCTOR_DETAILS = [
  "対人関係",
  "人の面倒をよく見ることができ、自主的に行動することができる。",
  "指導者的立場をとるよりも人の意見を素直に聞こうとする意識が強い。",
  "外向的であるが目立つことを好まず、初対面では大人しく見られがちである。",
  "行動特性",
  "決断力がありじっくり考えるより行動を優先する。臨機応変で好奇心が強い。",
  "業務対応",
  "目標達成に対する意識が高い。責任感が強く負けず嫌い。積極的で根性あり。",
  "自信を持っており仕事の処理も早い。体を動かすことが好きである。",
  "環境適応",
  "集団内でのバランス感覚に優れ、周りを考えながら自己の主張ができる。",
  "自己実現への達成意欲が高く粘り強い。集団依存せず個としての行動ができる。",
  "環境に順応しやすく、組織を重視し現実主義。客観的かつ冷静な判断ができる。",
  "現状肯定的・妥協的に物事を考え、周りを意識して意思決定することが多い。",
  "情緒・精神面",
  "明るく素直な性質で細かいことにこだわらず穏やかな印象を人に与える。",
  "楽天的に考えることが多くストレスがたまりにくい。開放的な心理状態である。",
];

/** レーダーの本人と比較組織の平均の多角形（色は参照元のまま。11-4 §2.8.3） */
const subjectPolygon = (page: Page) => page.locator('#rs-trc svg polygon[stroke="#2563eb"]');
const averagePolygon = (page: Page) => page.locator('#rs-trc svg polygon[stroke="#16a34a"]');

/** 並び替えのボタンのうち label だけが押されている（label が null ならどれも押されていない） */
async function expectPressedSort(page: Page, label: string | null): Promise<void> {
  const buttons = traitSortButtons(page);
  const labels = await buttons.allTextContents();
  await expect(buttons).toHaveText(labels);
  for (const [i, text] of labels.entries()) {
    await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", text === label ? "true" : "false");
  }
}

/** 一覧の差のバッジの数（上から） */
const diffValues = async (page: Page): Promise<number[]> =>
  (await page.locator("#rs-trc .tr .df").allTextContents()).map(Number);

/** 目次のリンクで移ったあと、行き先の先頭が目次の下端から 16px（±1）に来る（なめらかなスクロールの終わりを待つ。11-4 §2.5） */
async function expectLandedBelowToc(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const toc = await rectOf(resultDetail(page).toc);
      const target = await rectOf(page.locator(`#${id}`));
      return Math.abs(target.top - toc.bottom - 16) <= 1;
    })
    .toBe(true);
}

/** 回答一覧に戻り、別の人の「結果を見る」で結果詳細を開く（同じページのまま移る。11-4 §2.1） */
async function moveToAnotherPerson(page: Page, name: string, resultId: string): Promise<void> {
  await resultDetail(page).back.click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await rowOf(page, name).getByRole("link", { name: "結果を見る" }).click();
  await page.waitForURL(`**/admin/results/${resultId}`);
  await expectComparison(page, "none");
}

test("M7-result-21 構成: サイドメニューと共通ヘッダーの無い枠、見出し「{氏名}様の診断結果」・受験情報の 1 行・目次・5 つのセクション・特性の詳細（コンダクタータイプ例）。見出しに「AI解説を表示」が無く、旧の見出しは育成方法・ソーシャルスタイルだけ", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const rd = resultDetail(page);

  // サイドメニュー（メインメニュー）と共通ヘッダー（組織名・管理者名・ログアウト）を出さない、画面に固定した枠（§2.1）
  await expect(page.getByRole("navigation", { name: "メインメニュー" })).toHaveCount(0);
  await expect(page.locator(".admin-sidebar")).toHaveCount(0);
  await expect(page.locator(".admin-header")).toHaveCount(0);
  await expect(rd.frame).toHaveCSS("position", "fixed");
  // 枠は本文の入れ物（main。余白なし）の中に描く（11-8 §2.1.2。見た目は変わらない）
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main").locator("#rd")).toHaveCount(1);

  // 見出し（氏名と「様」の間に空白を入れない。§2.3.2）と受験情報の 1 行（§2.4）
  await expect(rd.title).toHaveText(`${seedName(50)}様の診断結果`);
  const meta = page.getByRole("group", { name: "受験の情報" });
  await expect(meta.locator(":scope > span")).toHaveText([
    `受験日${todayInTokyo().ymd}`,
    "職業受付",
    "タイプコンダクター",
    "信頼係数76%結果は参考程度に",
  ]);
  // 信頼係数は丸める前の 75.745 で判定する（80 未満は #B45309 と「結果は参考程度に」）
  await expect(meta.locator("b.mid")).toHaveText("76%");
  await expect(meta.locator("b.mid")).toHaveCSS("color", "rgb(180, 83, 9)");

  // 本文の並び: 見出しの塊・目次・AI 解説の領域・新しいレイアウト（§2.1）
  const order = await page
    .locator("#rd .rd-body > *")
    .evaluateAll((els) => els.slice(0, 4).map((el) => el.id));
  expect(order).toEqual(["rd-head", "rsn-wrap", "ai", "rs2"]);
  await expect(page.locator("#ai").getByTestId("ai-analysis-section")).toBeVisible();

  // 目次（§2.5。PR-7.8a は AI解説と 5 つのセクション）
  await expect(rd.toc).toBeVisible();
  await expect(rd.tocLinks).toHaveText([
    "AI解説",
    "概要",
    "16の特性",
    "リスク",
    "組織との相性",
    "人物像",
  ]);

  // セクションの見出しと説明（§2.2。比較なし）
  await expect(rd.layout.locator(".sec-h h2")).toHaveText([
    "概要",
    "16の特性",
    "リスク",
    "組織との相性",
    "人物像",
  ]);
  await expect(rd.layout.locator(".sec-h p")).toHaveText([
    "どんな人で、組織の中でどこに位置するか",
    "0〜30点。右上で比較組織を選ぶと平均も表示",
    "起こりやすさ。高い順に表示",
    "5つの軸で、比較組織と比べてどちら寄りか",
    "性格と、向いている仕事",
  ]);

  // 概要のタイプのカード（§2.7.1）
  const hero = page.locator("#rs-hero");
  await expect(hero.locator(".type")).toContainText("コンダクタータイプ");
  await expect(hero.locator(".nick")).toHaveText("アカリ");
  await expect(hero.locator(".pic img")).toHaveAttribute("src", "/images/types/conductor.svg");
  await expect(hero.locator(".pic img")).toHaveAttribute("alt", "");
  await expect(hero.locator(".lead")).toHaveText("人を活躍させる仕事に適性があります。");
  await expect(hero.locator(".tag")).toHaveText([
    "接し方エミアブル",
    "育て方柔軟型",
    "優位感覚視覚",
  ]);

  // 特性の詳細（§2.9。今の付録C §2 の文。情緒・精神面が最後のカード）
  await expect(page.locator("#rs-det").locator("h4, li")).toHaveText(CONDUCTOR_DETAILS);

  // 組織との相性の 5 つの線の行は role="img" で、本人の位置（0〜100 に収めた値）を読み上げる（画面には数値を出さない。§2.11・§2.21）
  const fitRows = page.locator("#rs-fitc .row");
  await expect(fitRows).toHaveCount(5);
  const fitAxes = [
    ["適応する環境", "個人優先型", "組織優先型"],
    ["適応する業務", "変化の少ない業務", "変化の多い業務"],
    ["思考の傾向", "主観的", "客観的"],
    ["意思決定", "依存的", "主体的"],
    ["ストレス耐性", "ストレスを感じやすい", "ストレスを感じにくい"],
  ] as const;
  for (const [i, [axis, left, right]] of fitAxes.entries()) {
    await expect(fitRows.nth(i)).toHaveAttribute("role", "img");
    await expect(fitRows.nth(i)).toHaveAttribute(
      "aria-label",
      new RegExp(`^${axis}: ${left} から ${right} のうち (\\d|[1-9]\\d|100)$`),
    );
  }

  // 見出しに「AI解説を表示」が無い（11-6 の ai-04・ai-05）。旧の見出し（サマリー・個人特性・組織との相性・比較対象内での
  // 立ち位置・リスク）が無く、.result-section の見出しは AI 解説の領域と旧のセクション 5・6 だけ（PR-7.8b まで）
  await expect(rd.head.getByRole("button", { name: "AI解説を表示" })).toHaveCount(0);
  await expect(page.locator(".result-section > h2")).toHaveText([
    "AI 解説",
    "育成方法",
    "ソーシャルスタイル",
  ]);

  // 「回答一覧に戻る」で /admin へ（§2.3.1）
  await page.getByRole("link", { name: "回答一覧に戻る" }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
});

test("M7-result-22 比較の流れ: 未選択は 3 か所に比較なしの文言で API を呼ばない。「組織全体」で読み込み中を経て比較あり（API 1 本）、評価・人数（3 か所）・2 つ目の凡例・平均との差・差のバッジ・レーダーの平均・ポジションの全文。再読み込みで保ち、「比較組織を選択」で未選択に戻る", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  const comparisonCalls: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith("/comparison")) comparisonCalls.push(req.url());
  });
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const rd = resultDetail(page);

  // 未選択（§2.6）
  for (const place of noComparisonPlaces(page)) await expect(place).toHaveText(NO_COMPARISON);
  await expect(page.locator("#rs-hyo")).toHaveText("—");
  await expect(page.locator("#rs-hyo")).toHaveClass("grade no");
  await expect(rd.scope).toHaveValue("");
  await expect(rd.scope.locator("option:checked")).toHaveText("比較組織を選択");
  expect(comparisonCalls).toHaveLength(0);

  // 読み込み中（比較 API の応答を止めておく。アプリだけの状態。K-31 ④）
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const isComparison = (url: URL) => url.pathname.endsWith("/comparison");
  await page.route(isComparison, async (route) => {
    await held;
    await route.continue();
  });
  await rd.scope.selectOption("organization");
  await page.waitForURL(/scope=organization/);
  await expectComparison(page, "loading");
  for (const place of noComparisonPlaces(page)) await expect(place).toHaveText(LOADING);
  await expect(rd.scope).toHaveAttribute("aria-disabled", "true");
  release();
  await expectComparison(page, "ready");
  await page.unroute(isComparison);
  expect(comparisonCalls).toHaveLength(1);
  await expect(rd.scope).not.toHaveAttribute("aria-disabled");

  // 比較あり: 評価の文字と、人数を 3 か所に「（n人）」（§2.6・§2.7）
  await expect(page.locator("#rs-hyo")).toHaveText(/^[A-E]$/);
  await expect(page.locator("#rs-hyo")).toHaveClass("grade");
  const matchNote = page.locator("#rs-gat .s");
  await expect(matchNote).toHaveText(/^組織全体（\d+人）と比べた近さ$/);
  const n = /（(\d+)人）/.exec((await matchNote.textContent()) ?? "")?.[1] ?? "";
  await expect(page.locator("#rs-trc .legend > span")).toHaveText([
    "本人",
    `組織全体の平均（${n}人）`,
  ]);
  await expect(page.locator("#rs-fitc .fitlg > span")).toHaveText([
    "本人",
    `組織全体の平均（${n}人）`,
  ]);
  for (const place of noComparisonPlaces(page)) await expect(place).toHaveCount(0);

  // 16の特性: 説明・2 つ目の凡例（サロン平均。K-19）・平均との差のボタン・差のバッジ 16 個・レーダーの平均（§2.8）
  await expect(rdSection(page, "rs-tr").locator(".sec-h p")).toHaveText(
    "0〜30点。線は比較組織の平均",
  );
  await expect(page.locator("#rs-trc .tlg > span")).toHaveText([
    "本人の点数",
    "サロン平均（組織全体）",
    "最も高い",
    "最も低い",
  ]);
  await expect(traitSortButtons(page)).toHaveText(["点数の高い順", "平均との差", "項目順"]);
  await expect(page.locator("#rs-trc .tr .df")).toHaveCount(16);
  await expect(page.locator("#rs-trc .tr u")).toHaveCount(16);
  await expect(averagePolygon(page)).toHaveCount(1);

  // 組織との相性の一言と平均の印、ポジションの全文（先頭の「・」を除いた全行。§2.11）
  await expect(page.locator("#rs-fitc .fr .h span")).toHaveText(
    Array.from({ length: 5 }, () => /^(組織とほぼ同じ|組織より「.+」寄り)$/),
  );
  await expect(page.locator("#rs-fitc .og")).toHaveCount(5);
  const positionName = (await page.locator("#rs-hero .pos .t").textContent()) ?? "";
  expect(positionName).not.toBe("");
  await expect(page.locator("#rs-fitc .fitnote .t")).toHaveText(
    `組織内のポジション：${positionName}`,
  );
  const lines = await page.locator("#rs-fitc .fitnote li").allTextContents();
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) expect(line.startsWith("・")).toBe(false);
  await expect(page.locator("#rs-hero .pos .s")).toHaveText(lines[0] ?? "");

  // 再読み込みで選択が保たれる（URL）
  await page.reload();
  await expectComparison(page, "ready");
  await expect(rd.scope).toHaveValue("organization");
  expect(comparisonCalls).toHaveLength(2);

  // 「比較組織を選択」に戻すと未選択の表示
  await rd.scope.selectOption("");
  await expectComparison(page, "none");
  await expect(page).not.toHaveURL(/scope=/);
  for (const place of noComparisonPlaces(page)) await expect(place).toHaveText(NO_COMPARISON);
  await expect(traitSortButtons(page)).toHaveText(["点数の高い順", "項目順"]);
  await expect(page.locator("#rs-trc .tr .df")).toHaveCount(0);
  await expect(averagePolygon(page)).toHaveCount(0);
  await expect(page.locator("#rs-fitc .og")).toHaveCount(0);
  expect(comparisonCalls).toHaveLength(2);
});

test("M7-result-23 誰もいないチームは 3 か所に「「Zチーム」には比べられる回答がありません」で通知なし。比較 API の失敗は通知（role=alert）と未選択の文言", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, seedExam(adminOrg, 1).resultId);
  const rd = resultDetail(page);

  // 0 人（409 POPULATION_EMPTY）: 3 か所だけ（§2.6）。2 つ目の凡例は未選択と同じ文
  await rd.scope.selectOption("team:Z");
  await expectComparison(page, "empty");
  for (const place of noComparisonPlaces(page)) {
    await expect(place).toHaveText("「Zチーム」には比べられる回答がありません");
  }
  await expect(page.locator("#rs-trc .tlg > span").nth(1)).toHaveText(
    "サロン平均（右上で比較組織を選ぶと表示されます）",
  );
  await expect(page.locator("#rs-trc .legend > span")).toHaveText(["本人"]);
  await expect(page.locator("#rs-hyo")).toHaveText("—");
  await expect(page.locator(".toast")).toHaveCount(0);

  // 失敗（500）: 通知にエラーの文言、3 か所は未選択と同じ文言（今の作り。§1.4 の 3）
  await page.route(
    (url) => url.pathname.endsWith("/comparison"),
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "サーバ内部でエラーが発生しました" },
        }),
      }),
  );
  await rd.scope.selectOption("organization");
  await expectComparison(page, "error");
  await expect(alertToast(page)).toHaveText("サーバ内部でエラーが発生しました");
  for (const place of noComparisonPlaces(page)) await expect(place).toHaveText(NO_COMPARISON);
  await expect(page.locator("#rs-hyo")).toHaveText("—");
  await expect(page.locator("#rs-trc .tr .df")).toHaveCount(0);
});

test("M7-result-24 色（比較組織＝組織全体）: 信頼係数 90% は #15805E と「回答は信頼できます」、受験情報の 1 行は通常の色で注記なし、不祥事 90% は「高い」の行、合致度と評価は色分けしない", async ({
  page,
}) => {
  const { ownerEmail, resultId } = emulatorTask<{ ownerEmail: string; resultId: string }>(
    "seed-grade-a-org",
    E2E_ADMIN_PASSWORD,
  );
  await loginViaUi(page, ownerEmail);
  await openResultDetail(page, resultId, "?scope=organization");
  // マウスの位置で地が変わる行があるので、部品の無い枠の余白へ動かしておく
  await page.mouse.move(1, 1);

  // 信頼係数のカード（表示値 90 → 80 以上。§2.7.4）
  const reliability = page.locator("#rs-hero .kpi").filter({ hasText: "信頼係数" });
  await expect(reliability).toHaveClass("card kpi t-good");
  await expect(reliability.locator(".v")).toHaveText("90%");
  await expect(reliability.locator(".v")).toHaveCSS("color", "rgb(21, 128, 94)");
  await expect(reliability.locator(".meter i")).toHaveCSS("background-color", "rgb(21, 128, 94)");
  await expect(reliability.locator(".s")).toHaveText("回答は信頼できます");
  // 受験情報の 1 行は丸める前の 90 で判定し、値は通常の色、「結果は参考程度に」は無い（§2.4）
  const metaReliability = resultDetail(page)
    .meta.locator(":scope > span")
    .filter({ hasText: "信頼係数" });
  await expect(metaReliability).toHaveText("信頼係数90%");
  await expect(metaReliability.locator("b")).toHaveCSS("color", "rgb(31, 41, 51)");
  await expect(metaReliability.locator(".note")).toHaveCount(0);

  // リスク: 不祥事 90% は「高い」（行の地 #FDE7E7・左の線 #EF4444・札の地 #EB1515。札の地は K-49。§2.10）
  const misconduct = page.locator("#rs2 .rs").filter({ hasText: "不祥事が発生する" });
  await expect(misconduct).toHaveClass("rs lv4");
  await expect(misconduct).toHaveCSS("background-color", "rgb(253, 231, 231)");
  await expect(misconduct).toHaveCSS("border-left-color", "rgb(239, 68, 68)");
  await expect(misconduct.locator(".v")).toHaveText("90%");
  await expect(misconduct.locator(".lv")).toHaveText("高い");
  await expect(misconduct.locator(".lv")).toHaveCSS("background-color", "rgb(235, 21, 21)");
  await expect(misconduct.locator(".lv")).toHaveCSS("color", "rgb(255, 255, 255)");

  // 合致度 96%: 数字は通常の色、メーターは #3F8DA5（色分けしない。K-39 Q-03。§2.7.3）
  const match = page.locator("#rs-gat");
  await expect(match.locator(".v")).toHaveText("96%");
  await expect(match.locator(".v")).toHaveCSS("color", "rgb(20, 32, 43)");
  await expect(match.locator(".meter i")).toHaveCSS("background-color", "rgb(63, 141, 165)");
  const ratio = await match
    .locator(".meter")
    .evaluate((el) => (el.firstElementChild?.clientWidth ?? 0) / el.clientWidth);
  expect(ratio).toBeCloseTo(0.96, 2);

  // 評価 A の箱は #14202B（評価で色を変えない。§2.7.2）
  const grade = page.locator("#rs-hyo");
  await expect(grade).toHaveText("A");
  await expect(grade).toHaveCSS("background-color", "rgb(20, 32, 43)");
  await expect(grade).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("M7-result-25 2 つのタブで別の比較組織を選んでも互いに影響せず、adminUsers 文書も変わらない（人数は合致度のカードの文で確かめる）", async ({
  page,
  context,
  adminOrg,
}) => {
  const target = seedExam(adminOrg, 1);
  await loginViaUi(page, adminOrg.ownerEmail);
  const before = emulatorTask<{ updatedAt: number }>("admin-user-doc", adminOrg.ownerUid);

  await openResultDetail(page, target.resultId, "?scope=organization");
  const tab2 = await context.newPage();
  await openResultDetail(tab2, target.resultId, "?scope=team&teamCode=A");

  await expect(page.locator("#rs-gat .s")).toHaveText(/^組織全体（\d+人）と比べた近さ$/);
  await expect(tab2.locator("#rs-gat .s")).toHaveText(/^Aチーム（\d+人）と比べた近さ$/);
  await page.reload();
  await expectComparison(page, "ready");
  await expect(page.locator("#rs-gat .s")).toHaveText(/^組織全体（\d+人）と比べた近さ$/);
  await expect(tab2.locator("#rs-gat .s")).toHaveText(/^Aチーム（\d+人）と比べた近さ$/);

  const after = emulatorTask<{ updatedAt: number }>("admin-user-doc", adminOrg.ownerUid);
  expect(after.updatedAt).toBe(before.updatedAt);
});

test("M7-result-26 並び替え: 3 つのボタンで一覧の並びが変わりレーダーは変わらない。比較組織を外すと「平均との差」が消えて項目順（どれも押されていない）、選び直すと戻る。別の人に移っても保ち、再読み込みで「点数の高い順」", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const rd = resultDetail(page);
  const sort = (label: string) => traitSortButtons(page).filter({ hasText: label });
  const radarPoints = await subjectPolygon(page).getAttribute("points");
  expect(radarPoints).not.toBeNull();

  // 既定は「点数の高い順」（同じ値はいちばん高い特性が先、ほかは項目順。§2.8.6）
  await expectPressedSort(page, "点数の高い順");
  expect(await traitRowNames(page)).toEqual(CONDUCTOR_SCORE_ORDER.map(([name]) => name));
  await expect(page.locator("#rs-trc .tr .val")).toHaveText(
    CONDUCTOR_SCORE_ORDER.map(([, value]) => value),
  );

  // 項目順。レーダー・凡例は変わらない
  await sort("項目順").click();
  await expectPressedSort(page, "項目順");
  await expect.poll(() => traitRowNames(page)).toEqual(ITEM_ORDER);
  await expect(subjectPolygon(page)).toHaveAttribute("points", radarPoints ?? "");

  // 平均との差（比較ありのときだけ）: 差の大きい順
  await rd.scope.selectOption("organization");
  await expectComparison(page, "ready");
  await sort("平均との差").click();
  await expectPressedSort(page, "平均との差");
  const diffs = await diffValues(page);
  expect(diffs).toEqual([...diffs].sort((a, b) => b - a));
  await expect(subjectPolygon(page)).toHaveAttribute("points", radarPoints ?? "");

  // 比較組織を外すと「平均との差」が消え、項目順でどのボタンも押されていない表示
  await rd.scope.selectOption("");
  await expectComparison(page, "none");
  await expect(traitSortButtons(page)).toHaveText(["点数の高い順", "項目順"]);
  await expectPressedSort(page, null);
  await expect.poll(() => traitRowNames(page)).toEqual(ITEM_ORDER);

  // 選び直すと「平均との差」の表示と並びに戻る
  await rd.scope.selectOption("organization");
  await expectComparison(page, "ready");
  await expectPressedSort(page, "平均との差");
  expect(await diffValues(page)).toEqual(diffs);

  // 別の人の結果に移っても並びを保つ（回答一覧から開く）
  await sort("項目順").click();
  await expectPressedSort(page, "項目順");
  await moveToAnotherPerson(page, seedName(3), seedExam(adminOrg, 3).resultId);
  await expectPressedSort(page, "項目順");
  await expect.poll(() => traitRowNames(page)).toEqual(ITEM_ORDER);

  // ブラウザで読み込み直すと「点数の高い順」に戻る
  await page.reload();
  await expectComparison(page, "none");
  await expectPressedSort(page, "点数の高い順");
});

test("M7-result-27 項目の説明: 優劣性で K-33 の 2 文と「本人 9.5点」、もう一度押すと閉じて選択も外れ、開き直せる。開くのは 1 つ。並び替えでは閉じず、比較組織を変えると閉じる。説明のボタンで一覧の並びと並び替えの選択は変わらない", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const panel = page.locator("#rs-trc .sk-p");
  const deliberateness = traitHelpButton(page, "優劣性");
  const cooperativeness = traitHelpButton(page, "協力性");
  await expect(page.locator("#rs-trc .sk-b button")).toHaveText(ITEM_ORDER);
  await expect(page.locator("#rs-trc .sk-t")).toHaveText(
    "項目をタップすると、どんな力かの説明が出ます。",
  );
  await expect(panel).toHaveCount(0);

  // 開く（優劣性は K-33 の文。§2.8.4）。一覧の並びと並び替えの選択は変わらない（§1.4 の 12）
  await deliberateness.click();
  await expect(deliberateness).toHaveAttribute("aria-pressed", "true");
  await expect(deliberateness).toHaveClass("on");
  await expect(panel.locator(".sk-n")).toContainText("優劣性");
  await expect(panel.locator(".sk-s")).toHaveText("本人 9.5点");
  await expect(panel.locator(".sk-d")).toHaveText(
    "物事を決める前に、どれだけじっくり考えるかを表します。",
  );
  await expect(panel.locator(".sk-h")).toHaveText(
    "高いと冷静で思慮深く、低いと判断が早い反面、早とちりしやすくなります。",
  );
  await expectPressedSort(page, "点数の高い順");
  expect(await traitRowNames(page)).toEqual(CONDUCTOR_SCORE_ORDER.map(([name]) => name));

  // もう一度押すと閉じ、ボタンの選択も外れる。もう一度押すと開き直せる
  await deliberateness.click();
  await expect(panel).toHaveCount(0);
  await expect(deliberateness).toHaveAttribute("aria-pressed", "false");
  await deliberateness.click();
  await expect(panel.locator(".sk-s")).toHaveText("本人 9.5点");

  // 開いているのは 1 つだけ
  await cooperativeness.click();
  await expect(panel).toHaveCount(1);
  await expect(panel.locator(".sk-n")).toContainText("協力性");
  await expect(panel.locator(".sk-s")).toHaveText("本人 19点");
  await expect(deliberateness).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('#rs-trc .sk-b button[aria-pressed="true"]')).toHaveCount(1);

  // 並び替えでは閉じない
  await traitSortButtons(page).filter({ hasText: "項目順" }).click();
  await expectPressedSort(page, "項目順");
  await expect(panel.locator(".sk-n")).toContainText("協力性");

  // 比較組織を変えると閉じる（§2.8.4）
  await resultDetail(page).scope.selectOption("organization");
  await expectComparison(page, "ready");
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#rs-trc .sk-b button[aria-pressed="true"]')).toHaveCount(0);
});

test("M7-result-28 吹き出し: 軸に載せると特性名・本人・サロン平均（差）、外すと消え、スクロールで消え、画面の右端の近くでは左に出る", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId, "?scope=organization");
  const rd = resultDetail(page);
  const tip = page.locator(".rd-tip");
  const svg = page.getByRole("img", { name: "16の特性レーダーチャート" });
  await expect(svg.locator("line.rd-hit")).toHaveCount(16);

  // 協力性（真上の軸）の中心から 120 の位置にマウスを載せる（viewBox 560×460 を描いた大きさに直す）
  await svg.scrollIntoViewIfNeeded();
  const axisPoint = async () => {
    const box = await rectOf(svg);
    const scale = (box.right - box.left) / 560;
    return { x: box.left + 280 * scale, y: box.top + (230 - 120) * scale };
  };
  const point = await axisPoint();
  await page.mouse.move(point.x, point.y);
  await expect(tip).toBeVisible();
  const [name, subject, average] = (await tip.innerText()).split("\n");
  expect(name).toBe("協力性");
  expect(subject).toBe("● 本人 19点");
  const match = /^● サロン平均 (\d+(?:\.\d)?)点（差 ([+-]?\d+(?:\.\d)?)）$/.exec(average ?? "");
  expect(match).not.toBeNull();
  // 差は丸めた本人と平均の差をもう一度小数第 1 位に丸めたもの（正なら「+」。§2.8.3）
  const d = Math.round((19 - Number(match?.[1])) * 10) / 10;
  expect(match?.[2]).toBe(d > 0 ? `+${d}` : String(d));
  // マウスから右 14px・下 14px（画面の端まで余裕があるとき）
  const tipBox = await rectOf(tip);
  expect(Math.abs(tipBox.left - (point.x + 14))).toBeLessThanOrEqual(1);
  expect(Math.abs(tipBox.top - (point.y + 14))).toBeLessThanOrEqual(1);

  // 外すと消える
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);

  // スクロールで消える（レーダーがマウスの下から外れるまで領域を動かす）
  await page.mouse.move(point.x, point.y);
  await expect(tip).toBeVisible();
  const svgBox = await rectOf(svg);
  await rd.scroll.evaluate((el, dy) => el.scrollBy(0, dy), svgBox.bottom - point.y + 40);
  await expect(tip).toHaveCount(0);

  // 画面の右端の近くでは、マウスの左 14px に出る（反省力の軸に、右端から 10px の位置のマウスの動きを送る。マウスは先に
  // 部品の無い枠の余白へ外しておく）
  await page.mouse.move(5, 5);
  await svg.scrollIntoViewIfNeeded();
  const width = page.viewportSize()?.width ?? 1440;
  const y = (await axisPoint()).y;
  await svg
    .locator("line.rd-hit")
    .nth(4)
    .dispatchEvent("mousemove", { clientX: width - 10, clientY: y });
  await expect(tip).toBeVisible();
  await expect(tip.locator("b")).toHaveText("反省力");
  const rightTip = await rectOf(tip);
  expect(Math.abs(rightTip.right - (width - 10 - 14))).toBeLessThanOrEqual(1);
});

test("M7-result-29 ポップアップ: 概要の 2 つのボタンで「大きい場合」「小さい場合」が開き 16 行が項目順で列 3 つ。大きい場合の適応力は「個性が弱い、主体性がない」。閉じるボタン・Esc・背景で閉じ、開いたボタンに焦点が戻る", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const moreHigh = moreTraitsButton(page, "high");
  const moreLow = moreTraitsButton(page, "low");
  const popup = rdPopup(page);
  const close = popup.getByRole("button", { name: "閉じる" });

  // 大きい場合（K-32 ⑩）。閉じるボタンで閉じる
  await moreHigh.click();
  await expect(popup.getByRole("heading")).toHaveText("項目のポイントが大きい場合の特性");
  await expect(popup.locator("thead th")).toHaveText(["項目", "ポジティブな面", "ネガティブな面"]);
  await expect(popup.locator("tbody tr")).toHaveCount(16);
  await expect(popup.locator("tbody td.c-item")).toHaveText(ITEM_ORDER);
  await expect(
    popup.locator("tbody tr").filter({ has: page.locator("td.c-item", { hasText: /^適応力$/ }) }),
  ).toContainText("個性が弱い、主体性がない");
  await expect(close).toBeFocused();
  await close.click();
  await expect(popup).toHaveCount(0);
  await expect(moreHigh).toBeFocused();

  // 小さい場合。Esc で閉じる
  await moreLow.click();
  await expect(popup.getByRole("heading")).toHaveText("項目のポイントが小さい場合の特性");
  await expect(popup.locator("tbody td.c-item")).toHaveText(ITEM_ORDER);
  await expect(popup.locator("tbody tr").first().locator("td")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(moreLow).toBeFocused();

  // 背景（ポップアップの上、画面の上から 100px の外）を押して閉じる
  await moreLow.click();
  await expect(popup).toBeVisible();
  await page.mouse.click(720, 40);
  await expect(popup).toHaveCount(0);
  await expect(moreLow).toBeFocused();
});

test("M7-result-32 折りたたみ: 見出しの行で開閉し、ボタンの文・aria-expanded・中身が変わる。たたんだセクションへ目次で移ると開いてから移る。たたみ方は別の人に移っても保ち、再読み込みで戻る。700×900 で開くと概要以外がたたまれている", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, seedExam(adminOrg, 1).resultId);
  const rd = resultDetail(page);
  const traits = rdSection(page, "rs-tr");
  const fold = rdFold(page, "rs-tr");

  // 開いているとき「たたむ ▴」
  await expect(traits).toHaveClass("sec");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toHaveAttribute("type", "button");
  await expect(fold.locator(".t-c")).toHaveText("たたむ");
  await expect(fold.locator(".t-c")).toBeVisible();
  await expect(fold.locator(".t-o")).toBeHidden();
  await expect(fold.locator("i")).toHaveText("▴");

  // 見出しの行（見出しの文字）を押すとたたむ: 「ひらく」と、見出しの行以外を隠す
  await traits.locator(".sec-h h2").click();
  await expect(traits).toHaveClass("sec fold");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold.locator(".t-o")).toHaveText("ひらく");
  await expect(fold.locator(".t-o")).toBeVisible();
  await expect(fold.locator(".t-c")).toBeHidden();
  await expect(page.locator("#rs-trc")).toBeHidden();
  await expect(page.locator("#rs-det")).toBeHidden();
  await expect(traits.locator(".sec-h")).toBeVisible();

  // ボタンを押しても 1 回だけ切り替わる（見出しの行の処理で切り替える）
  await fold.click();
  await expect(traits).toHaveClass("sec");
  await expect(page.locator("#rs-trc")).toBeVisible();
  // 説明の文字でもたたむ
  await traits.locator(".sec-h p").click();
  await expect(traits).toHaveClass("sec fold");

  // たたんだセクションへ目次で移ると、開いてから目次の下 16px に移る（§2.5・§2.16）
  await rd.tocLink("16の特性").click();
  await expect(traits).toHaveClass("sec");
  await expect(page.locator("#rs-trc")).toBeVisible();
  await expectLandedBelowToc(page, "rs-tr");

  // たたみ方は別の人の結果に移っても保つ
  await rdSection(page, "rs-rk").locator(".sec-h h2").click();
  await expect(rdSection(page, "rs-rk")).toHaveClass("sec fold");
  await moveToAnotherPerson(page, seedName(2), seedExam(adminOrg, 2).resultId);
  await expect(rdSection(page, "rs-rk")).toHaveClass("sec fold");
  await expect(rdFold(page, "rs-rk")).toHaveAttribute("aria-expanded", "false");
  await expect(rdSection(page, "rs-tr")).toHaveClass("sec");

  // 再読み込みで初めの状態（1440 はすべて開く）
  await page.reload();
  await expectComparison(page, "none");
  await expect(page.locator("#rs2 section.sec.fold")).toHaveCount(0);

  // 画面の幅 700px 以下で開くと、概要以外の 4 つ（PR-7.8a の分）をたたんだ状態で始まる（§2.16）
  await page.setViewportSize({ width: 700, height: 900 });
  await page.reload();
  await expectComparison(page, "none");
  await expect(rdSection(page, "rs-ov")).toHaveClass("sec");
  for (const id of ["rs-tr", "rs-rk", "rs-fit", "rs-pf"]) {
    await expect(rdSection(page, id)).toHaveClass("sec fold");
  }
  await expect(page.locator("#rs-hero")).toBeVisible();
});
