// M7-zaiseki-48 アクセシビリティと焦点の見た目（K-49・K-50）、M7-zaiseki-43 狭い幅（K-22）の組織内分類の分（11-3 §5.3。§2.10・
// §2.12・§2.19・§2.22）。11 総論 8.5 の組織内分類の 2 件（キャラクターのパネルの本文 div.bd の焦点の枠と、axe の
// scrollable-region-focusable）もここで確かめる。axe は color-contrast も検査し、対象から外すのは押せない状態の表示と文字のロゴ
// 「適性検査」だけ（expectAccessibleAdmin。組織内分類に押せない状態の表示は無い）。
// ページ全体の狭い幅（390×844・1000×800）は、管理画面の最小幅 1280px を外す PR-7.13a が入るまで本文の幅が 900px 以下にならない
// （今の枠では画面 1280px 以上で本文の幅は約 977〜1200px。1440×900 では約 1152px）ので fixme にする（11 総論 5.1、11-3 §4.4）。
// それまでは 1440×900 のまま .ob-root の幅を直接狭くした部品の形で確かめる。最上層に出る詳細パネルと「組織内分類とは」は画面の幅で
// 大きさが決まるので、390×844 でも今確かめる。区分は画面と同じ API（PATCH /api/v1/admin/respondents/{id}）で変える
import type { Locator, Page } from "@playwright/test";

import {
  activeOutline,
  COMMON_FOCUS_RING,
  expect,
  expectAccessibleAdmin,
  expectNoHorizontalScroll,
  focusByKeyboard,
  loginViaUi,
  OB_ROOT_OUTLINE,
  obAbout,
  obCell,
  obFold,
  obHeading,
  obHelp,
  obLegend,
  obPanel,
  obQuadrant,
  obRoot,
  obSeg,
  obTeam,
  rectOf,
  seedExam,
  test,
  type AdminOrg,
} from "../support/admin-ui";
import type { SocialStyleKey } from "@/lib/scoring/types";

/** PR-7.13a で外す fixme の理由（11 総論 5.1） */
const NARROW_FIXME =
  "管理画面の最小幅 1280px を外す PR-7.13a まで、本文の幅が 900px 以下にならない（11 総論 5.1）";
/** 本文 358px（PR-7.13a のあとの 390×844）で凡例の 2 列が本文を超える件（11 総論 8.5。残る） */
const LEGEND_FIXME =
  "参照元の値の凡例（本文 900px 以下で 2 列・各列は中身の幅・折り返さない）は、本文の幅が約 435px より狭いと本文を超える（今の代わりの書体で測った値。Inter を読み込む PR-7.13a のあとに測り直す）。PR-7.13a で確かめて扱いを決める（11 総論 8.5）";

const QUADRANT_ORDER: readonly SocialStyleKey[] = [
  "analytical",
  "driving",
  "amiable",
  "expressive",
];

async function openClassification(page: Page): Promise<void> {
  await page.goto("/admin/classification");
  await expect(obRoot(page)).toBeVisible();
}

/** 01 を退職（入社日・退職日あり）にする。09（既存スタッフ）は在籍のまま。エミアブルは 0 人で 0 人の枠がある */
async function prepareModes(page: Page, org: AdminOrg): Promise<void> {
  const res = await page.request.patch(
    `/api/v1/admin/respondents/${seedExam(org, 1).respondentId}`,
    { data: { employment: { status: "left", hiredOn: "2025-04-01", leftOn: "2026-03-31" } } },
  );
  expect(res.status()).toBe(200);
}

/** .ob-root の幅を直接変える（本文の幅のコンテナクエリを確かめる。§2.19） */
async function setBodyWidth(page: Page, width: number | null): Promise<void> {
  await obRoot(page).evaluate((el, w) => {
    (el as HTMLElement).style.width = w === null ? "" : `${w}px`;
  }, width);
}

