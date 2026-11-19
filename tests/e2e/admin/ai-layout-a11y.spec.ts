// AI 解説の領域の M7-ai-44 狭い幅（K-22）、M7-ai-50 アクセシビリティと焦点の見た目（K-49・K-50）（11-6 §5.3。§2.1〜§2.5・§2.13・
// §2.16・§2.17。採用向けの生成前・生成中・失敗・生成済みと、育成・定着の生成前・不正の表示・生成中・失敗・生成済み。経年比較のタブは
// PR-7.11a・PR-7.11b）。育成・定着は E2E のサーバの環境変数 AI_TRAINING_PROMPT_VERSION=training-v1 で有効（e2e.yml。11-6 §3.8）。
// axe は color-contrast も検査し、対象から外すのは押せない状態の表示（axe は disabled の属性の部品を調べない。生成中・生成済みの選べない
// 8 項目の選択欄を含む）と、記号だけの印（育成・定着の案内の「！」の丸 .warn-i）と文字のロゴ「適性検査」だけ（expectAccessibleAdmin）。
// タブ・生成ボタン・8 項目の選択欄の焦点の枠は管理画面に共通の焦点の枠（11-8 §2.2.6。2px・#3F8DA5・2px 外側。11 総論 8.3 の 19）で、
// 不正の表示の選択欄だけ線の色が #1A3943（K-50。11-6 §2.17 の K-50 の表の 2）。
// 結果詳細の枠 #rd は画面に固定され、11-6 §2.13 の切り替え（680px・900px・1023px）は画面の幅の @media なので、管理画面の最小幅 1280px
// （.admin-root。文書の幅だけに効く）を外す PR-7.13a の前でも、画面の幅を変えれば枠の中は PR-7.13a のあとと同じ幅で並ぶ（11-4 の
// M7-result-34 と同じ）。そこで .rd-scroll の中が横に動かないことと、領域の中の形は今確かめ、文書が横に動かないことだけを fixme にする。
// 位置と幅は実行のときに測る（決め打ちしない。比べるときは ±0.5px）。生成中の表示は、生成の要求を page.route で止めて確かめてから放す。
// マウスで生成ボタンを押したときは、焦点は選んでいるタブに移るが焦点の枠は出ず、画面は動かない（11-6 §2.3.2 の 1.1 版）。焦点を移した
// 後に目次の下へ動かす処理（ResultToc。描いた後の次のフレーム）を待つときは、時間ではなく描画のフレームを待つ（nextFrames）
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import {
  activeOutline,
  aiArea,
  COMMON_FOCUS_RING,
  expect,
  expectAccessibleAdmin,
  expectInside,
  expectNoHorizontalScroll,
  expectRingInsideScroll,
  expectRingVisibleBelowToc,
  focusByKeyboard,
  holdAiPost,
  loginViaUi,
  nextFrames,
  openResultDetail,
  overlaps,
  rectOf,
  resultDetail,
  ringOf,
  selectTrainingContext,
  submitNamed,
  submitType,
  test,
  TRAINING_CONTEXT_SAMPLE,
  type AdminOrg,
  type Rect,
} from "../support/admin-ui";
import { TRAINING_CONTEXT_KEYS } from "@/lib/masters/training-context";

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

/** 8 項目の項目（.ai-ctx-item。画面の並び）の矩形 */
const ctxItemRects = (page: Page): Promise<Rect[]> =>
  aiArea(page)
    .ctx.locator(".ai-ctx-item")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
    );

/**
 * 8 項目の並び（11-6 §2.5.3・§2.13）。perLine は 1 行に並ぶ数（901px 以上は 4、900px 以下は 2）。どの項目も幅がそろい、行の中の項目は
 * 上端がそろい、各行の 1 つ目の左端がそろい、行と行の縦の間は 12px（.ai-ctx-row の中の row-gap と、2 つの .ai-ctx-row の間の gap）、
 * 行の中の横の間は 12px。選択欄は項目の幅いっぱい
 */
