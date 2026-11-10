// M7-zaiseki-31〜36・41（組織内分類の分）・42（組織内分類の分）組織内分類の画面（11-3 §5.3。§2.1〜§2.12・§2.18）。
// 組織は seed:local と同じ構成（adminOrg。01〜08 は求職者、09・10 は既存スタッフで 10 は除外中。チームは 01・02・05・09 が A、
// 03・04・07 が B、06・08・10 が未設定）。タイプは seed の回答で決まり、オーナーの人は 9 人（除外中の 10 を数えない）:
// アナリティカル 2（04 れい・07 あいり）、ドライビング 3（03・08 ひなた、05 まい）、エミアブル 0、エクスプレッシブ 4（01・02・09 はるか、
// 06 のぞみ）。区分は画面と同じ API（PATCH /api/v1/admin/respondents/{id}）で変える。チームが 1 種類の組織は受験の無い組織に
// 1 人を送信して作る。在籍・退職の画面の分（M7-zaiseki-41・42 の残り）は PR-7.7b
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Browser, Page } from "@playwright/test";

import {
  expect,
  loginViaUi,
  obAbout,
  obCell,
  obCount,
  obFold,
  obHeading,
  obHelp,
  obLegend,
  obPanel,
  obQuadrant,
  obRoot,
  obSeg,
  obTeam,
  obTotal,
  rectOf,
  rowOf,
  seedEmptyOrg,
  seedExam,
  seedName,
  submitType,
  test,
  type AdminOrg,
} from "../support/admin-ui";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";

const readJson = <T>(path: string): T =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8"),
  ) as T;

/** 付録C の文言マスタ（生成物）。タイプの特徴・適性・適性職種、分類の説明文・位置の説明 */
const TYPE_TEXTS = new Map(
  readJson<{
    items: Array<{
      key: string;
      aptitudeHeading: string;
      characteristics: string;
      suitableJobs: string;
    }>;
  }>("lib/masters/data/texts/type-texts.json").items.map((item) => [item.key, item]),
);
const CLASSIFICATIONS = new Map(
  readJson<{
    items: Array<{
      socialStyleKey: string;
      description: string;
      characters: Array<{ aptitudeType: string; positionDescription: string }>;
    }>;
  }>("lib/masters/data/texts/classifications.json").items.map((item) => [
    item.socialStyleKey,
    item,
  ]),
);
const typeText = (type: AptitudeTypeKey) => {
  const text = TYPE_TEXTS.get(type);
  if (!text) throw new Error(`タイプの文言がありません: ${type}`);
  return text;
};

const QUADRANT_NAMES: Readonly<Record<SocialStyleKey, readonly [string, string]>> = {
  analytical: ["アナリティカル", "分析型"],
  driving: ["ドライビング", "実行型"],
  amiable: ["エミアブル", "温和型"],
  expressive: ["エクスプレッシブ", "直感型"],
};
const QUADRANT_ORDER: readonly SocialStyleKey[] = [
  "analytical",
  "driving",
  "amiable",
  "expressive",
];

/** マップの順の 16 キャラクターと印（11-3 §2.4 の表。矢印は印の文言の前） */
const CELLS: ReadonlyArray<readonly [AptitudeTypeKey, string]> = [
  ["scientist", "典型"],
  ["professional", "→ドライビング寄り"],
  ["artist", "↓エミアブル寄り"],
  ["creator", "↘中央寄り"],
  ["reviewer", "←アナリティカル寄り"],
  ["pioneer", "典型"],
  ["controller", "↙中央寄り"],
  ["actor", "↓エクスプレッシブ寄り"],
  ["specialist", "↑アナリティカル寄り"],
  ["conductor", "↗中央寄り"],
  ["follower", "典型"],
  ["generalist", "→エクスプレッシブ寄り"],
  ["attendant", "↖中央寄り"],
  ["promoter", "↑ドライビング寄り"],
  ["receptionist", "←エミアブル寄り"],
  ["freelancer", "典型"],
];

