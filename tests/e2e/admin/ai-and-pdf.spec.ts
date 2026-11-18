// AI 解説（11-6 §5.3。スタブのプロバイダ）: M7-ai-38 タブ・採用向けの案内・生成中・表示（E-20 の置き換え）と読み直し（409・開いたときの
// 生成中・10 分の打ち切り。§2.3.5）、M7-ai-40 責任者の受験、M7-ai-42 失敗と作り直しと、生成の要求のそのほかの失敗（§2.3.4）。
// E-21 PDF ダウンロード（06 §3.5.11、07 §9、要件定義書 §6.2 A-10）。
// 別の画面で始まった生成（開いたときの生成中）は、アプリと同じリポジトリの関数で作る（直接は書かない）。読み直しの 10 分の打ち切りは
// ブラウザの時計（page.clock）を進めて確かめる。選んだタブを画面の状態（aiTab）に書くことは、読む部品（PDF のダウンロード）が入る
// PR-7.12 の M7-ai-43 で確かめる。
// PR-7.9 の形（11-6 §4.4）: タブは採用向けと育成・定着の 2 つ（経年比較のタブは PR-7.11a まで出さない）。育成・定着は生成できず
// （有効でない種類）、案内と押せない生成ボタンと「この AI 解説は準備中です。」だけ（8 項目と表示は PR-7.10）。表示上の役職が責任者の受験は
// 出せるタブが 0 で、AI 解説の領域も目次の「AI解説」も描かない（PR-7.11a から経年比較のタブだけを出す）。待ち合わせはパネルの
// data-status と、11-6 §2.1 の要素（#ai・.ai-loading・.ai-fail・.ai-rec）で行う。生成中の表示は、生成の要求を page.route で止めて
// 確かめてから放す。位置は実行のときに測る（決め打ちしない）。
// PDF は結果詳細と同じ部品の印刷の形（11-4 §2.18）。PR-7.12 まで、全画面の PDF の AI 解説は採用向けの表示だけ（タブの行・生成前の案内・
// 育成・定着は描かない）。画面の状態は既定（第二候補は出さない・タブはドライビング）で描く（ダウンロードのポップアップの文と PDF の
// 作り、画面の状態を写すことは 11-5 の PR-7.12）
import { readFile } from "node:fs/promises";