/** .ob-root の中身が横にはみ出さない（中のどの要素の右端も .ob-root の右端を超えない） */
async function expectInsideBody(page: Page, label: string): Promise<void> {
  const over = await obRoot(page).evaluate((root) => {
    const right = root.getBoundingClientRect().right;
    let max = 0;
    for (const el of root.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) max = Math.max(max, r.right - right);
    }
    return { max, scroll: root.scrollWidth - root.clientWidth };
  });
  expect(over.max, label).toBeLessThanOrEqual(0.5);
  expect(over.scroll, label).toBeLessThanOrEqual(0);
}

const css = (locator: Locator, property: string) =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

const size = async (locator: Locator) => {
  const r = await rectOf(locator);
  return [Math.round(r.right - r.left), Math.round(r.bottom - r.top)];
};

test("M7-zaiseki-48 1440×900 の組織内分類（全員・在籍・退職・Aチーム・0 人の枠）、4 分類それぞれの分類とキャラクターのパネル、「組織内分類とは」で axe の重大・深刻な違反が無い", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await prepareModes(page, adminOrg);
  await openClassification(page);
  await expect(obCell(page, "follower")).toHaveClass(/\bz\b/);
  await expectAccessibleAdmin(page, "組織内分類（全員）");
  await obSeg(page, "stay").click();
  await expectAccessibleAdmin(page, "組織内分類（在籍）");
  await obSeg(page, "left").click();
  await expectAccessibleAdmin(page, "組織内分類（退職）");
  await obSeg(page, "all").click();
  await obTeam(page).selectOption("A");
  await expectAccessibleAdmin(page, "組織内分類（Aチーム）");
  await obTeam(page).selectOption("");

  const panel = obPanel(page);
  for (const key of QUADRANT_ORDER) {
    await obLegend(page, key).click();
    await expect(panel).toBeVisible();
    await expectAccessibleAdmin(page, `分類のパネル（${key}）`);
    // その分類の最初のキャラクターのパネル（4 タイプのボタンで切り替える）
    await panel.locator(".types button").first().click();
    await expect(panel.locator(".pos")).toBeVisible();
    await expectAccessibleAdmin(page, `キャラクターのパネル（${key} の左上）`);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }

  await obHelp(page).click();
  await expect(obAbout(page)).toBeVisible();
  await expectAccessibleAdmin(page, "組織内分類とは");
  await page.keyboard.press("Escape");
});

test("M7-zaiseki-48・43 390×844: 詳細パネルは画面の幅いっぱいで電話番号の列が無く、「組織内分類とは」は画面の幅 − 32px。axe の違反が無く、押していない象限は畳まれている", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);

  // 画面の幅 700px 以下では押していない象限を畳む（§2.10）。押すと開く
  for (const key of QUADRANT_ORDER) {
    await expect(obFold(page, key), key).toHaveAttribute("aria-expanded", "false");
    await expect(obQuadrant(page, key).locator(".ob-g"), key).toBeHidden();
  }
  await obFold(page, "driving").click();
  await expect(obFold(page, "driving")).toHaveAttribute("aria-expanded", "true");
  await expect(obCell(page, "pioneer")).toBeVisible();

  // 分類のパネル（画面の幅いっぱい。上部の余白 18px 16px 14px）
  const panel = obPanel(page);
  await obLegend(page, "driving").click();
  await expect(panel).toBeVisible();
  const panelBox = await rectOf(panel);
  expect(panelBox.left).toBe(0);
  expect(panelBox.right).toBe(390);
  expect(await css(panel.locator(".hd"), "padding")).toBe("18px 16px 14px");
  await expect(panel.locator("thead th")).toHaveText([
    "お名前",
    "職業",
    "チーム",
    "受験日",
    "電話番号",
  ]);
  await expect(panel.locator("thead th.tl")).toBeHidden();
  await expect(panel.locator("tbody td.tl").first()).toBeHidden();
  await expect(panel.locator(".types")).toHaveCSS("grid-template-columns", /^\S+$/);
  await expectAccessibleAdmin(page, "分類のパネル（390）");
  // キャラクターのパネル（上部のイラスト 64×112）
  await panel.locator(".types button").nth(1).click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("ひなた");
  expect(await size(panel.locator(".hd img"))).toEqual([64, 112]);
  await expectAccessibleAdmin(page, "キャラクターのパネル（390）");
  // 本文がはみ出して動くときだけ本文が焦点を受ける（総論 8.5）
  const body = panel.locator(".bd");
  const overflowing = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
  if (overflowing) await expect(body).toHaveAttribute("tabindex", "0");
  else await expect(body).not.toHaveAttribute("tabindex");
  await page.keyboard.press("Escape");

  // 「組織内分類とは」（画面の幅 − 32px）
  await obHelp(page).click();
  const about = obAbout(page);
  await expect(about).toBeVisible();
  const aboutBox = await rectOf(about);
  expect(Math.round(aboutBox.right - aboutBox.left)).toBe(390 - 32);
  expect(Math.round(aboutBox.left)).toBe(16);
  await expectAccessibleAdmin(page, "組織内分類とは（390）");
  await page.keyboard.press("Escape");
});

