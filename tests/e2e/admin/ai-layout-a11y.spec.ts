// AI 解説の領域の M7-ai-44 狭い幅（K-22）、M7-ai-50 アクセシビリティと焦点の見た目（K-49・K-50）（11-6 §5.3。§2.1〜§2.4・§2.13・
// §2.16・§2.17。PR-7.9 の分: 採用向けの生成前・生成中・失敗・生成済みと、育成・定着の生成前。8 項目は PR-7.10、経年比較のタブは
// PR-7.11a・PR-7.11b）。axe は color-contrast も検査し、対象から外すのは押せない状態の表示と、記号だけの印（育成・定着の案内の
// 「！」の丸 .warn-i）と文字のロゴ「適性検査」だけ（expectAccessibleAdmin）。タブと生成ボタンの焦点の枠は管理画面に共通の焦点の枠
// （11-8 §2.2.6。2px・#3F8DA5・2px 外側。11 総論 8.3 の 19）。
// 結果詳細の枠 #rd は画面に固定され、11-6 §2.13 の切り替え（680px）は画面の幅の @media なので、管理画面の最小幅 1280px（.admin-root。
// 文書の幅だけに効く）を外す PR-7.13a の前でも、画面の幅を変えれば枠の中は PR-7.13a のあとと同じ幅で並ぶ（11-4 の M7-result-34 と同じ）。
// そこで .rd-scroll の中が横に動かないことと、領域の中の形は今確かめ、文書が横に動かないことだけを fixme にする。位置と幅は実行の
// ときに測る（決め打ちしない。比べるときは ±0.5px）。生成中の表示は、生成の要求を page.route で止めて確かめてから放す。
// マウスで生成ボタンを押したときは、焦点は選んでいるタブに移るが焦点の枠は出ず、画面は動かない（11-6 §2.3.2 の 1.1 版）
import type { Locator, Page } from "@playwright/test";

import {
  activeOutline,
  aiArea,
  COMMON_FOCUS_RING,
  expect,
  expectAccessibleAdmin,
  expectNoHorizontalScroll,
  expectRingInsideScroll,
  expectRingVisibleBelowToc,
  focusByKeyboard,
  holdAiPost,
  loginViaUi,
  openResultDetail,
  overlaps,
  rectOf,
  resultDetail,
  ringOf,
  submitNamed,
  submitType,
  test,
  type AdminOrg,
} from "../support/admin-ui";

/** PR-7.13a が入ってから外す fixme の理由（11 総論 5.1、11-4 §4.4） */
const NARROW_FIXME =
  "375px では、管理画面の最小幅 1280px を外す PR-7.13a まで文書が横に動く（11 総論 5.1、11-4 §4.4）";

/** M7-ai-44 の画面の大きさ（11-6 §5.3） */
const NARROW_SIZES = [
  { width: 375, height: 812 },
  { width: 900, height: 900 },
] as const;

/** 生成の失敗を起こす氏名（スタブの不正な JSON。07 §5.4、D07-24） */
const INVALID_JSON_NAME = "__INVALID_JSON__";

/** スクロールする領域を動かして、目次を固定の状態にする */
async function stickToc(page: Page, top = 600): Promise<void> {
  await resultDetail(page).scroll.evaluate((el, y) => el.scrollTo(0, y), top);
  await expect(page.locator("#rsn")).toHaveClass("stuck");
}

/** スクロールする領域を dy だけ動かす */
const scrollBy = (page: Page, dy: number): Promise<void> =>
  resultDetail(page).scroll.evaluate((el, y) => {
    el.scrollTop += y;
  }, dy);

/**
 * 部品の上端を .rd-scroll の上端の 6px 下に置く（部品は固定の目次の下に入り、スクロールする領域の外には出ないので、焦点を移しても
 * ブラウザは領域を動かさない）
 */
async function hideUnderToc(page: Page, target: Locator, label: string): Promise<void> {
  const rd = resultDetail(page);
  await scrollBy(page, (await rectOf(target)).top - ((await rectOf(rd.scroll)).top + 6));
  await expect(page.locator("#rsn")).toHaveClass("stuck");
  const box = await rectOf(target);
  expect(box.top, label).toBeLessThan((await rectOf(rd.toc)).bottom);
  expect(box.top, label).toBeGreaterThanOrEqual((await rectOf(rd.scroll)).top);
}