import type { Locator, Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

import {
  aiArea,
  aiGenerationElsewhere,
  alertToast,
  expect,
  expectComparison,
  focusByKeyboard,
  holdAiPost,
  loginViaUi,
  openResultDetail,
  rectOf,
  resultDetail,
  seedExam,
  submitNamed,
  submitType,
  test,
  watchAiGets,
  watchAiPosts,
} from "../support/admin-ui";

/** 採用向けの生成前の案内（11-6 §2.4.2） */
const RECRUITMENT_INTRO = {
  title: "AI 採用アドバイザー",
  subtitle: "診断結果を、面接と採用判断で使える形に変換します",
  featureTitles: [
    "即戦力性・離職リスク・総合判定",
    "この人物の要約と、強み・注意点",
    "面接で深掘りすべき質問",
  ],
  featureDescriptions: [
    "採用すべきかの判断材料を、3つの指標で提示します",
    "スコアから人物像を一言で。面接前に見極めたい点も具体的に",
    "その方に合わせた質問と、何を見極めるかまで提示します",
  ],
};

/** 育成・定着の生成前の案内（11-6 §2.5.2） */
const TRAINING_INTRO = {
  title: "AI 育成・定着アドバイザー",
  subtitle: "すでに働いているスタッフを、どう育て、どう定着させるか",
  featureTitles: [
    "すぐに手を打つべき理由と、その一手",
    "期待する役割に向けて、どう育てるか",
    "日常の接し方と、1on1で聞くこと",
  ],
  featureDescriptions: [
    "いま何が起きているか、今週まず何をするかを提示します",
    "何が足りず、どう埋めるかを順番に沿って提示します",
    "そのまま使える言い方つき。○と×の形で提示します",
  ],
  need: "下の8項目にご記入いただくことで、その方の今の状況に合わせた内容を生成します。すべて選択式で、20秒ほどで完了します。",
  needStrong: "その方の今の状況に合わせた内容",
  warn: "一度生成した内容は、あとから修正できません。生成前に入力内容をご確認ください。",
  warnStrong: "あとから修正できません",
};

/** 生成中（11-6 §2.3.3。「~」は半角） */
const GENERATING = {
  title: "AIが解説を作成しています",
  lines: [
    "スコアを読み込み、人物の要約・面接のアドバイスを生成中…",
    "完了まで30~90秒ほどお待ちください",
  ],
};

/** 採用向けの表示の注意書き（11-6 §2.4.3 の 4） */
const CAUTION =
  "ご注意：この解説は「個人」だけを見た結果です。採用の判断では、「概要」で比較組織を選んだときに出る「組織との合致度」が高い人ほど、採用しやすい目安になります。";
/** 末尾（T-09。11-6 §2.4.3 の 11） */
const DISCLAIMER =
  "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は責任者が内容をご確認のうえご活用ください。";

/** 採用向けの表示の並び（11-6 §2.4.3 の 4〜11。節と箱は見出しの文） */
const RECRUITMENT_VIEW_ORDER = [
  "注意書き",
  "判定チップ",
  "この人物の要約",
  "◎ このサロンで活きる強み",
  "△ 採用前に見極めたい注意点",
  "面接で深掘りすべき質問",
  "長く働いてもらうための接し方・育て方",
  "⚠ 辞めそうなサイン ＆ 引き止めの一手",
  "末尾",
];

/** 失敗の枠（T-18 に続く invalid_json の理由の文。11-6 §2.3.4） */
const FAILED_INVALID_JSON =
  "AI解説の生成に失敗しました。AI の応答を解釈できませんでした。再試行してください";
/** 読み直しが 10 分たっても終わらないときの枠（T-29。11-6 §2.3.4） */
const POLLING_TIMEOUT = "時間内に完了しませんでした。ページを再読み込みしてください";
/** 生成中の読み直しの間隔（11-6 §2.3.5。3 秒）と、間隔の確かめに見込むずれ */
const POLL_INTERVAL_MS = 3_000;
const POLL_JITTER_MS = 500;

/** 離職リスクの判定チップの色の段階（11-6 §2.4.4 の表。値の空白を除いて比べる） */
function retentionRiskTone(value: string): "good" | "warn" | "mid" {
  const compact = value.replace(/\s/g, "");
  if (["低い", "非常に低い"].includes(compact)) return "good";
  if (["高い", "非常に高い", "やや高い"].includes(compact)) return "warn";
  return "mid";
}

/** 本文の子の並び（要素の id、無ければ要素名） */
const bodyOrder = (page: Page): Promise<string[]> =>
  page
    .locator("#rd .rd-body > *")
    .evaluateAll((els) => els.map((el) => el.id || el.tagName.toLowerCase()));

test("M7-ai-38 採用向け: 目次の下にタブ 2 つ（初めは採用向け）、案内 →「採用向けAI解説を生成」→ 生成中（見出しと 2 行の説明。輪に枠と回転が当たらない）→ 表示の並び（注意書き → チップ → 要約 → 強み・注意点 → 質問 → 接し方 → 辞めそうなサイン → 末尾）とチップの色のクラス、生成日時が無い。再読み込みしても表示のままで生成ボタンが無く、要求が出ない", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");

  // タブの行は目次の下（領域は目次と新しいレイアウトの間。§2.1）。PR-7.9 は採用向けと育成・定着の 2 つで、初めは採用向け（§2.2）
  expect(await bodyOrder(page)).toEqual(["rd-head", "rsn-wrap", "ai", "rs2", "dialog", "dialog"]);
  await expect(ai.root).toHaveAttribute("aria-label", "AI解説");
  await expect(ai.tabs).toHaveText(["採用向けAI解説", "育成・定着AI解説"]);
  expect((await rectOf(ai.tablist)).top).toBeGreaterThan(
    (await rectOf(resultDetail(page).toc)).bottom,
  );
  await expect(ai.tab("recruitment")).toHaveAttribute("aria-selected", "true");
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "false");
  await expect(panel).toBeVisible();
  await expect(ai.panel("training")).toBeHidden();
  await expect(panel).toHaveAttribute("data-status", "not_generated");

  // 生成前の案内（§2.4.2）
  const intro = panel.locator(".ai-intro");
  await expect(intro.locator("h2.ih-t")).toHaveText(RECRUITMENT_INTRO.title);
  await expect(intro.locator(".ih-s")).toHaveText(RECRUITMENT_INTRO.subtitle);
  await expect(intro.locator(".fi-t")).toHaveText(RECRUITMENT_INTRO.featureTitles);
  await expect(intro.locator(".fi-d")).toHaveText(RECRUITMENT_INTRO.featureDescriptions);
  await expect(ai.genButton("recruitment")).toBeEnabled();

  // 生成中（§2.3.3）: 生成ボタンは押すとすぐ消え、案内は残る。見出しと説明は role="status"。輪（svg.spinner）には管理画面の
  // .spinner の枠と回転が当たらない（admin.css の .spinner は .ai-analysis__progress の下だけ）
  const posts = watchAiPosts(page, resultId);
  const release = await holdAiPost(page, resultId);
  await ai.genButton("recruitment").click();
  const status = panel.getByRole("status");
  await expect(status.locator(".ttl")).toHaveText(GENERATING.title);
  for (const line of GENERATING.lines) await expect(status.locator(".sub")).toContainText(line);
  await expect(ai.genButton("recruitment")).toHaveCount(0);
  await expect(intro).toBeVisible();
  const spinner = ai.loading.locator("svg.spinner");
  await expect(spinner).toHaveCSS("border-top-width", "0px");
  await expect(spinner).toHaveCSS("animation-name", "none");
  release();

  // 表示（§2.4.3）
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveAttribute("data-status", "completed");
  await expect(ai.loading).toHaveCount(0);
  await expect(intro).toHaveCount(0);
  await expect(ai.genButton("recruitment")).toHaveCount(0);
  await expect(ai.view.locator(".ai-head h2")).toHaveText("AI 採用・育成アドバイザー");
  const order = await ai.view
    .locator(".ai-caution, .verdict, h3.ai-label, .mini h4, .ra-head, .ai-foot")
    .evaluateAll((els) =>
      els.map((el) =>
        el.classList.contains("ai-caution")
          ? "注意書き"
          : el.classList.contains("verdict")
            ? "判定チップ"
            : el.classList.contains("ai-foot")
              ? "末尾"
              : (el.textContent ?? "").trim(),
      ),
    );
  expect(order).toEqual(RECRUITMENT_VIEW_ORDER);
  await expect(ai.view.locator("p.ai-caution")).toHaveText(CAUTION);
  await expect(ai.view.locator(".ai-foot")).toHaveText(DISCLAIMER);

  // 判定チップ（§2.4.3 の 5・§2.4.4）: 即戦力性 → 離職リスク → 総合判定。スタブの即戦力性「中」は mid、総合判定「要検討」は warn、
  // 離職リスクは表示された値から §2.4.4 の規則で求めた色
  const chips = ai.view.locator(".vchip");
  await expect(chips.locator(".vk")).toHaveText(["即戦力性", "離職リスク", "総合判定"]);
  await expect(chips.nth(0).locator(".vv")).toHaveText("中");
  await expect(chips.nth(2).locator(".vv")).toHaveText("要検討");
  await expect(chips.nth(0)).toHaveAttribute("class", "vchip mid");
  await expect(chips.nth(2)).toHaveAttribute("class", "vchip warn");
  const risk = (await chips.nth(1).locator(".vv").textContent()) ?? "";
  await expect(chips.nth(1)).toHaveAttribute("class", `vchip ${retentionRiskTone(risk)}`);

  // 質問の番号と「見極め：」、接し方の札、辞めそうなサインの札（§2.4.3 の 8〜10）。生成日時は出さない（ai-08）
  await expect(ai.view.locator(".q .qn")).toHaveText(["1", "2", "3"]);
  await expect(ai.view.locator(".q .qintent .e")).toHaveText(["見極め：", "見極め：", "見極め："]);
  await expect(ai.view.locator(".a .ahead")).toHaveText([
    "関わり方",
    "任せ方",
    "認め方",
    "伸ばし方",
  ]);
  await expect(ai.view.locator(".ra-k")).toHaveText(["サイン", "一手"]);
  await expect(ai.root).not.toContainText("生成日時");
  expect(posts).toHaveLength(1);

  // 再読み込みしても保存済みを表示し、生成ボタンが無く、要求が出ない
  await page.reload();
  await expectComparison(page, "none");
  await expect(ai.view).toBeVisible();
  await expect(panel).toHaveAttribute("data-status", "completed");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(ai.root).not.toContainText("生成日時");
  expect(posts).toHaveLength(1);
});