async function expectCtxGrid(page: Page, perLine: 2 | 4, label: string): Promise<void> {
  const items = await ctxItemRects(page);
  expect(items, label).toHaveLength(8);
  const width = items[0]!.right - items[0]!.left;
  const lines: Rect[][] = [];
  for (let i = 0; i < items.length; i += perLine) lines.push(items.slice(i, i + perLine));
  for (const [n, line] of lines.entries()) {
    for (const [m, item] of line.entries()) {
      const at = `${label} ${n + 1} 行目の ${m + 1} つ目`;
      expect(Math.abs(item.right - item.left - width), `${at}の幅`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(item.top - line[0]!.top), `${at}の上端`).toBeLessThanOrEqual(0.5);
      if (m > 0) {
        expect(Math.abs(item.left - line[m - 1]!.right - 12), `${at}の横の間`).toBeLessThanOrEqual(
          0.5,
        );
      }
    }
    expect(
      Math.abs(line[0]!.left - items[0]!.left),
      `${label} ${n + 1} 行目の左端`,
    ).toBeLessThanOrEqual(0.5);
    if (n > 0) {
      const above = Math.max(...lines[n - 1]!.map((item) => item.bottom));
      expect(
        Math.abs(line[0]!.top - above - 12),
        `${label} ${n + 1} 行目の上の縦の間`,
      ).toBeLessThanOrEqual(0.5);
    }
  }
  const selects = await aiArea(page).selects.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }),
  );
  for (const [i, select] of selects.entries()) {
    expect(
      Math.abs(select.left - items[i]!.left),
      `${label} ${i + 1} つ目の選択欄の左端`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(select.right - items[i]!.right),
      `${label} ${i + 1} つ目の選択欄の右端`,
    ).toBeLessThanOrEqual(0.5);
  }
}