/** スクロールする領域の位置（scrollTop） */
const scrollTopOf = (page: Page): Promise<number> =>
  resultDetail(page).scroll.evaluate((el) => el.scrollTop);

/** 要素の内容の幅（内側の余白と枠を除く） */
const contentWidth = (locator: Locator): Promise<number> =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return (
      el.getBoundingClientRect().width -
      parseFloat(s.paddingLeft) -
      parseFloat(s.paddingRight) -
      parseFloat(s.borderLeftWidth) -
      parseFloat(s.borderRightWidth)
    );
  });

/** 要素の幅 */
const widthOf = async (locator: Locator): Promise<number> => {
  const r = await rectOf(locator);
  return r.right - r.left;
};

/**
 * M7-ai-44 の共通の確かめ: .rd-scroll が横に動かない。AI 解説の領域は本文（.rd-body）の幅の中で、領域の中の要素（SVG の中を除く）は
 * 領域の左右の縁の内側にある（採用向けの表示と生成中の最小幅 280px が、375px でパネルの内側の幅を超えても、パネルの右の余白に入るだけで
 * 領域の外に出ない。11-6 §2.1・§2.13）
 */
async function expectAiFits(page: Page, label: string): Promise<void> {
  const scroll = await resultDetail(page).scroll.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(scroll.scroll, `.rd-scroll（${label}）`).toBeLessThanOrEqual(scroll.client);
  const ai = await rectOf(aiArea(page).root);
  const body = await rectOf(page.locator("#rd .rd-body"));
  expect(ai.left, `#ai の左端（${label}）`).toBeGreaterThanOrEqual(body.left - 0.5);
  expect(ai.right, `#ai の右端（${label}）`).toBeLessThanOrEqual(body.right + 0.5);
  const outside = await aiArea(page).root.evaluate((root) => {
    const box = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll("*"))
      .filter((child) => (child.parentElement?.closest("svg") ?? null) === null)
      .filter((child) => {
        const r = child.getBoundingClientRect();
        return r.width > 0 && (r.left < box.left - 0.5 || r.right > box.right + 0.5);
      })
      .map((child) => child.getAttribute("class") ?? child.tagName.toLowerCase());
  });
  expect(outside, `領域の外に出た要素（${label}）`).toEqual([]);
}

/** タブの行: 375px では 2 つ目のタブが 1 つ目の下の行に折り返し、900px では同じ行（11-6 §2.13） */
async function expectTabsWrap(page: Page, width: number, label: string): Promise<void> {
  const first = await rectOf(aiArea(page).tab("recruitment"));
  const second = await rectOf(aiArea(page).tab("training"));
  if (width === 375) {
    expect(second.top, `タブの折り返し（${label}）`).toBeGreaterThanOrEqual(first.bottom - 0.5);
  } else {
    expect(Math.abs(second.top - first.top), `タブが 1 行（${label}）`).toBeLessThanOrEqual(0.5);
  }
}

/** 案内・失敗の枠は幅 700px・最大幅 100%（パネルの内側の幅が 700px より狭いときは枠いっぱい）。採用向けの生成の入口も同じ幅になる */
async function expectFullWidthInPanel(page: Page, target: Locator, label: string): Promise<void> {
  const inner = await contentWidth(aiArea(page).panel("recruitment"));
  const expected = Math.min(700, inner);
  expect(Math.abs((await widthOf(target)) - expected), label).toBeLessThanOrEqual(0.5);
}