test("M7-ai-38 育成・定着のタブ: 押すと育成・定着のパネル（案内・枠・警告・押せない「育成・定着AI解説を生成」と「この AI 解説は準備中です。」）が出て採用向けのパネルが隠れ、URL は変わらない。キーボードは左右の矢印・Home・End（端では止まる）。?ai=training で開くと育成・定着が選ばれている", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const url = page.url();

  // 押すと選ぶ（§2.2）。選んでいるタブを押しても何もしない
  await ai.tab("training").click();
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  await expect(ai.tab("recruitment")).toHaveAttribute("aria-selected", "false");
  await expect(ai.panel("training")).toBeVisible();
  await expect(ai.panel("recruitment")).toBeHidden();
  await ai.tab("training").click();
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  expect(page.url()).toBe(url);

  // 育成・定着のパネル（PR-7.9 の形。§2.5.2・§2.3.2）: 案内・枠・警告（「！」の丸は読み上げない）と、押せない生成ボタンとその下の注記
  const panel = ai.panel("training");
  await expect(panel).toHaveAttribute("data-status", "not_generated");
  await expect(panel.locator("h2.ih-t")).toHaveText(TRAINING_INTRO.title);
  await expect(panel.locator(".ih-s")).toHaveText(TRAINING_INTRO.subtitle);
  await expect(panel.locator(".fi-t")).toHaveText(TRAINING_INTRO.featureTitles);
  await expect(panel.locator(".fi-d")).toHaveText(TRAINING_INTRO.featureDescriptions);
  await expect(panel.locator(".need")).toHaveText(TRAINING_INTRO.need);
  await expect(panel.locator(".need b")).toHaveText(TRAINING_INTRO.needStrong);
  await expect(panel.locator(".warn p")).toHaveText(TRAINING_INTRO.warn);
  await expect(panel.locator(".warn b")).toHaveText(TRAINING_INTRO.warnStrong);
  await expect(panel.locator(".warn-i")).toHaveText("！");
  await expect(panel.locator(".warn-i")).toHaveAttribute("aria-hidden", "true");
  await expect(ai.genButton("training")).toBeDisabled();
  await expect(panel.locator(".ai-note")).toHaveText("この AI 解説は準備中です。");
  const start = await panel
    .locator(".ai-start > *")
    .evaluateAll((els) => els.map((el) => el.className));
  expect(start).toEqual(["ai-intro ai-intro--training", "ai-gen-btn", "ai-note"]);

  // キーボード（§2.2）: 選んでいるタブだけ tabindex 0。左右の矢印で隣へ移って選び（端では止まる）、Home・End で先頭・末尾
  await ai.tab("recruitment").click();
  await focusByKeyboard(ai.tab("recruitment"));
  await expect(ai.tab("recruitment")).toHaveAttribute("tabindex", "0");
  await expect(ai.tab("training")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(ai.tab("training")).toBeFocused();
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  await expect(ai.tab("training")).toHaveAttribute("tabindex", "0");
  await expect(ai.tab("recruitment")).toHaveAttribute("tabindex", "-1");
  await expect(ai.panel("training")).toBeVisible();
  await expect(ai.panel("recruitment")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(ai.tab("training")).toBeFocused();
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(ai.tab("recruitment")).toBeFocused();
  await expect(ai.tab("recruitment")).toHaveAttribute("aria-selected", "true");
  await expect(ai.panel("recruitment")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(ai.tab("recruitment")).toBeFocused();
  await expect(ai.tab("recruitment")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(ai.tab("training")).toBeFocused();
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(ai.tab("recruitment")).toBeFocused();
  await expect(ai.tab("recruitment")).toHaveAttribute("aria-selected", "true");
  expect(page.url()).toBe(url);

  // URL の ai（画面の状態の aiTab。§3.7.6）で初めのタブを選ぶ
  await openResultDetail(page, resultId, "?ai=training", "none");
  await expect(ai.tab("training")).toHaveAttribute("aria-selected", "true");
  await expect(ai.panel("training")).toBeVisible();
  await expect(ai.panel("recruitment")).toBeHidden();
});

test("M7-ai-38 生成の要求が 409 AI_ALREADY_GENERATING（別の画面で生成中）: 生成中の表示で読み直し（GET …/recruitment）、生成が終わると表示になる。読み直しの間にタブを切り替えても読み直しは続く", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const gets: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "GET" && req.url().endsWith(`/${resultId}/ai-analysis/recruitment`)) {
      gets.push(req.url());
    }
  });
  // 実際の生成を通して終わるまで待ってから、画面には別の画面で生成中のときの応答（409）を返す
  await page.route(`**/api/v1/admin/results/${resultId}/ai-analysis/recruitment`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AI_ALREADY_GENERATING",
          message: "AI 解説を生成中です。しばらくしてから再度お試しください",
          details: {},
        },
      }),
    });
  });
  await ai.genButton("recruitment").click();
  await expect(ai.loading).toBeVisible();
  await expect(ai.panel("recruitment")).toHaveAttribute("data-status", "generating");
  await expect(ai.genButton("recruitment")).toHaveCount(0);

  // 育成・定着のタブへ移っても、採用向けのパネルは隠れているだけで読み直しを続ける（§2.1）
  await ai.tab("training").click();
  await expect(ai.panel("recruitment")).toBeHidden();
  await ai.tab("recruitment").click();
  await expect(ai.view).toBeVisible({ timeout: 15_000 });
  await expect(ai.panel("recruitment")).toHaveAttribute("data-status", "completed");
  expect(gets.length).toBeGreaterThanOrEqual(1);
});