const NOTE =
  "キャラクターを押すと、説明と回答者一覧を表示します。位置が外側の角に近いほどその分類の典型、隣の分類に近いほどその分類寄りです。同じ人が複数回受験した場合は、最新の結果で1人として数えています。";

const percent = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

async function openClassification(page: Page): Promise<void> {
  await page.goto("/admin/classification");
  await expect(obRoot(page)).toBeVisible();
}

/** 別のブラウザのコンテキストでログインし、組織内分類を開く */
async function openAs(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await loginViaUi(page, email);
  await openClassification(page);
  return page;
}

/** 区分を変える（画面と同じ API。PATCH /api/v1/admin/respondents/{id}） */
async function patchEmployment(page: Page, org: AdminOrg, index: number, data: unknown) {
  const res = await page.request.patch(
    `/api/v1/admin/respondents/${seedExam(org, index).respondentId}`,
    { data: { employment: data } },
  );
  expect(res.status()).toBe(200);
}

/** 凡例と象限のピルの人数と割合 */
async function expectQuadrantCounts(
  page: Page,
  counts: Readonly<Record<SocialStyleKey, number>>,
): Promise<void> {
  const total = QUADRANT_ORDER.reduce((sum, key) => sum + counts[key], 0);
  await expect(obTotal(page).count).toHaveText(String(total));
  for (const key of QUADRANT_ORDER) {
    const n = counts[key];
    await expect(obLegend(page, key), key).toHaveText(
      `${QUADRANT_NAMES[key][0]}${n}人${percent(n, total)}%`,
    );
    await expect(obCount(obHeading(page, key)), key).toHaveText(String(n));
  }
  await expect(page.locator(".ob-bar i")).toHaveCount(
    QUADRANT_ORDER.filter((key) => counts[key] > 0).length,
  );
}

async function expectModeCounts(page: Page, all: number, stay: number, left: number) {
  await expect(obSeg(page, "all")).toHaveText(`全員 ${all}`);
  await expect(obSeg(page, "stay")).toHaveText(`在籍 ${stay}`);
  await expect(obSeg(page, "left")).toHaveText(`退職 ${left}`);
}

test("M7-zaiseki-31 見出し・集計カード（回答者 9 人。除外中の 10 を数えない）・凡例・割合バー・チームの選択肢・説明文と軸。利用履歴ボタンが無く、チームが 1 種類の組織では選択欄が無い", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("組織内分類");
  await expect(obHelp(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "利用履歴" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "組織内分類マップ" })).toBeVisible();

  await expect(obTotal(page).label).toHaveText("回答者");
  await expectQuadrantCounts(page, { analytical: 2, driving: 3, amiable: 0, expressive: 4 });
  // 割合バーの帯は分類の順で、主色（人数 0 のエミアブルは帯を置かない）
  await expect(page.locator(".ob-bar i").nth(0)).toHaveCSS("background-color", "rgb(65, 166, 123)");
  await expect(page.locator(".ob-bar i").nth(1)).toHaveCSS(
    "background-color",
    "rgb(149, 112, 161)",
  );
  await expect(page.locator(".ob-bar i").nth(2)).toHaveCSS("background-color", "rgb(229, 179, 83)");
  await expectModeCounts(page, 9, 1, 0);
  await expect(obSeg(page, "all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "集計の対象" })).toBeVisible();

  // チーム（2 種類以上なので選択欄がある）。すべて・A→Z・未設定の順
  await expect(page.getByRole("combobox", { name: "チーム" })).toBeVisible();
  await expect(obTeam(page).locator("option")).toHaveText([
    "すべて",
    "Aチーム",
    "Bチーム",
    "未設定",
  ]);
  await expect(obTeam(page)).toHaveValue("");

  await expect(page.locator(".ob-note")).toHaveText(NOTE);
  await expect(page.locator(".ob-ax-x span")).toHaveText(["← 意見を聞く", "意見を主張する →"]);
  await expect(page.locator(".ob-ax-y span")).toHaveText(["感情表現を抑える", "感情を表す"]);
  await expect(page.locator(".ob-ax-x")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".ob-ax-y")).toHaveAttribute("aria-hidden", "true");

  // チームが 1 種類（全員未設定）の組織では選択欄を描かない
  const single = seedEmptyOrg();
  submitType(single.organizationId, "pioneer");
  const singlePage = await openAs(browser, single.ownerEmail);
  await expect(obTotal(singlePage).count).toHaveText("1");
  await expect(singlePage.locator(".ob-team")).toHaveCount(0);
  await singlePage.context().close();
});