test("M7-zaiseki-48 焦点の見た目: 「組織内分類とは？」・4 タイプのボタン・閉じるボタンは共通の焦点の枠、パネルの × は #1F2933、象限の見出しは内側 −2px で折りたたみと枠に重ならない、全員／在籍／退職は内側", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);

  // 「組織内分類とは？」（参照元に定めが無い）: 共通の焦点の枠。Enter で開くと閉じるボタンにも共通の枠
  await focusByKeyboard(obHelp(page));
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await page.keyboard.press("Enter");
  const about = obAbout(page);
  await expect(about.getByRole("button", { name: "閉じる" })).toBeFocused();
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await page.keyboard.press("Escape");
  await expect(obHelp(page)).toBeFocused();

  // 凡例（.ob-root の中のボタン）: .ob-root の輪郭。Enter で開くと × は #1F2933、Tab で 4 タイプのボタンは共通の焦点の枠
  await focusByKeyboard(obLegend(page, "analytical"));
  expect(await activeOutline(page)).toEqual(OB_ROOT_OUTLINE);
  await page.keyboard.press("Enter");
  const panel = obPanel(page);
  await expect(panel.getByRole("button", { name: "閉じる" })).toBeFocused();
  expect(await activeOutline(page)).toEqual(OB_ROOT_OUTLINE);
  await page.keyboard.press("Tab");
  await expect(panel.locator(".types button").first()).toBeFocused();
  expect(await activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await page.keyboard.press("Escape");

  // 全員／在籍／退職: 輪郭を縁から 1px あけて内側（-3px）。選択中は白の線（inset 5px）
  await focusByKeyboard(obSeg(page, "all"));
  expect(await activeOutline(page)).toEqual({ ...OB_ROOT_OUTLINE, offset: "-3px" });
  expect(await css(obSeg(page, "all"), "box-shadow")).toBe(
    "rgb(255, 255, 255) 0px 0px 0px 5px inset",
  );
  await focusByKeyboard(obSeg(page, "stay"));
  expect(await activeOutline(page)).toEqual({ ...OB_ROOT_OUTLINE, offset: "-3px" });
  expect(await css(obSeg(page, "stay"), "box-shadow")).toBe("none");
  // チームの選択欄: .ob-root の輪郭
  await focusByKeyboard(obTeam(page));
  expect(await activeOutline(page)).toEqual(OB_ROOT_OUTLINE);

  // 象限の見出しのボタン: 輪郭はボタンの内側（-2px）。輪郭の外の縁（＝ボタンの矩形）は折りたたみのボタンとキャラクターの枠に重ならない
  for (const key of QUADRANT_ORDER) {
    await focusByKeyboard(obHeading(page, key));
    expect(await activeOutline(page), key).toEqual({ ...OB_ROOT_OUTLINE, offset: "-2px" });
    const heading = await rectOf(obHeading(page, key));
    const fold = await rectOf(obFold(page, key));
    const grid = await rectOf(obQuadrant(page, key).locator(".ob-g"));
    const overlaps = (a: typeof heading, b: typeof heading) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(overlaps(heading, fold), `${key} 折りたたみ`).toBe(false);
    expect(overlaps(heading, grid), `${key} キャラクターの一覧`).toBe(false);
    // 隣の折りたたみのボタンとの間は 2px（参照元の外側の輪郭では 2px 重なっていた）
    const gap =
      key === "driving" || key === "expressive"
        ? heading.left - fold.right
        : fold.left - heading.right;
    expect(Math.round(gap), key).toBe(2);
  }
});