test("M7-ai-38 開いたときに生成中（別の画面で始まっている。11-6 §2.3.5）: 案内と生成中の表示（生成ボタンは無い）で 3 秒ごとに読み直し（GET …/recruitment）、その生成が失敗すると読み直しを止めて失敗の枠と生成ボタンを出す。押すと作り直して表示になる", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  aiGenerationElsewhere(adminOrg, resultId, "start");
  const gets = watchAiGets(page, resultId);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");
  await expect(panel).toHaveAttribute("data-status", "generating");
  await expect(panel.locator(".ai-intro")).toBeVisible();
  await expect(ai.loading).toBeVisible();
  await expect(ai.genButton("recruitment")).toHaveCount(0);

  // 読み直しは 3 秒ごと（応答を待ってから次を送るので、間隔は 3 秒を下回らない）
  await expect.poll(() => gets.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  expect(gets[1]! - gets[0]!).toBeGreaterThanOrEqual(POLL_INTERVAL_MS - POLL_JITTER_MS);

  // 別の画面の生成が失敗すると、次の読み直しで失敗の枠と生成ボタンに変わり、読み直しを止める
  aiGenerationElsewhere(adminOrg, resultId, "fail", "invalid_json");
  await expect(ai.fail).toHaveText(FAILED_INVALID_JSON, { timeout: 10_000 });
  await expect(panel).toHaveAttribute("data-status", "failed");
  await expect(ai.loading).toHaveCount(0);
  await expect(ai.genButton("recruitment")).toBeEnabled();
  const stoppedAt = gets.length;
  await page.waitForTimeout(POLL_INTERVAL_MS + 1_000);
  expect(gets).toHaveLength(stoppedAt);

  // 作り直す（この受験の氏名ではスタブが成功する）
  await ai.genButton("recruitment").click();
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveAttribute("data-status", "completed");
  await expect(ai.fail).toHaveCount(0);
});