test("M7-zaiseki-32 チームと対象: Aチームで人数・凡例・マップ・全員／在籍／退職の数が変わり、在籍・退職でラベルと人数が変わる（求職者は入らない）", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  // 01（Aチームの求職者・はるか）を退職にする。09（Aチームの既存スタッフ・はるか）は在籍
  await patchEmployment(page, adminOrg, 1, {
    status: "left",
    hiredOn: "2025-04-01",
    leftOn: "2026-03-31",
  });
  await openClassification(page);
  await expectModeCounts(page, 9, 1, 1);

  await obTeam(page).selectOption("A");
  await expectQuadrantCounts(page, { analytical: 0, driving: 1, amiable: 0, expressive: 3 });
  await expectModeCounts(page, 4, 1, 1);
  await expect(obCount(obCell(page, "attendant"))).toHaveText("3");
  await expect(obCount(obCell(page, "pioneer"))).toHaveText("0");

  // 在籍: 区分が在籍の人だけ（09）。求職者（02・05）は入らない
  await obSeg(page, "stay").click();
  await expect(obSeg(page, "stay")).toHaveAttribute("aria-pressed", "true");
  await expect(obSeg(page, "all")).toHaveAttribute("aria-pressed", "false");
  await expect(obTotal(page).label).toHaveText("在籍中の人");
  await expectQuadrantCounts(page, { analytical: 0, driving: 0, amiable: 0, expressive: 1 });
  await expect(obCount(obCell(page, "actor"))).toHaveText("0");

  // 退職: 区分が退職の人だけ（01）
  await obSeg(page, "left").click();
  await expect(obTotal(page).label).toHaveText("退職した人");
  await expectQuadrantCounts(page, { analytical: 0, driving: 0, amiable: 0, expressive: 1 });

  // すべてのチームの在籍: 求職者 7 人は入らない
  await obTeam(page).selectOption("");
  await obSeg(page, "stay").click();
  await expect(obTotal(page).count).toHaveText("1");
  await expectModeCounts(page, 9, 1, 1);
  await obSeg(page, "all").click();
  await expect(obTotal(page).label).toHaveText("回答者");
  await expect(obTotal(page).count).toHaveText("9");
});