test("M7-ai-44 狭い幅（375×812・900×900）: 採用向けの生成前・生成中・失敗・生成済みと育成・定着の生成前で .rd-scroll が横に動かず、領域は本文の幅の中。375 ではタブが折り返し、案内・失敗の枠が枠いっぱい（パネルの内側の幅）、強みと注意点は縦に並ぶ。900 ではタブが 1 行、強みと注意点は横に並ぶ", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  const failed = submitNamed(adminOrg.organizationId, INVALID_JSON_NAME);
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const panel = ai.panel("recruitment");
  const forEachSize = async (
    state: string,
    check: (width: number, label: string) => Promise<void>,
  ) => {
    for (const size of NARROW_SIZES) {
      await page.setViewportSize(size);
      const label = `${state}（${size.width}×${size.height}）`;
      await expectAiFits(page, label);
      await check(size.width, label);
    }
  };

  // 採用向けの生成前: 案内と生成の入口がパネルの内側いっぱい（375）・700px（900）
  await forEachSize("採用向けの生成前", async (width, label) => {
    await expectTabsWrap(page, width, label);
    await expectFullWidthInPanel(page, panel.locator(".ai-intro"), `案内の幅（${label}）`);
    await expectFullWidthInPanel(page, panel.locator(".ai-start"), `生成の入口の幅（${label}）`);
  });

  // 育成・定着の生成前: 生成の入口はパネルいっぱい（§2.1）、案内は 700px・最大幅 100%
  await ai.tab("training").click();
  await forEachSize("育成・定着の生成前", async (width, label) => {
    await expectTabsWrap(page, width, label);
    const training = ai.panel("training");
    const inner = await contentWidth(training);
    expect(
      Math.abs((await widthOf(training.locator(".ai-start"))) - inner),
      label,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs((await widthOf(training.locator(".ai-intro"))) - Math.min(700, inner)),
      label,
    ).toBeLessThanOrEqual(0.5);
  });
  await ai.tab("recruitment").click();

  // 採用向けの生成中（要求を止める）
  const release = await holdAiPost(page, resultId);
  await ai.genButton("recruitment").click();
  await expect(ai.loading).toBeVisible();
  await forEachSize("採用向けの生成中", async () => {
    await expect(ai.loading).toBeVisible();
  });
  release();

  // 採用向けの生成済み: 強みと注意点の箱は 680px 以下で 1 列（別表C の C.4）
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  await forEachSize("採用向けの生成済み", async (width, label) => {
    const strength = await rectOf(ai.view.locator(".mini.strength"));
    const caution = await rectOf(ai.view.locator(".mini.caution"));
    if (width <= 680) {
      expect(caution.top, `強みの下に注意点（${label}）`).toBeGreaterThanOrEqual(strength.bottom);
      expect(Math.abs(caution.left - strength.left), label).toBeLessThanOrEqual(0.5);
    } else {
      expect(
        Math.abs(caution.top - strength.top),
        `強みと注意点が同じ行（${label}）`,
      ).toBeLessThanOrEqual(0.5);
      expect(caution.left, label).toBeGreaterThan(strength.right);
    }
  });

  // 採用向けの失敗: 失敗の枠は案内と同じく 700px・最大幅 100%
  await page.setViewportSize({ width: 1440, height: 900 });
  await openResultDetail(page, failed.resultId);
  await ai.genButton("recruitment").click();
  await expect(ai.fail).toBeVisible();
  await forEachSize("採用向けの失敗", async (_width, label) => {
    await expectFullWidthInPanel(page, ai.fail, `失敗の枠の幅（${label}）`);
  });
});

/**
 * M7-ai-50 の焦点の確かめ: キーボードで焦点を移すと計算された outline が管理画面に共通の焦点の枠で、焦点の枠の外側 4px が .rd-scroll の
 * 縁の内側（11-4 §2.2）
 */
async function expectCommonRing(page: Page, target: Locator, label: string): Promise<void> {
  await focusByKeyboard(target);
  await expect.poll(() => activeOutline(page), { message: label }).toEqual(COMMON_FOCUS_RING);
  await expectRingInsideScroll(page, target, label);
}

/**
 * M7-ai-50（11-6 §5.3。PR-7.9 の分）: 採用向けの生成前・生成中・失敗・生成済みと育成・定着の生成前で、axe の重大・深刻な違反が無く、
 * タブと生成ボタンの焦点の枠が管理画面に共通の焦点の枠。選んでいるタブの焦点の枠は隣のタブに重ならない（間 12px。§2.17）
 */