test("M7-ai-38 読み直しが 10 分たっても終わらない（11-6 §2.3.4・§2.3.5。ブラウザの時計を進める）: 生成中の表示の代わりに T-29 の枠を出し、生成ボタンは出さない（状態は生成中のまま）", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  aiGenerationElsewhere(adminOrg, resultId, "start");
  const gets = watchAiGets(page, resultId);
  await page.clock.install();
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");
  await expect(ai.loading).toBeVisible();
  // 読み直しが始まってから（最初の GET が出てから）、ブラウザの時計を 10 分 30 秒進める（サーバの開始日時は今のままなので、
  // サーバは滞留とみなさず生成中を返す）
  await expect.poll(() => gets.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.clock.fastForward("10:30");
  await expect(ai.fail).toHaveText(POLLING_TIMEOUT, { timeout: 15_000 });
  await expect(ai.fail).toHaveAttribute("role", "alert");
  await expect(ai.loading).toHaveCount(0);
  await expect(ai.genButton("recruitment")).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-status", "generating");
  await expect(panel.locator(".ai-intro")).toBeVisible();
});

test("M7-ai-40 責任者の受験（職業が責任者で役職が未設定の受験と、役職を責任者にした受験）: AI 解説の領域も目次の「AI解説」も無い（目次は 7 つ）。採用向け・育成・定着の API は 409 AI_NOT_APPLICABLE、経年比較の GET は 200", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  // 役職を責任者にした受験（求職者の受験の役職を、画面と同じ API で変える。11-2 §3.6）
  const byRole = submitType(adminOrg.organizationId, "conductor");
  const patch = await page.request.patch(`/api/v1/admin/respondents/${byRole.respondentId}`, {
    data: { staffRole: "manager" },
  });
  expect(patch.status()).toBe(200);

  for (const [label, resultId] of [
    // seed の 8 番目（テストテスト 08）は職業コード 10「責任者」で、役職は未設定
    ["職業が責任者", seedExam(adminOrg, 8).resultId],
    ["役職を責任者にした", byRole.resultId],
  ] as const) {
    await openResultDetail(page, resultId);
    await expect(page.locator("#ai"), label).toHaveCount(0);
    expect(await bodyOrder(page), label).toEqual([
      "rd-head",
      "rsn-wrap",
      "rs2",
      "dialog",
      "dialog",
    ]);
    await expect(resultDetail(page).tocLinks).toHaveText([
      "概要",
      "16の特性",
      "リスク",
      "組織との相性",
      "人物像",
      "育て方",
      "接し方",
    ]);

    // API（§3.4）: 採用向け・育成・定着は GET・POST とも 409（K-21）。経年比較は GET が状態を返す（PR-7.9 は無効）
    const base = `/api/v1/admin/results/${resultId}/ai-analysis`;
    for (const [method, kind] of [
      ["GET", "recruitment"],
      ["POST", "recruitment"],
      ["GET", "training"],
      ["POST", "training"],
    ] as const) {
      const res =
        method === "GET"
          ? await page.request.get(`${base}/${kind}`)
          : await page.request.post(`${base}/${kind}`);
      expect(res.status(), `${label} ${method} ${kind}`).toBe(409);
      expect((await res.json()) as unknown, `${label} ${method} ${kind}`).toMatchObject({
        error: { code: "AI_NOT_APPLICABLE", message: "この受験では、この AI 解説は使えません" },
      });
    }
    const longitudinal = await page.request.get(`${base}/longitudinal`);
    expect(longitudinal.status(), label).toBe(200);
    expect((await longitudinal.json()) as unknown, label).toMatchObject({
      resultId,
      kind: "longitudinal",
      status: "not_generated",
      enabled: false,
    });
  }
});