test("総論 8.5（組織内分類）キャラクターのパネルの本文がはみ出すと（1440×500）本文が焦点を受け、axe の scrollable-region-focusable に当たらず、焦点の枠は本文の縁から 1px 内側でパネルの縁で切れず、左の影と上の帯の線に接しない", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const panel = obPanel(page);
  const body = panel.locator(".bd");

  // 1440×900 ではキャラクターのパネルの本文がはみ出さず、焦点を受けない
  await obCell(page, "attendant").click();
  await expect(panel).toBeVisible();
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);
  await expect(body).not.toHaveAttribute("tabindex");
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1440, height: 500 });
  await focusByKeyboard(obCell(page, "attendant"));
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "閉じる" })).toBeFocused();
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(body).toHaveAttribute("tabindex", "0");
  await expect(body).toHaveAttribute("role", "region");
  await expect(body).toHaveAccessibleName("はるか");
  await expectAccessibleAdmin(page, "キャラクターのパネル（1440×500）");

  // Tab で本文に焦点。共通の焦点の枠を本文の内側に、縁から 1px あけて描く（-3px）。本文の矩形はパネルの中で上の帯の下にあり、
  // 枠の外の縁は本文の縁から 1px 以上内側（枠はパネルの左の影と上の帯の線に接せず、外と内は本文の地の白）
  await page.keyboard.press("Tab");
  await expect(body).toBeFocused();
  const ring = await activeOutline(page);
  expect(ring).toEqual({ ...COMMON_FOCUS_RING, offset: "-3px" });
  expect(-Number.parseFloat(ring.offset) - Number.parseFloat(ring.width)).toBeGreaterThanOrEqual(1);
  const panelBox = await rectOf(panel);
  const head = await rectOf(panel.locator(".hd"));
  const box = await rectOf(body);
  expect(box.left).toBeGreaterThanOrEqual(panelBox.left);
  expect(box.right).toBeLessThanOrEqual(panelBox.right);
  expect(box.bottom).toBeLessThanOrEqual(panelBox.bottom);
  expect(box.top).toBeGreaterThanOrEqual(head.bottom);
  await page.keyboard.press("Escape");
  await expect(obCell(page, "attendant")).toBeFocused();
});