test("M7-ai-44 狭い幅の育成・定着（375×812・900×900）: 生成前・生成済みで .rd-scroll が横に動かず、領域は本文の幅の中。生成の入口と 8 項目の箱はパネルの内側いっぱい、案内は 700px・最大幅 100%。8 項目は 1 行に 2 つ（幅がそろい、各行の左端がそろい、縦と横の間 12px。選択欄は項目いっぱい）。生成済みの「◎ 足りている」「△ 欠けている」は 375 で縦に、900 で横に並ぶ", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(120_000);
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId, "?ai=training", "none");
  const ai = aiArea(page);
  const training = ai.panel("training");
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

  // 生成前: 生成の入口（.ai-start--training）と 8 項目の箱はパネルの内側いっぱい（§2.1・§2.5.3）、案内は 700px・最大幅 100%
  await forEachSize("育成・定着の生成前", async (width, label) => {
    await expectTabsWrap(page, width, label);
    const inner = await contentWidth(training);
    expect(
      Math.abs((await widthOf(training.locator(".ai-start"))) - inner),
      `生成の入口の幅（${label}）`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs((await widthOf(ai.ctx)) - inner),
      `8 項目の箱の幅（${label}）`,
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs((await widthOf(training.locator(".ai-intro"))) - Math.min(700, inner)),
      `案内の幅（${label}）`,
    ).toBeLessThanOrEqual(0.5);
    await expectCtxGrid(page, 2, label);
  });

  // 生成済み: 足りている・欠けているの箱は 680px 以下で 1 列（別表C の C.5）
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectTrainingContext(page, TRAINING_CONTEXT_SAMPLE);
  await ai.genButton("training").click();
  await expect(ai.trainingView).toBeVisible({ timeout: 30_000 });
  await forEachSize("育成・定着の生成済み", async (width, label) => {
    expect(
      Math.abs((await widthOf(ai.ctx)) - (await contentWidth(training))),
      label,
    ).toBeLessThanOrEqual(0.5);
    await expectCtxGrid(page, 2, label);
    const have = await rectOf(ai.trainingView.locator(".mini.a"));
    const lack = await rectOf(ai.trainingView.locator(".mini.b"));
    if (width <= 680) {
      expect(lack.top, `足りているの下に欠けている（${label}）`).toBeGreaterThanOrEqual(
        have.bottom,
      );
      expect(Math.abs(lack.left - have.left), label).toBeLessThanOrEqual(0.5);
    } else {
      expect(
        Math.abs(lack.top - have.top),
        `足りていると欠けているが同じ行（${label}）`,
      ).toBeLessThanOrEqual(0.5);
      expect(lack.left, label).toBeGreaterThan(have.right);
    }
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
 * M7-ai-50（11-6 §5.3。採用向けの分）: 採用向けの生成前・生成中・失敗・生成済みで、axe の重大・深刻な違反が無く、タブと生成ボタンの
 * 焦点の枠が管理画面に共通の焦点の枠。選んでいるタブの焦点の枠は隣のタブに重ならない（間 12px。§2.17。育成・定着のタブは
 * expectAccessibleTrainingStates）
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

  // 採用向けの生成中（要求を止める）
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

test("M7-ai-50 1440×900: 採用向けの生成前・生成中・失敗・生成済みで axe の重大・深刻な違反が無く、キーボードでタブと生成ボタンに焦点を移すと管理画面に共通の焦点の枠（2px・#3F8DA5・2px 外側）が .rd-scroll の縁の内側に出る", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  await expectAccessibleAiStates(page, adminOrg, "1440×900");
});

test("M7-ai-50 390×844: 採用向けの生成前・生成中・失敗・生成済みで axe の重大・深刻な違反が無く、キーボードでタブと生成ボタンに焦点を移すと管理画面に共通の焦点の枠が .rd-scroll の縁の内側に出る", async ({
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
  // 目次の下へ動かす処理（描いた後の次のフレーム）の後まで待ってから位置を比べる
  await nextFrames(page);
  expect(await activeInfo()).toEqual({ id: "ai-tab-recruitment", focusVisible: false });
  expect(Math.abs((await scrollTopOf(page)) - before)).toBeLessThanOrEqual(1);
  release();
  await expect(ai.view).toBeVisible({ timeout: 30_000 });
  expect(await activeInfo()).toEqual({ id: "ai-tab-recruitment", focusVisible: false });
});

/** 不正の表示の選択欄の焦点の枠（K-50。11-6 §2.17 の K-50 の表の 2。#1A3943 の 2px を 2px 外側） */
const INVALID_FOCUS_RING = { ...COMMON_FOCUS_RING, color: "rgb(26, 57, 67)" } as const;

/**
 * 8 項目の選択欄の焦点の枠（11-6 §2.5.3・§2.17）: キーボードで欄（keys。既定はすべて）に焦点を移すと、計算された outline が ring
 * （管理画面に共通の焦点の枠か、不正の表示の #1A3943）で、焦点の枠の外側 4px が .rd-scroll の縁と 8 項目の箱の内側にあり、ほかの
 * 選択欄に重ならない（左右の間と下の行までは 12px。§2.17 の焦点の枠の形）
 */
async function expectSelectRings(
  page: Page,
  ring: typeof COMMON_FOCUS_RING | typeof INVALID_FOCUS_RING,
  label: string,
  keys: readonly string[] = TRAINING_CONTEXT_KEYS,
): Promise<void> {
  const ai = aiArea(page);
  for (const [i, key] of TRAINING_CONTEXT_KEYS.entries()) {
    if (!keys.includes(key)) continue;
    const select = ai.select(key);
    const at = `${label} ${key}`;
    await focusByKeyboard(select);
    await expect.poll(() => activeOutline(page), { message: at }).toEqual(ring);
    await expectRingInsideScroll(page, select, at);
    const own = ringOf(await rectOf(select));
    expectInside(own, await rectOf(ai.ctx), `${at} の焦点の枠と 8 項目の箱`);
    const others = await ai.selects.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
    );
    for (const [j, other] of others.entries()) {
      if (j !== i)
        expect(overlaps(own, other), `${at} の焦点の枠と ${j + 1} つ目の選択欄`).toBe(false);
    }
  }
}

/**
 * 育成・定着のパネルの見出しの段（11-6 §2.5.3・§2.5.5 の 1.2 版）: パネルの中の見出しが、ページの見出しの並びで前の見出しから 2 段
 * 以上下がらない（axe の heading-order。best-practice の規則で、expectAccessibleAdmin の wcag2a・wcag2aa の対象外なので、パネルに
 * 絞って別に調べる。前の見出しはページ全体の並びで決まる）。生成済みは案内（h2）が隠れるので、8 項目の見出しが結果の見出し h1 の
 * 次に来る
 */
async function expectTrainingHeadingOrder(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .include("#ai-panel-training")
    .withRules(["heading-order"])
    .analyze();
  expect(
    result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`)),
    label,
  ).toEqual([]);
}

/**
 * M7-ai-50（11-6 §5.3。育成・定着の分）: 生成前・不正の表示（何も選ばずにキーボードで押す）・生成中・生成済み・失敗で、axe の重大・
 * 深刻な違反が無い（color-contrast を含む）。生成前と生成済みで、パネルの見出しの段が前の見出しから飛ばない（axe の heading-order）。
 * タブ・生成ボタン・8 項目の選択欄の焦点の枠は管理画面に共通の焦点の枠で、不正の表示の選択欄は #1A3943。キーボードで押した生成ボタンが
 * 消えるときも焦点は body に落ちない（未選択があれば最初の未選択の欄、生成を始めれば育成・定着のタブ）。perLine は 8 項目が 1 行に
 * 並ぶ数（1440 は 4、390 は 2）
 */
async function expectAccessibleTrainingStates(
  page: Page,
  org: AdminOrg,
  size: string,
  perLine: 2 | 4,
): Promise<void> {
  const ai = aiArea(page);
  const gen = ai.genButton("training");
  const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? "");
  const { resultId } = submitType(org.organizationId, "conductor");
  const failed = submitNamed(org.organizationId, INVALID_JSON_NAME);
  await loginViaUi(page, org.ownerEmail);
  await openResultDetail(page, resultId, "?ai=training", "none");

  // 生成前（8 項目は未選択。未選択の表示の文字は #657486）
  await expectCtxGrid(page, perLine, `8 項目の並び（${size}）`);
  await expectAccessibleAdmin(page, `育成・定着の生成前（${size}）`);
  await expectTrainingHeadingOrder(page, `育成・定着の生成前の見出しの段（${size}）`);
  await expectCommonRing(page, ai.tab("training"), `育成・定着のタブ（${size}）`);
  expect(
    overlaps(ringOf(await rectOf(ai.tab("training"))), await rectOf(ai.tab("recruitment"))),
    `育成・定着のタブの焦点の枠と隣のタブ（${size}）`,
  ).toBe(false);
  await expectSelectRings(page, COMMON_FOCUS_RING, `生成前の選択欄（${size}）`);
  await expectCommonRing(page, gen, `育成・定着の生成ボタン（${size}）`);

  // 不正の表示: 何も選ばずにキーボードで押すと、8 つとも不正の表示で、焦点は勤続年数の欄（:focus-visible。線は #1A3943）
  await page.keyboard.press("Enter");
  await expect(ai.select("tenure")).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  await expect.poll(() => activeOutline(page)).toEqual(INVALID_FOCUS_RING);
  await expectRingInsideScroll(page, ai.select("tenure"), `焦点を移した勤続年数の欄（${size}）`);
  for (const key of TRAINING_CONTEXT_KEYS) {
    await expect(ai.select(key), `${size} ${key}`).toHaveAttribute("aria-invalid", "true");
  }
  await expectAccessibleAdmin(page, `育成・定着の不正の表示（${size}）`);
  await expectSelectRings(page, INVALID_FOCUS_RING, `不正の表示の選択欄（${size}）`);

  // 生成中（8 つ選んで、キーボードで押す。要求を止める）: 押した生成ボタンは消え、焦点は育成・定着のタブ。8 項目は選べない
  await selectTrainingContext(page, TRAINING_CONTEXT_SAMPLE);
  for (const key of TRAINING_CONTEXT_KEYS) {
    await expect(ai.select(key), `${size} ${key}`).not.toHaveAttribute("aria-invalid");
  }
  const release = await holdAiPost(page, resultId, "training");
  await focusByKeyboard(gen);
  await page.keyboard.press("Enter");
  await expect(ai.loadingIn("training")).toBeVisible();
  await expect(ai.tab("training")).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  await expect.poll(() => activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  for (const key of TRAINING_CONTEXT_KEYS) {
    await expect(ai.select(key), `${size} ${key}`).toBeDisabled();
  }
  await expectAccessibleAdmin(page, `育成・定着の生成中（${size}）`);
  release();

  // 生成済み（8 項目は保存した値で選べない。焦点はタブのまま）
  await expect(ai.trainingView).toBeVisible({ timeout: 30_000 });
  await expect(ai.tab("training")).toBeFocused();
  await expectAccessibleAdmin(page, `育成・定着の生成済み（${size}）`);
  await expectTrainingHeadingOrder(page, `育成・定着の生成済みの見出しの段（${size}）`);
  await expectCommonRing(page, ai.tab("training"), `生成済みの育成・定着のタブ（${size}）`);

  // 失敗（8 項目は選んだ値のまま選べる）
  await openResultDetail(page, failed.resultId, "?ai=training", "none");
  await selectTrainingContext(page, TRAINING_CONTEXT_SAMPLE);
  await gen.click();
  await expect(ai.failIn("training")).toBeVisible();
  await expectAccessibleAdmin(page, `育成・定着の失敗（${size}）`);
  await expectCommonRing(page, gen, `失敗のあとの育成・定着の生成ボタン（${size}）`);
  await expectSelectRings(page, COMMON_FOCUS_RING, `失敗のあとの選択欄（${size}）`, [
    "tenure",
    "concern",
  ]);
}

test("M7-ai-50 育成・定着 1440×900: 8 項目は 1 行に 4 つ。生成前・不正の表示・生成中・生成済み・失敗で axe の重大・深刻な違反が無く、生成前と生成済みでパネルの見出しの段が前の見出しから飛ばず（axe の heading-order）、キーボードでタブ・生成ボタン・8 項目の選択欄に焦点を移すと管理画面に共通の焦点の枠（不正の表示の選択欄は #1A3943）が .rd-scroll の縁と 8 項目の箱の内側に出て、ほかの選択欄に重ならない。押した生成ボタンが消えても焦点は body に落ちない", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  await expectAccessibleTrainingStates(page, adminOrg, "1440×900", 4);
});

test("M7-ai-50 育成・定着 390×844: 8 項目は 1 行に 2 つ。生成前・不正の表示・生成中・生成済み・失敗で axe の重大・深刻な違反が無く、生成前と生成済みでパネルの見出しの段が前の見出しから飛ばず（axe の heading-order）、キーボードでタブ・生成ボタン・8 項目の選択欄に焦点を移すと管理画面に共通の焦点の枠（不正の表示の選択欄は #1A3943）が .rd-scroll の縁と 8 項目の箱の内側に出て、ほかの選択欄に重ならない。押した生成ボタンが消えても焦点は body に落ちない", async ({
  page,
  adminOrg,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAccessibleTrainingStates(page, adminOrg, "390×844", 2);
});

test("M7-ai-50 育成・定着の焦点と留まった目次（1440×900）: 何も選ばずに、勤続年数の欄が固定の目次の下に入った状態でキーボードで生成ボタンを押すと、焦点は勤続年数の欄に移って :focus-visible になり（body に落ちない）、不正の表示の焦点の枠（#1A3943）の外側 4px が目次の下端より下で .rd-scroll の縁の内側に出る。8 つ選んで、育成・定着のタブが目次の下に入った状態でキーボードで押すと、焦点はタブに移って目次の下に出て、生成が終わった後もタブにある", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId, "?ai=training", "none");
  const ai = aiArea(page);
  const rd = resultDetail(page);
  const tab = ai.tab("training");
  const gen = ai.genButton("training");
  const tenure = ai.select("tenure");
  const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? "");

  // 勤続年数の欄を目次の下に入れる（生成ボタンは目次の下端より下で、スクロールする領域の中に見えている）
  await focusByKeyboard(gen);
  await stickToc(page);
  await hideUnderToc(page, tenure, "目次の下に入れた勤続年数の欄");
  const box = await rectOf(gen);
  expect(box.top).toBeGreaterThanOrEqual((await rectOf(rd.toc)).bottom);
  expect(box.bottom).toBeLessThanOrEqual((await rectOf(rd.scroll)).bottom);
  await expect(gen).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tenure).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  await expect(tenure).toHaveAttribute("aria-invalid", "true");
  await expect.poll(() => activeOutline(page)).toEqual(INVALID_FOCUS_RING);
  await expectRingVisibleBelowToc(page, tenure, "不正の表示で焦点を移した勤続年数の欄");

  // 8 つ選び、育成・定着のタブを目次の下に入れてから、キーボードで生成ボタンを押す
  await selectTrainingContext(page, TRAINING_CONTEXT_SAMPLE);
  await focusByKeyboard(gen);
  await hideUnderToc(page, tab, "生成の前に目次の下に入れた育成・定着のタブ");
  const release = await holdAiPost(page, resultId, "training");
  await page.keyboard.press("Enter");
  await expect(ai.loadingIn("training")).toBeVisible();
  await expect(tab).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
  await expect.poll(() => activeOutline(page)).toEqual(COMMON_FOCUS_RING);
  await expectRingVisibleBelowToc(page, tab, "生成を始めたあとの育成・定着のタブ");
  release();
  await expect(ai.trainingView).toBeVisible({ timeout: 30_000 });
  await expect(tab).toBeFocused();
  expect(await activeTag()).not.toBe("BODY");
});

test("M7-ai-50 育成・定着の焦点（マウス。1440×900）: 何も選ばずにマウスで押すと、焦点は最初の未選択の欄（勤続年数）に移る（body に落ちない）。8 つ選んで、目次が固定の状態で育成・定着のタブが目次の下に入っていても、生成ボタンをマウスで押すと、焦点はタブに移るが焦点の枠は出ず（:focus-visible でない）、スクロールする領域は動かない。生成が終わった後も焦点はタブにある", async ({
  page,
  adminOrg,
}) => {
  const { resultId } = submitType(adminOrg.organizationId, "conductor");
  await loginViaUi(page, adminOrg.ownerEmail);
  await openResultDetail(page, resultId, "?ai=training", "none");
  const ai = aiArea(page);
  const rd = resultDetail(page);
  const tab = ai.tab("training");
  const gen = ai.genButton("training");
  const activeInfo = () =>
    page.evaluate(() => ({
      id: document.activeElement?.id ?? "",
      focusVisible: document.activeElement?.matches(":focus-visible") ?? false,
    }));

  await gen.click();
  await expect(ai.select("tenure")).toBeFocused();
  await expect(ai.select("tenure")).toHaveAttribute("aria-invalid", "true");

  await selectTrainingContext(page, TRAINING_CONTEXT_SAMPLE);
  await stickToc(page, 400);
  await hideUnderToc(page, tab, "目次の下に入れた育成・定着のタブ");
  // 生成ボタンは目次の下端より下で、スクロールする領域の中に見えている（座標で押す。Playwright の自動のスクロールを通さない）
  const box = await rectOf(gen);
  expect(box.top).toBeGreaterThanOrEqual((await rectOf(rd.toc)).bottom);
  expect(box.bottom).toBeLessThanOrEqual((await rectOf(rd.scroll)).bottom);
  const release = await holdAiPost(page, resultId, "training");
  const before = await scrollTopOf(page);
  await page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await expect(ai.loadingIn("training")).toBeVisible();
  await expect(tab).toBeFocused();
  // 目次の下へ動かす処理（描いた後の次のフレーム）の後まで待ってから位置を比べる
  await nextFrames(page);
  expect(await activeInfo()).toEqual({ id: "ai-tab-training", focusVisible: false });
  expect(Math.abs((await scrollTopOf(page)) - before)).toBeLessThanOrEqual(1);
  release();
  await expect(ai.trainingView).toBeVisible({ timeout: 30_000 });
  expect(await activeInfo()).toEqual({ id: "ai-tab-training", focusVisible: false });
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