async function expectAccessibleAiStates(page: Page, org: AdminOrg, size: string): Promise<void> {
  const ai = aiArea(page);
  const { resultId } = submitType(org.organizationId, "conductor");
  const failed = submitNamed(org.organizationId, INVALID_JSON_NAME);
  await loginViaUi(page, org.ownerEmail);
  await openResultDetail(page, resultId);

  // 採用向けの生成前
  await expectAccessibleAdmin(page, `採用向けの生成前（${size}）`);
  await expectCommonRing(page, ai.tab("recruitment"), `採用向けのタブ（${size}）`);
  expect(
    overlaps(ringOf(await rectOf(ai.tab("recruitment"))), await rectOf(ai.tab("training"))),
    `採用向けのタブの焦点の枠と隣のタブ（${size}）`,
  ).toBe(false);
  await expectCommonRing(page, ai.genButton("recruitment"), `採用向けの生成ボタン（${size}）`);

  // 育成・定着の生成前（押せない生成ボタンは焦点を受けない）
  await ai.tab("training").click();
  await expect(ai.panel("training")).toBeVisible();
  await expectAccessibleAdmin(page, `育成・定着の生成前（${size}）`);
  await expectCommonRing(page, ai.tab("training"), `育成・定着のタブ（${size}）`);
  expect(
    overlaps(ringOf(await rectOf(ai.tab("training"))), await rectOf(ai.tab("recruitment"))),
    `育成・定着のタブの焦点の枠と隣のタブ（${size}）`,
  ).toBe(false);

  // 採用向けの生成中（要求を止める）
  await ai.tab("recruitment").click();
  const release = await holdAiPost(page, resultId);
  await ai.genButton("recruitment").click();
  await expect(ai.loading).toBeVisible();
  await expectAccessibleAdmin(page, `採用向けの生成中（${size}）`);
  await expectCommonRing(page, ai.tab("recruitment"), `生成中の採用向けのタブ（${size}）`);
  release();

  // 採用向けの生成済み（タブの行の下の端にカードの影のすそがかかる。§2.17）
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  await expectAccessibleAdmin(page, `採用向けの生成済み（${size}）`);
  await expectCommonRing(page, ai.tab("recruitment"), `生成済みの採用向けのタブ（${size}）`);

  // 採用向けの失敗
  await openResultDetail(page, failed.resultId);
  await ai.genButton("recruitment").click();
  await expect(ai.fail).toBeVisible();
  await expectAccessibleAdmin(page, `採用向けの失敗（${size}）`);
  await expectCommonRing(page, ai.genButton("recruitment"), `失敗のあとの生成ボタン（${size}）`);
  await expectCommonRing(page, ai.tab("recruitment"), `失敗のあとの採用向けのタブ（${size}）`);
}

test("M7-ai-50 1440×900: 採用向けの生成前・生成中・失敗・生成済みと育成・定着の生成前で axe の重大・深刻な違反が無く、キーボードでタブと生成ボタンに焦点を移すと管理画面に共通の焦点の枠（2px・#3F8DA5・2px 外側）が .rd-scroll の縁の内側に出る", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  await expectAccessibleAiStates(page, adminOrg, "1440×900");
});

test("M7-ai-50 390×844: 採用向けの生成前・生成中・失敗・生成済みと育成・定着の生成前で axe の重大・深刻な違反が無く、キーボードでタブと生成ボタンに焦点を移すと管理画面に共通の焦点の枠が .rd-scroll の縁の内側に出る", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessibleAiStates(page, adminOrg, "390×844");
});