test("M7-zaiseki-33 マップ: 4 象限の位置、下段の見出しは一覧の下・右列の見出しは右寄せで折りたたみが中央の側、16 枠の順と印、0 人の枠と最多の枠の色、折りたたみ", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const box = Object.fromEntries(
    await Promise.all(
      QUADRANT_ORDER.map(async (key) => [key, await rectOf(obQuadrant(page, key))] as const),
    ),
  );
  // 左上 アナリティカル、右上 ドライビング、左下 エミアブル、右下 エクスプレッシブ
  expect(box.driving!.left).toBeGreaterThan(box.analytical!.right - 1);
  expect(Math.abs(box.driving!.top - box.analytical!.top)).toBeLessThan(1);
  expect(box.amiable!.top).toBeGreaterThan(box.analytical!.bottom - 1);
  expect(Math.abs(box.amiable!.left - box.analytical!.left)).toBeLessThan(1);
  expect(box.expressive!.left).toBeGreaterThan(box.amiable!.right - 1);
  expect(box.expressive!.top).toBeGreaterThan(box.driving!.bottom - 1);

  for (const key of QUADRANT_ORDER) {
    const q = obQuadrant(page, key);
    const header = await rectOf(q.locator(".ob-qhr"));
    const grid = await rectOf(q.locator(".ob-g"));
    const bottomRow = key === "amiable" || key === "expressive";
    const rightColumn = key === "driving" || key === "expressive";
    // 見出しの行はマップの外側の縁（上の段は一覧の上、下の段は一覧の下）
    if (bottomRow) expect(header.top, key).toBeGreaterThan(grid.bottom);
    else expect(header.bottom, key).toBeLessThan(grid.top);
    // 右の列は見出しが右寄せで、折りたたみのボタンは左（マップの中央の側）。左の列はその逆
    const heading = await rectOf(obHeading(page, key));
    const fold = await rectOf(obFold(page, key));
    if (rightColumn) expect(fold.right, key).toBeLessThan(heading.left);
    else expect(fold.left, key).toBeGreaterThan(heading.right);
    await expect(q.locator(".ob-qh .nm"), key).toHaveText(QUADRANT_NAMES[key][0]);
    await expect(q.locator(".ob-qh .jp"), key).toHaveText(QUADRANT_NAMES[key][1]);
    await expect(obHeading(page, key)).toHaveAttribute(
      "aria-label",
      new RegExp(`^${QUADRANT_NAMES[key][0]}（${QUADRANT_NAMES[key][1]}）の説明 \\d+人$`),
    );
  }

  // 16 枠の順と印・矢印（矢印は読み上げない）
  const ids = await page
    .locator("[data-testid^=ob-cell-]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(ids).toEqual(CELLS.map(([type]) => `ob-cell-${type}`));
  for (const [type, lean] of CELLS) {
    await expect(obCell(page, type).locator(".lean"), type).toHaveText(lean);
  }
  await expect(obCell(page, "professional").locator(".lean span")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(obCell(page, "scientist")).toHaveAttribute(
    "aria-label",
    "あいり サイエンティストタイプ 典型 1人",
  );
  await expect(obCell(page, "professional")).toHaveAttribute(
    "aria-label",
    "まどか プロフェッショナルタイプ ドライビング寄り 0人",
  );

  // 0 人の枠は #F7F9FA でイラストを白黒、最多（はるか 3 人）の枠はその分類の中間色 #F6E2B8
  await expect(obCell(page, "follower")).toHaveClass(/\bz\b/);
  await expect(obCell(page, "follower")).toHaveCSS("background-color", "rgb(247, 249, 250)");
  await expect(obCell(page, "follower").locator("img")).toHaveCSS("filter", "grayscale(1)");
  await expect(obCell(page, "follower").locator("img")).toHaveAttribute("alt", "");
  await expect(obCount(obCell(page, "attendant"))).toHaveText("3");
  await expect(obCell(page, "attendant")).toHaveCSS("background-color", "rgb(246, 226, 184)");
  await expect(obCell(page, "attendant").locator("img")).toHaveCSS("filter", "none");

  // 折りたたみ: 一覧が隠れ、aria-expanded が変わる
  const fold = obFold(page, "analytical");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toHaveAttribute("aria-label", "アナリティカルの一覧を開閉");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(obQuadrant(page, "analytical").locator(".ob-g")).toBeHidden();
  await expect(obCell(page, "scientist")).toBeHidden();
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(obCell(page, "scientist")).toBeVisible();
});

test("M7-zaiseki-34 分類のパネル: 凡例と見出しから開き、ラベル・見出し・人数と割合・説明文・4 タイプのボタン・回答者の表。0 人の文言。×・Esc・パネルの外で閉じて焦点が戻り、背景は暗くならない", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const panel = obPanel(page);

  // 凡例から開く
  const legend = obLegend(page, "driving");
  await legend.click();
  await expect(panel).toBeVisible();
  await expect(panel.locator(".hd .q")).toHaveText("実行型");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("ドライビング");
  await expect(panel).toHaveAccessibleName("ドライビング");
  await expect(panel.locator(".hd .sub")).toHaveText("3人（全体の33%）");
  await expect(panel.locator(".tx2")).toHaveText(CLASSIFICATIONS.get("driving")!.description);
  await expect(panel.locator(".tx2")).toHaveText(/^ドライビングタイプは/);
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText([
    "この分類の4タイプ",
    "回答者3人",
  ]);
  const types = panel.locator(".types button");
  await expect(types.locator("b")).toHaveText([
    "えりか　レビュワー",
    "ひなた　パイオニア",
    "なつき　コントローラー",
    "まい　アクター",
  ]);
  await expect(types.locator("b + span")).toHaveText([
    "アナリティカル寄り",
    "典型",
    "中央寄り",
    "エクスプレッシブ寄り",
  ]);
  await expect(types.locator("em")).toHaveText(["0", "2", "0", "1"]);
  await expect(panel.locator("thead th")).toHaveText([
    "お名前",
    "職業",
    "チーム",
    "受験日",
    "電話番号",
  ]);
  await expect(panel.locator("tbody tr")).toHaveCount(3);
  await expect(panel.locator("tbody td.dt").first()).toHaveText(/^\d{4}\/\d{2}\/\d{2}$/);
  await expect(panel.getByRole("button", { name: "閉じる" })).toBeFocused();
  // 背景を暗くしない
  const backdrop = await panel.evaluate((el) => getComputedStyle(el, "::backdrop").backgroundColor);
  expect(backdrop).toBe("rgba(0, 0, 0, 0)");
  // ×で閉じ、凡例に焦点が戻る
  await panel.getByRole("button", { name: "閉じる" }).click();
  await expect(panel).toBeHidden();
  await expect(legend).toBeFocused();

  // 見出しのボタンから開き、Esc で閉じる
  const heading = obHeading(page, "analytical");
  await heading.click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("アナリティカル");
  await expect(panel.locator(".hd .sub")).toHaveText("2人（全体の22%）");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(heading).toBeFocused();

  // パネルの外（左の余白）を押して閉じる。人数 0 の分類は「0人（全体の0%）」と 0 人の文言
  const amiable = obHeading(page, "amiable");
  await amiable.click();
  await expect(panel.locator(".hd .sub")).toHaveText("0人（全体の0%）");
  await expect(panel.locator(".empty")).toHaveText("この分類の回答者はまだいません。");
  await expect(panel.locator("table")).toHaveCount(0);
  await page.mouse.click(300, 450);
  await expect(panel).toBeHidden();
  await expect(amiable).toBeFocused();

  // 今の人数が 0（退職 0 人）なら「（全体の…）」を付けない
  await obSeg(page, "left").click();
  await expect(obTotal(page).count).toHaveText("0");
  await obLegend(page, "analytical").click();
  await expect(panel.locator(".hd .sub")).toHaveText("0人");
  await expect(panel.locator(".empty")).toHaveText("この分類の回答者はまだいません。");
  await page.keyboard.press("Escape");
});