test("M7-ai-42 失敗と作り直し: スタブの不正な JSON の氏名の受験で採用向けを生成 → 失敗の枠（T-18 に続く理由の文。role=alert）と生成ボタン → もう一度押すと作り直しの要求が出て（2 本目）、また失敗の枠。キーボードで押したときは、生成中・失敗の後とも焦点が選んでいるタブにある（body に落ちない）", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitNamed(adminOrg.organizationId, "__INVALID_JSON__");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");
  const posts = watchAiPosts(page, resultId);
  const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? "");

  // 1 本目（マウス）: 失敗の枠は生成ボタンのすぐ上（案内 → 失敗の枠 → 生成ボタン。§2.4.1・§2.3.4）
  await ai.genButton("recruitment").click();
  await expect(ai.fail).toHaveText(FAILED_INVALID_JSON);
  await expect(ai.fail).toHaveAttribute("role", "alert");
  await expect(panel).toHaveAttribute("data-status", "failed");
  await expect(ai.genButton("recruitment")).toBeEnabled();
  const start = await panel
    .locator(".ai-start > *")
    .evaluateAll((els) => els.map((el) => el.className));
  expect(start).toEqual(["ai-intro", "ai-fail", "ai-gen-btn"]);
  expect(posts).toHaveLength(1);

  // 2 本目（キーボード）: 押した生成ボタンは消えるので、焦点は選んでいるタブに移る。生成中は失敗の枠を出さない
  const release = await holdAiPost(page, resultId);
  await focusByKeyboard(ai.genButton("recruitment"));
  await page.keyboard.press("Enter");
  await expect(ai.loading).toBeVisible();
  await expect(ai.fail).toHaveCount(0);
  await expect(ai.genButton("recruitment")).toHaveCount(0);
  await expect(ai.tab("recruitment")).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  release();
  await expect(ai.fail).toHaveText(FAILED_INVALID_JSON);
  await expect(ai.genButton("recruitment")).toBeVisible();
  await expect(ai.loading).toHaveCount(0);
  await expect(ai.tab("recruitment")).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  expect(posts).toHaveLength(2);

  // 再読み込みしても失敗の枠と生成ボタン（状態は保存されている）
  await page.reload();
  await expectComparison(page, "none");
  await expect(ai.fail).toHaveText(FAILED_INVALID_JSON);
  await expect(ai.genButton("recruitment")).toBeVisible();
  expect(posts).toHaveLength(2);
});

/** 生成の要求のそのほかの失敗（11-6 §2.3.4。応答は API の形のまま page.route で返す。status 0 は通信の失敗） */
const OTHER_POST_FAILURES = [
  {
    label: "404 RESULT_NOT_FOUND",
    status: 404,
    code: "RESULT_NOT_FOUND",
    message: "診断結果が見つかりません",
    toast: true,
    locked: true,
    gets: 0,
  },
  {
    label: "503 AI_KIND_DISABLED",
    status: 503,
    code: "AI_KIND_DISABLED",
    message: "この AI 解説は準備中です",
    toast: true,
    locked: false,
    gets: 0,
  },
  {
    label: "409 AI_NOT_APPLICABLE",
    status: 409,
    code: "AI_NOT_APPLICABLE",
    message: "この受験では、この AI 解説は使えません",
    toast: true,
    locked: false,
    gets: 0,
  },
  {
    label: "500 INTERNAL_ERROR",
    status: 500,
    code: "INTERNAL_ERROR",
    message: "サーバ内部でエラーが発生しました",
    toast: false,
    locked: false,
    gets: 1,
  },
  {
    label: "通信の失敗",
    status: 0,
    code: "",
    message: "",
    toast: false,
    locked: false,
    gets: 1,
  },
] as const;