test("M7-zaiseki-43 本文の幅（.ob-root を直接狭くする。1440×900）: 880px・500px・1150px の形と、中身が本文から横にはみ出さないこと", async ({
  page,
  adminOrg,
}) => {
  await loginViaUi(page, adminOrg.ownerEmail);
  await openClassification(page);
  const root = obRoot(page);

  // 1150px（1000px 以上）: 枠の最小の高さ 156px、イラスト 80×136
  await setBodyWidth(page, 1150);
  expect(await css(obCell(page, "scientist"), "min-height")).toBe("156px");
  expect(await size(obCell(page, "scientist").locator("img"))).toEqual([80, 136]);
  await expectInsideBody(page, "1150px");

  // 880px（900px 以下）: 集計カードの折り返しと割合の段（order 3・幅いっぱい）、凡例 2 列、象限の余白 10px、カタカナ名 19px、
  // ピルの % なし、枠は 1 列の縦並びでイラスト 52×88
  await setBodyWidth(page, 880);
  const sum = page.locator(".ob-sum");
  expect(await css(sum, "flex-wrap")).toBe("wrap");
  const bal = page.locator(".ob-bal");
  expect(await css(bal, "order")).toBe("3");
  const sumBox = await rectOf(sum);
  const balBox = await rectOf(bal);
  // 割合の段は集計カードの中身の幅いっぱい（左右の余白 20px と枠 1px）
  expect(Math.round(balBox.right - balBox.left)).toBe(Math.round(sumBox.right - sumBox.left - 42));
  expect(balBox.top).toBeGreaterThan((await rectOf(page.locator(".ob-seg"))).bottom);
  expect((await css(page.locator(".ob-leg"), "grid-template-columns")).split(" ")).toHaveLength(2);
  expect(await css(obQuadrant(page, "analytical"), "padding")).toBe("10px");
  expect(await css(obQuadrant(page, "analytical").locator(".ob-qh .nm"), "font-size")).toBe("19px");
  await expect(obHeading(page, "analytical").locator(".ct small")).toBeHidden();
  expect((await css(obCell(page, "scientist"), "grid-template-columns")).split(" ")).toHaveLength(
    1,
  );
  expect(await size(obCell(page, "scientist").locator("img"))).toEqual([52, 88]);
  await expect(obCell(page, "scientist")).toHaveCSS("text-align", "center");
  await expectInsideBody(page, "880px");

  // 500px（520px 以下）: 軸の列 22px、日本語名なし、カタカナ名 16px、イラスト 44×74、印は折り返せる
  await setBodyWidth(page, 500);
  expect((await css(page.locator(".ob-wrap"), "grid-template-columns")).split(" ")[0]).toBe("22px");
  await expect(obHeading(page, "analytical").locator(".jp")).toBeHidden();
  expect(await css(obQuadrant(page, "analytical").locator(".ob-qh .nm"), "font-size")).toBe("16px");
  expect(await size(obCell(page, "scientist").locator("img"))).toEqual([44, 74]);
  expect(await css(obCell(page, "professional").locator(".lean"), "white-space")).toBe("normal");
  await expectInsideBody(page, "500px");
  await expect(root).toBeVisible();
  await setBodyWidth(page, null);
});

// ページ全体の狭い幅。PR-7.13a で fixme を外す（11-3 §5.3 の M7-zaiseki-43 のページ全体の分）
test.describe("ページ全体の狭い幅（390×844・1000×800）", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-zaiseki-43 390×844: 集計カードの折り返し、枠の縦並び、ページ全体が横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await openClassification(page);
    expect(await css(page.locator(".ob-sum"), "flex-wrap")).toBe("wrap");
    await obFold(page, "analytical").click();
    expect((await css(obCell(page, "scientist"), "grid-template-columns")).split(" ")).toHaveLength(
      1,
    );
    await expectInsideBody(page, "390×844");
    await expectNoHorizontalScroll(page, "390×844");
  });

  test("M7-zaiseki-43 1000×800: 本文の幅に応じた形で、ページ全体が横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await openClassification(page);
    const width = await obRoot(page).evaluate((el) => el.getBoundingClientRect().width);
    if (width <= 900) expect(await css(page.locator(".ob-sum"), "flex-wrap")).toBe("wrap");
    await expectInsideBody(page, "1000×800");
    await expectNoHorizontalScroll(page, "1000×800");
  });

  test("M7-zaiseki-48 390×844 のページ（全員）で axe の重大・深刻な違反が無い", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, adminOrg.ownerEmail);
    await openClassification(page);
    await expectAccessibleAdmin(page, "組織内分類（390×844）");
  });
});

// 本文 358px（PR-7.13a のあとの 390×844 の本文の幅）の凡例。参照元の値のままでは本文を超えるので、扱いを PR-7.13a で決める
test.describe("本文 358px の凡例（11 総論 8.5。残る）", () => {
  test.fixme(true, LEGEND_FIXME);

  test("M7-zaiseki-43 本文 358px で凡例の 2 列が本文を超えない", async ({ page, adminOrg }) => {
    await loginViaUi(page, adminOrg.ownerEmail);
    await openClassification(page);
    await setBodyWidth(page, 358);
    await expectInsideBody(page, "358px");
  });
});