test("M7-zaiseki-35 キャラクターのパネル: 位置の箱・特徴（なつきの文が 1 回）・適性・適性職種・回答者の表（氏名はリンクでない）。4 タイプのボタンで切り替えると本文が先頭に戻り × に焦点", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const panel = obPanel(page);

  // ひなた（パイオニア。03・08 の 2 人）
  const cell = obCell(page, "pioneer");
  await cell.click();
  await expect(panel.locator(".hd .q")).toHaveText("ドライビング（実行型）");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("ひなた");
  await expect(panel.locator(".hd .sub")).toHaveText("パイオニアタイプ");
  await expect(panel.locator(".hd img")).toHaveAttribute("alt", "");
  await expect(panel.locator(".pos b")).toHaveText("典型");
  const pioneerPosition = CLASSIFICATIONS.get("driving")!.characters.find(
    (c) => c.aptitudeType === "pioneer",
  )!.positionDescription;
  await expect(panel.locator(".pos p")).toHaveText(pioneerPosition);
  await expect(panel.locator(".pos .mini i")).toHaveCount(16);
  await expect(panel.locator(".pos .mini")).toHaveAttribute("aria-hidden", "true");
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText(["特徴", "適性", "回答者2人"]);
  const pioneer = typeText("pioneer");
  await expect(panel.locator(".tx2").nth(0)).toHaveText(pioneer.characteristics);
  await expect(panel.locator(".fit")).toHaveText(pioneer.aptitudeHeading.replace(/[<>]/g, ""));
  await expect(panel.locator(".fit")).toHaveText("自己実現を目指す仕事に適性があります");
  await expect(panel.locator(".tx2").nth(1)).toHaveText(pioneer.suitableJobs);
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel.locator("tbody td.nm")).toHaveText([seedName(8), seedName(3)]);
  await expect(panel.locator("table a")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();

  // なつき（コントローラー）: 特徴の文が 1 回だけ（K-32 ⑧）。人数 0 は 0 人の文言
  await obCell(page, "controller").click();
  const characteristics = await panel.locator(".tx2").nth(0).textContent();
  expect(characteristics?.split("組織のリーダー的役割を果たすことができます。").length).toBe(2);
  expect(characteristics?.startsWith("組織のリーダー的役割を果たすことができます。")).toBe(true);
  await expect(panel.locator(".pos b")).toHaveText("中央寄り");
  await expect(panel.locator(".empty")).toHaveText("この分類の回答者はまだいません。");
  await page.keyboard.press("Escape");

  // 本文がはみ出す画面の高さで、分類のパネルの本文を下まで動かし、4 タイプのボタンで切り替える
  await page.setViewportSize({ width: 1440, height: 500 });
  const opener = obLegend(page, "expressive");
  await opener.click();
  const body = panel.locator(".bd");
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await panel.locator(".types button").filter({ hasText: "はるか" }).click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("はるか");
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(panel.getByRole("button", { name: "閉じる" })).toBeFocused();
  // 閉じると最初に開いた要素（凡例）に焦点が戻る
  await panel.getByRole("button", { name: "閉じる" }).click();
  await expect(opener).toBeFocused();
});