test("M7-ai-42 生成の要求のそのほかの失敗（11-6 §2.3.4・§2.3.5）: 404 は通知に応答の文を出して生成ボタンを押せなくし、503 AI_KIND_DISABLED・409 AI_NOT_APPLICABLE は通知に応答の文を出して状態を変えず、500 と通信の失敗は GET で 1 回確かめて生成ボタンに戻る。どれも失敗の枠を出さず、キーボードで押したときの焦点は選んでいるタブにある（body に落ちない）", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");
  const gen = ai.genButton("recruitment");
  const gets = watchAiGets(page, resultId);
  const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? "");

  for (const failure of OTHER_POST_FAILURES) {
    await openResultDetail(page, resultId);
    const pattern = `**/api/v1/admin/results/${resultId}/ai-analysis/recruitment`;
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (failure.status === 0) return route.abort("failed");
      return route.fulfill({
        status: failure.status,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: failure.code, message: failure.message, details: {} },
        }),
      });
    });
    const getsBefore = gets.length;
    await focusByKeyboard(gen);
    await page.keyboard.press("Enter");

    if (failure.toast) await expect(alertToast(page), failure.label).toHaveText(failure.message);
    await expect(gen, failure.label).toBeVisible();
    if (failure.locked) await expect(gen, failure.label).toBeDisabled();
    else await expect(gen, failure.label).toBeEnabled();
    await expect(panel, failure.label).toHaveAttribute("data-status", "not_generated");
    await expect(ai.fail, failure.label).toHaveCount(0);
    await expect(ai.loading, failure.label).toHaveCount(0);
    await expect(ai.tab("recruitment"), failure.label).toBeFocused();
    expect(await activeTag(), failure.label).not.toBe("BODY");
    expect(gets.length - getsBefore, failure.label).toBe(failure.gets);
    if (!failure.toast) await expect(alertToast(page), failure.label).toHaveCount(0);
    await page.unroute(pattern);
  }
});

/** リスクの結果詳細の表示名（11-4 §2.10） */
const RISK_LABELS = [
  "不祥事が発生する",
  "苦情を強く主張する",
  "メンタル面の不服が起こる",
  "不注意からミスが発生する",
  "退職時におけるトラブル発生",
  "コミュニケーションが原因で業務に支障がでる",
  "モチベーションの不足により就業辞退に繋がる",
];
/** 比較なしの文言（11-4 §2.6） */
const NO_COMPARISON = "右上で比較組織を選ぶと表示されます";

/** PDF のテキストと同じ形（NFKC・空白なし）にした文 */
const asPdfText = (text: string): string => text.normalize("NFKC").replace(/\s+/g, "");

/** 育て方・接し方の見出しとラベル（11-4 §2.13・§2.14。全画面・非表示のどちらの PDF にも載る） */
const LEARN_STYLE_LABELS = [
  "育成タイプ",
  "このタイプへの関わり方",
  "関わり方のコツ",
  "あなた（責任者・上司）のタイプ別の接し方",
].map(asPdfText);

/** 旧のセクション 5・6 の見出し（PR-7.8b で無くなった） */
const OLD_SECTION_HEADINGS = ["育成方法", "タイプ別の対処法"];

/**
 * PDF のテキスト。Chromium が埋め込む Noto Sans JP の ToUnicode は一部の漢字を康熙部首（例: 立 → ⽴）に写すため
 * NFKC で正規化し、中黒（・ → ‧ U+2027）と、NFKC では戻らない CJK 部首補助の字（長 → ⻑ U+2ED1）を戻し、行の折り返しに
 * 左右されないよう空白をすべて除く（08 D08-23 のテキスト抽出で日本語を確かめる）
 */
async function pdfText(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.normalize("NFKC").replaceAll("‧", "・").replaceAll("⻑", "長").replace(/\s+/g, "");
}

/** 要素の中の文字の節点（前後の空白を除いて空でないもの。上から） */
const textPieces = (root: Locator): Promise<string[]> =>
  root.evaluate((el) => {
    const pieces: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (text !== "") pieces.push(text);
    }
    return pieces;
  });

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