test("M7-ai-50 焦点と留まった目次（1440×900）: 目次が固定の状態で、目次の下に入った生成ボタンと採用向けのタブへキーボードで焦点を戻すと、焦点の枠の外側 4px が固定の目次の下端より下で .rd-scroll の縁の内側に出る。タブが目次の下に入った状態で生成ボタンを Enter で押すと、焦点は選んでいるタブに移って目次の下に出て（body に落ちない）、生成が終わった後もタブにある", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const tab = ai.tab("recruitment");
  const gen = ai.genButton("recruitment");
  const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? "");

  // 生成ボタン: 次の部品（新しいレイアウトの最初の部品）に焦点を置き、生成ボタンを目次の下に入れてから Shift+Tab で戻る
  await focusByKeyboard(gen);
  await page.keyboard.press("Tab");
  await expect(gen).not.toBeFocused();
  await stickToc(page);
  await hideUnderToc(page, gen, "目次の下に入れた生成ボタン");
  await page.keyboard.press("Shift+Tab");
  await expect(gen).toBeFocused();
  await expect.poll(() => activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await expectRingVisibleBelowToc(page, gen, "目次の下から戻した生成ボタン");

  // 選んでいるタブ: タブを目次の下に入れてから、生成ボタンから Shift+Tab で戻る
  await hideUnderToc(page, tab, "目次の下に入れた採用向けのタブ");
  await page.keyboard.press("Shift+Tab");
  await expect(tab).toBeFocused();
  await expect.poll(() => activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await expectRingVisibleBelowToc(page, tab, "目次の下から戻した採用向けのタブ");

  // タブが目次の下に入った状態で、キーボードで生成ボタンを押す。押した生成ボタンは消え、焦点は選んでいるタブに移って目次の下に出る
  await page.keyboard.press("Tab");
  await expect(gen).toBeFocused();
  await hideUnderToc(page, tab, "生成の前に目次の下に入れた採用向けのタブ");
  const release = await holdAiPost(page, resultId);
  await page.keyboard.press("Enter");
  await expect(ai.loading).toBeVisible();
  await expect(tab).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  await expect.poll(() => activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await expectRingVisibleBelowToc(page, tab, "生成を始めたあとの採用向けのタブ");
  release();
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  await expect(tab).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
});

test("M7-ai-50 焦点（マウス。1440×900）: 目次が固定の状態で採用向けのタブが目次の下に入っていても、生成ボタンをマウスで押すと、焦点は選んでいるタブに移るが焦点の枠は出ず（:focus-visible でない）、スクロールする領域は動かない（11-6 §2.3.2）。生成が終わった後も焦点はタブにある", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId);
  const ai = aiArea(page);
  const rd = resultDetail(page);
  const tab = ai.tab("recruitment");
  const gen = ai.genButton("recruitment");
  const activeInfo = () =>
    page.evaluate(() => ({
      id: document.activeElement?.id ?? "",
      focusVisible: document.activeElement?.matches(":focus-visible") ?? false,
    }));

  await stickToc(page, 400);
  await hideUnderToc(page, tab, "目次の下に入れた採用向けのタブ");
  // 生成ボタンは目次の下端より下で、スクロールする領域の中に見えている（座標で押す。Playwright の自動のスクロールを通さない）
  const box = await rectOf(gen);
  expect(box.top).toBeGreaterThanOrEqual((await rectOf(rd.toc)).bottom);
  expect(box.bottom).toBeLessThanOrEqual((await rectOf(rd.scroll)).bottom);
  const release = await holdAiPost(page, resultId);
  const before = await scrollTopOf(page);
  await page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await expect(ai.loading).toBeVisible();
  await expect(tab).toBeFocused();
  // 目次の下へ動かす処理は描いた後の次のフレームなので、少し待ってから位置を比べる
  await page.waitForTimeout(300);
  expect(await activeInfo()).toEqual({ id: "ai-tab-recruitment", focusVisible: false });
  expect(Math.abs((await scrollTopOf(page)) - before)).toBeLessThanOrEqual(1);
  release();
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  expect(await activeInfo()).toEqual({ id: "ai-tab-recruitment", focusVisible: false });
});

test.describe("ページ全体の狭い幅（375×812）", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-ai-44 375×812: 文書が横に動かない（採用向けの生成前と生成済み）", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { resultId } = submitType(adminOrg.organizationId, "conductor");
    await loginViaUi(page, adminOrg.ownerEmail);
    await openResultDetail(page, resultId);
    await expectNoHorizontalScroll(page, "採用向けの生成前（375×812）");
    await aiArea(page).genButton("recruitment").click();
    await expect(aiArea(page).view).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page, "採用向けの生成済み（375×812）");
  });
});