test("M7-zaiseki-36 組織内分類とは: 見出しと本文（改行を保つ）、Esc と閉じるボタンで閉じ、背景を押しても閉じない。閉じると「組織内分類とは？」に焦点", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const about = obAbout(page);
  await obHelp(page).click();
  await expect(about).toBeVisible();
  await expect(about.getByRole("heading", { level: 2 })).toHaveText("組織内分類とは");
  await expect(about).toHaveAccessibleName("組織内分類とは");
  const body = about.locator(".tx");
  await expect(body).toHaveCSS("white-space", "pre-wrap");
  const text = (await body.textContent()) ?? "";
  expect(text.split("\n")).toHaveLength(11);
  expect(text).toMatch(
    /^組織内分類とは、スタッフの特性を 「 感情表現を抑える ↔感情を表す」 と 「意見を聞く ↔ 意見を主張する」 の2つの軸で整理し、/,
  );
  expect(text.endsWith("組織は 安定しながら成長し続ける ことができます。")).toBe(true);
  await expect(about.getByRole("button", { name: "閉じる" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(obHelp(page)).toBeFocused();

  // 背景（画面の隅）を押しても閉じない
  await obHelp(page).click();
  await expect(about).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(about).toBeVisible();
  await about.getByRole("button", { name: "閉じる" }).click();
  await expect(about).toBeHidden();
  await expect(obHelp(page)).toBeFocused();
});

test("M7-zaiseki-41（組織内分類の分）チーム・対象・折りたたみはサイドメニューの移動で残り、再読み込みで既定に戻る。選んだチームの人を回答一覧で移すと「すべて」に戻る", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const sidebar = page.getByRole("navigation", { name: "メインメニュー" });
  await obTeam(page).selectOption("A");
  await obSeg(page, "stay").click();
  await obFold(page, "analytical").click();
  await expect(obFold(page, "analytical")).toHaveAttribute("aria-expanded", "false");

  await sidebar.getByRole("link", { name: "回答一覧" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await expect(obRoot(page)).toBeVisible();
  await expect(obTeam(page)).toHaveValue("A");
  await expect(obSeg(page, "stay")).toHaveAttribute("aria-pressed", "true");
  await expect(obFold(page, "analytical")).toHaveAttribute("aria-expanded", "false");
  await expect(obFold(page, "driving")).toHaveAttribute("aria-expanded", "true");
  await expect(obTotal(page).label).toHaveText("在籍中の人");

  // 再読み込みで既定（すべて・全員・押していない）に戻る
  await page.reload();
  await expect(obTeam(page)).toHaveValue("");
  await expect(obSeg(page, "all")).toHaveAttribute("aria-pressed", "true");
  await expect(obFold(page, "analytical")).toHaveAttribute("aria-expanded", "true");

  // Bチーム（03・04・07）を選び、回答一覧でその 3 人を Aチームに移してから戻ると「すべて」に戻る（K-20 (3)）
  await obTeam(page).selectOption("B");
  await expect(obTotal(page).count).toHaveText("3");
  await sidebar.getByRole("link", { name: "回答一覧" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  for (const index of [3, 4, 7]) {
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          r.url().includes(`/api/v1/admin/respondents/${seedExam(adminOrg, index).respondentId}`),
      ),
      rowOf(page, seedName(index)).getByRole("combobox").selectOption("A"),
    ]);
  }
  await sidebar.getByRole("link", { name: "組織内分類" }).click();
  await expect(obRoot(page)).toBeVisible();
  await expect(obTeam(page)).toHaveValue("");
  await expect(obTeam(page).locator("option")).toHaveText(["すべて", "Aチーム", "未設定"]);
  await expect(obTotal(page).count).toHaveText("9");
});

test("M7-zaiseki-42（組織内分類の分）オーナー以外には既存スタッフ（テストテスト 09）がどのパネルの回答者にも出ず回答者 8 人、オーナーには出る（K-29）", async ({
  page,
  browser,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  // 09 のタイプはオーナーの GET /api/v1/admin/classification で調べる
  const res = await page.request.get("/api/v1/admin/classification");
  expect(res.status()).toBe(200);
  const { people } = (await res.json()) as {
    people: Array<{ name: string; aptitudeType: AptitudeTypeKey }>;
  };
  const executive = people.find((p) => p.name === seedName(9));
  if (!executive) throw new Error("オーナーの応答に既存スタッフがいません");

  // オーナー: 09 のキャラクターのパネルに出る
  await openClassification(page);
  await expect(obTotal(page).count).toHaveText("9");
  await obCell(page, executive.aptitudeType).click();
  await expect(
    obPanel(page)
      .locator("tbody td.nm")
      .filter({ hasText: seedName(9) }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");

  // オーナー以外: 回答者 8 人。4 つの分類のパネル（すべての人）にも、09 のキャラクターのパネルにも出ない
  const adminPage = await openAs(browser, adminOrg.adminEmail);
  await expect(obTotal(adminPage).count).toHaveText("8");
  const panel = obPanel(adminPage);
  let rows = 0;
  for (const key of QUADRANT_ORDER) {
    await obLegend(adminPage, key).click();
    await expect(panel).toBeVisible();
    rows += await panel.locator("tbody tr").count();
    await expect(panel.locator("tbody td.nm").filter({ hasText: seedName(9) })).toHaveCount(0);
    await adminPage.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
  expect(rows).toBe(8);
  await obCell(adminPage, executive.aptitudeType).click();
  await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(panel.locator("tbody td.nm").filter({ hasText: seedName(9) })).toHaveCount(0);
  await adminPage.context().close();
});