test("E-21 PDF: 2 モード、ファイル名、restricted の非表示、比較組織の引き継ぎ。育て方・接し方が載り、旧の見出しが無い（描画完了を待つグラフは 0 個）。全画面の AI 解説は採用向けの表示だけで、画面の採用向けの表示の文字がすべて載る（育成・定着のタブを表示していても採用向け。タブの行・生成ボタンは載らない。PR-7.12 まで）", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(240_000);
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  // 採用向けの AI 解説を completed にしておく（full には掲載、restricted には掲載しない）。画面の表示の文字を控えてから、
  // 育成・定着のタブを表示する（PR-7.12 までは、表示中のタブにかかわらず全画面の PDF に採用向けを載せる。11-6 §2.12）
  const ai = aiArea(page);
  await ai.genButton("recruitment").click();
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  const recruitmentPieces = (await textPieces(ai.view)).map(asPdfText);
  expect(recruitmentPieces.length).toBeGreaterThan(30);
  await ai.tab("training").click();
  await expect(ai.panel("training")).toBeVisible();

  // 比較組織を選んだ状態でダウンロード（合致度のカードの「組織全体（n人）と比べた近さ」で待つ）
  await page.getByLabel("比較組織").selectOption("organization");
  await expect(page.locator("#rs-gat .s")).toContainText("組織全体（");
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
  expect(fullText).toContain("組織内のポジション");
  expect(fullText).toContain("組織との合致度");
  for (const label of RISK_LABELS) expect(fullText).toContain(label);
  expect(fullText).toContain("色分けの目安");
  expect(fullText).not.toContain(NO_COMPARISON);
  expect(fullText).toContain("AI解説");
  expect(fullText).toContain("この人物の要約");
  expect(fullText).toContain("診断スコア(16特性・ソーシャルスタイル・リスク指標)");
  // 採用向けの表示（見出し帯・注意書き・判定チップ・要約・強みと注意点・質問・接し方・辞めそうなサイン・末尾）の文字がすべて載る
  expect(recruitmentPieces.filter((piece) => !fullText.includes(piece))).toEqual([]);
  // PR-7.12 まで、印刷用ページは採用向けの表示だけを置く（タブの行・生成前の案内・生成ボタン・育成・定着は描かない）
  expect(fullText).not.toContain("採用向けAI解説を生成");
  expect(fullText).not.toContain("育成・定着AI解説");
  expect(fullText).not.toContain(asPdfText(TRAINING_INTRO.title));
  // 育て方・接し方（11-4 §2.18。PR-7.8b）が載り、旧のセクション 5・6 の見出しは無い
  for (const label of LEARN_STYLE_LABELS) expect(fullText).toContain(label);
  for (const heading of OLD_SECTION_HEADINGS) expect(fullText).not.toContain(heading);

  const restricted = await downloadVia(page, "restricted");
  expect(restricted.filename).toBe(`result-${resultId.slice(0, 8)}-restricted.pdf`);
  expect(restricted.filename).not.toMatch(/テスト/);
  const restrictedText = await pdfText(restricted.bytes);
  // 評価の箱・合致度のカード・注意したいリスクのカード・リスクのセクション（と目次の「リスク」）と、AI 解説の領域（と目次の
  // 「AI解説」）が無い（11-4 §2.18）
  expect(restrictedText).not.toContain("組織との合致度");
  for (const label of RISK_LABELS) expect(restrictedText).not.toContain(label);
  expect(restrictedText).not.toContain("注意したいリスク");
  expect(restrictedText).not.toContain("色分けの目安");
  expect(restrictedText).not.toContain("AI解説");
  expect(restrictedText).not.toContain("この人物の要約");
  expect(restrictedText).not.toContain("診断スコア(16特性・ソーシャルスタイル・リスク指標)");
  expect(restrictedText).not.toContain(asPdfText("AI 採用・育成アドバイザー"));
  expect(restrictedText).not.toContain(asPdfText(CAUTION));
  // 組織内のポジションは印字する（K-15、06 D06-26）。フッターに非表示の注記
  expect(restrictedText).toContain("組織内のポジション");
  expect(restrictedText).toContain("評価・合致度・リスク非表示");
  // 育て方・接し方は非表示の PDF でも消さない（11-4 §2.18）
  for (const label of LEARN_STYLE_LABELS) expect(restrictedText).toContain(label);
  for (const heading of OLD_SECTION_HEADINGS) expect(restrictedText).not.toContain(heading);

  // 比較組織を外すと、比較項目は固定文言のまま印字する（06 D06-16）
  await page.getByLabel("比較組織").selectOption("");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await expect(page.locator("dialog[open]").getByTestId("pdf-comparison")).toHaveText(
    "比較組織: 未選択",
  );
  await page.keyboard.press("Escape");
  const noScope = await pdfText((await downloadVia(page, "full")).bytes);
  expect(noScope).toContain(NO_COMPARISON);
});

test("E-21 印刷用ページはトークンなしで 404（ログイン画面へ転送しない）、検索避けと Referer 抑止のヘッダー", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  // 管理者 Cookie があってもトークンが無ければ 404（08 I-47 (h)）
  const res = await page.request.get(`/admin/results/${resultId}/print?mode=full`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(404);
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});
