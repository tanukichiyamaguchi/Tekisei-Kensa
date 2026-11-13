// 結果詳細の M7-result-33 目次、M7-result-34 狭い幅（K-22）、M7-result-35 アクセシビリティと焦点の見た目（K-49・K-50）
// （11-4 §5.3。§2.2・§2.3.2・§2.5・§2.13・§2.14・§2.15・§2.17。PR-7.8a・PR-7.8b の分）。axe は color-contrast も検査し、対象から外すのは
// 押せない状態の表示と文字のロゴ「適性検査」だけ（expectAccessibleAdmin）。結果詳細の枠 #rd は画面に固定され、11-4 の切り替え（1180・
// 1023・860・760・700・560px）は画面の幅の @media なので、管理画面の最小幅 1280px（.admin-root。文書の幅だけに効く）を外す PR-7.13a の
// 前でも、画面の幅を変えれば枠の中は PR-7.13a のあとと同じ幅で並ぶ。そこで枠の中の形（390×844・1000×800・700×900・320×640）・焦点の
// 枠・axe は今確かめる。390×844 で .rd-scroll が横に動かないことも今確かめる（PR-7.8b で旧のセクション 5・6 の ApexCharts の固定幅が
// 無くなった）。文書が横に動かないことだけは、.admin-root の最小幅 1280px（PR-7.13a で外す）で横に動くので fixme にする（11 総論 5.1、
// 11-4 §4.4）
import type { Locator, Page } from "@playwright/test";

import {
  activeOutline,
  COMMON_FOCUS_RING,
  expect,
  expectAccessibleAdmin,
  expectComparison,
  expectNoHorizontalScroll,
  focusByKeyboard,
  loginViaUi,
  moreTraitsButton,
  openResultDetail,
  rdFold,
  rdLearn,
  rdPopup,
  rdSection,
  rdStyle,
  rectOf,
  resultDetail,
  seedName,
  submitType,
  test,
  todayInTokyo,
  traitHelpButton,
  traitSortButtons,
  type AdminOrg,
} from "../support/admin-ui";

/** PR-7.13a が入ってから外す fixme の理由（11 総論 5.1、11-4 §4.4） */
const NARROW_FIXME =
  "390px では、管理画面の最小幅 1280px を外す PR-7.13a まで文書が横に動く（11 総論 5.1、11-4 §4.4）";

/** 目次のリンクと「↑ 先頭へ」、新しいレイアウトの中のボタンの焦点の枠（参照元の rs-nav・rs-v2 の指定。#1F2933 の 2px を 2px 外側） */
const RS_OUTLINE = {
  focusVisible: true,
  style: "solid",
  color: "rgb(31, 41, 51)",
  width: "2px",
  offset: "2px",
} as const;

type Rect = Awaited<ReturnType<typeof rectOf>>;
type Outline = Awaited<ReturnType<typeof activeOutline>>;

/**
 * 焦点のある要素の輪郭が expected になる。「回答一覧に戻る」は参照元の transition: 0.2s（すべての値）で焦点の枠も 0.2 秒で変わるので、
 * 変わり終わるまで待つ
 */
async function expectActiveOutline(page: Page, expected: Outline, label = ""): Promise<void> {
  await expect.poll(() => activeOutline(page), { message: label }).toEqual(expected);
}

/** コンダクタータイプの見本（テストテスト 50）の結果詳細を開く */
async function openConductor(page: Page, org: AdminOrg, query = ""): Promise<string> {
  const { resultId } = submitType(org.organizationId, "conductor");
  await loginViaUi(page, org.ownerEmail);
  await openResultDetail(page, resultId, query);
  return resultId;
}

/** たたんでいるセクションをすべて開く（画面の幅 700px 以下は概要以外がたたまれて始まる。11-4 §2.16） */
async function openAllSections(page: Page): Promise<void> {
  for (const id of ["rs-ov", "rs-tr", "rs-rk", "rs-fit", "rs-pf", "rs-ln", "rs-ss"]) {
    const fold = rdFold(page, id);
    if ((await fold.getAttribute("aria-expanded")) === "false") {
      await rdSection(page, id).locator(".sec-h h2").click();
      await expect(fold).toHaveAttribute("aria-expanded", "true");
    }
  }
}

/** スクロールする領域を動かして、目次を固定の状態にする */
async function stickToc(page: Page, top = 900): Promise<void> {
  await resultDetail(page).scroll.evaluate((el, y) => el.scrollTo(0, y), top);
  await expect(page.locator("#rsn")).toHaveClass("stuck");
}

/** grid の列の数 */
const columns = (locator: Locator): Promise<number> =>
  locator.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

/** inner が outer の中にある（±0.5px） */
function expectInside(inner: Rect, outer: Rect, label: string): void {
  expect(inner.left, label).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.top, label).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.right, label).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.bottom, label).toBeLessThanOrEqual(outer.bottom + 0.5);
}

/** 焦点のある部品の外側 4px（焦点の枠の 2px と、離す 2px）までが、スクロールする領域の縁の内側に入る（11-4 §2.2） */
async function expectRingInsideScroll(page: Page, target: Locator, label: string): Promise<void> {
  await expect(target).toBeFocused();
  const box = await rectOf(target);
  const ring = {
    left: box.left - 4,
    top: box.top - 4,
    right: box.right + 4,
    bottom: box.bottom + 4,
  };
  expectInside(ring, await rectOf(resultDetail(page).scroll), label);
}

/** 目次の今見ているセクションの行き先の先頭が、目次の下端から 16px（±1）に来るまで待つ（11-4 §2.5） */
async function expectLandedBelowToc(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const toc = await rectOf(resultDetail(page).toc);
      const target = await rectOf(page.locator(`#${id}`));
      return Math.abs(target.top - toc.bottom - 16) <= 1;
    })
    .toBe(true);
}

/**
 * M7-result-35 の axe（11-4 §5.3）: 比較未選択・比較あり・2 つのポップアップ・第二候補を出して接し方のタブを変えた状態・目次の固定の
 * 状態で、axe の重大・深刻な違反が無い。画面の大きさは page の大きさ。セクションはすべて開いて調べる
 */
async function expectAccessibleDetail(page: Page, size: string): Promise<void> {
  const rd = resultDetail(page);
  await openAllSections(page);
  await expectAccessibleAdmin(page, `比較未選択（${size}）`);

  await rd.scope.selectOption("organization");
  await expectComparison(page, "ready");
  await expectAccessibleAdmin(page, `比較あり（${size}）`);

  for (const side of ["high", "low"] as const) {
    await moreTraitsButton(page, side).click();
    await expect(rdPopup(page)).toBeVisible();
    await expectAccessibleAdmin(
      page,
      `${side === "high" ? "大きい" : "小さい"}場合のポップアップ（${size}）`,
    );
    await page.keyboard.press("Escape");
    await expect(rdPopup(page)).toHaveCount(0);
  }

  // 育て方の第二候補を出し、接し方のタブをエミアブルにした状態（§2.13.4・§2.14.4）
  await rdLearn(page).secondButton.click();
  await expect(rdLearn(page).second).toBeVisible();
  await rdStyle(page).tab("エミアブル").click();
  await expect(rdStyle(page).tab("エミアブル")).toHaveAttribute("aria-pressed", "true");
  await expectAccessibleAdmin(page, `第二候補を出しタブをエミアブルにした状態（${size}）`);

  await stickToc(page);
  await expectAccessibleAdmin(page, `目次の固定の状態（${size}）`);
}

/** 焦点の枠（部品の外側 4px）の矩形 */
const ringOf = (box: Rect): Rect => ({
  left: box.left - 4,
  top: box.top - 4,
  right: box.right + 4,
  bottom: box.bottom + 4,
});

/** 2 つの矩形が重なる（接するだけは重ならない） */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** カードの中の要素（SVG の中の図形と文字を除く）の左右が、カードの外形の内側にある（±0.5px）。外に出た要素の class か要素名を返す */
const outsideOfCard = (card: Locator): Promise<string[]> =>
  card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(el.querySelectorAll("*"))
      .filter((child) => (child.parentElement?.closest("svg") ?? null) === null)
      .filter((child) => {
        const r = child.getBoundingClientRect();
        return r.width > 0 && (r.left < box.left - 0.5 || r.right > box.right + 0.5);
      })
      .map((child) => child.getAttribute("class") ?? child.tagName.toLowerCase());
  });

/** 育て方・接し方のすべてのカード（左右のカード・関わり方のコツの 4 枚・タイプ別の接し方）で、中の要素がカードの外形の内側にある */
async function expectInsideLearnStyleCards(page: Page, size: string): Promise<void> {
  const cards = page.locator("#rs-ln .card, #rs-ss .card");
  await expect(cards).toHaveCount(9);
  for (const [i, card] of (await cards.all()).entries()) {
    expect(await outsideOfCard(card), `育て方・接し方のカード ${i + 1}（${size}）`).toEqual([]);
  }
}

/**
 * 焦点のある部品の焦点の枠（外側 4px）が、固定の状態の目次の下端より下で、.rd-scroll の縁の内側にある（領域を動かす処理は描いた後の
 * 次のフレームなので、そうなるまで待つ。11-4 §2.2・§2.5・§2.13）
 */
async function expectRingVisibleBelowToc(
  page: Page,
  target: Locator,
  label: string,
): Promise<void> {
  const rd = resultDetail(page);
  await expect(target).toBeFocused();
  await expect
    .poll(
      async () => {
        const ring = ringOf(await rectOf(target));
        const scroll = await rectOf(rd.scroll);
        const toc = await rectOf(rd.toc);
        return ring.top >= toc.bottom - 0.5 && ring.bottom <= scroll.bottom + 0.5;
      },
      { message: label },
    )
    .toBe(true);
  await expect(page.locator("#rsn")).toHaveClass("stuck");
  await expectRingInsideScroll(page, target, label);
}

test("M7-result-33 目次（1440×900）: スクロールすると固定の状態（氏名の欄と「↑ 先頭へ」、「目次」なし）で、上端はスクロールする領域の上端（縁 + 4px）に留まり、上の 4px を白い影で覆う。今見ているセクションに aria-current、リンク（育て方・接し方を含む 8 つ）で行き先の先頭が目次の下 16px、「↑ 先頭へ」で先頭に戻る", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  const toc = page.locator("#rsn");

  // 固定でないとき: 「目次」があり、氏名の欄と「↑ 先頭へ」は無い。先頭では最初の行き先（AI解説）を強調する
  await expect(toc).not.toHaveClass(/stuck/);
  await expect(toc.locator(".l")).toHaveText("目次");
  await expect(toc.locator(".l")).toBeVisible();
  await expect(toc.locator(".who")).toBeHidden();
  await expect(rd.toTop).toBeHidden();
  await expect(rd.tocLink("AI解説")).toHaveAttribute("aria-current", "true");
  await expect(page.locator('#rsn a[aria-current="true"]')).toHaveCount(1);

  // スクロールすると固定の状態（受験情報の 1 行の下端が領域の上端より上に出たとき）
  await stickToc(page, 600);
  await expect(toc.locator(".who")).toBeVisible();
  await expect(toc.locator(".who")).toHaveAttribute("aria-hidden", "true");
  await expect(toc.locator(".who b")).toHaveText(`${seedName(50)} さん`);
  await expect(toc.locator(".who span")).toHaveText(`${todayInTokyo().ymd} 受験`);
  await expect(toc.locator(".l")).toBeHidden();
  await expect(rd.toTop).toBeVisible();
  await expect(rd.toTop).toHaveText("↑ 先頭へ");
  await expect(toc).toHaveCSS("box-shadow", "rgb(184, 194, 204) 0px 6px 12px -8px");

  // 留まる位置: スクロールする領域の上端（.rd-scroll の縁から内側の余白 4px の下）。上の 4px は白い影で覆う（§2.2）
  const scrollBox = await rectOf(rd.scroll);
  const wrapBox = await rectOf(rd.tocWrap);
  expect(Math.abs(wrapBox.top - (scrollBox.top + 4))).toBeLessThanOrEqual(0.5);
  await expect(rd.tocWrap).toHaveCSS("box-shadow", "rgb(255, 255, 255) 0px -4px 0px 0px");
  await expect(rd.scroll).toHaveCSS("padding-top", "4px");
  await expect(rd.scroll).toHaveCSS("scroll-padding-top", "4px");

  // リンクで移る: 行き先の先頭が目次の下 16px に来て、そのリンクだけに aria-current（URL のハッシュは変えない）
  await expect(rd.tocLinks).toHaveCount(8);
  for (const [label, id] of [
    ["リスク", "rs-rk"],
    ["組織との相性", "rs-fit"],
    ["育て方", "rs-ln"],
    ["接し方", "rs-ss"],
    ["人物像", "rs-pf"],
    ["16の特性", "rs-tr"],
    ["AI解説", "ai"],
  ] as const) {
    await rd.tocLink(label).click();
    await expectLandedBelowToc(page, id);
    await expect(rd.tocLink(label)).toHaveAttribute("aria-current", "true");
    await expect(rd.tocLink(label)).toHaveClass("on");
    await expect(page.locator('#rsn a[aria-current="true"]')).toHaveCount(1);
  }
  expect(new URL(page.url()).hash).toBe("");

  // 「↑ 先頭へ」で先頭に戻り、固定の状態が外れる
  await rd.toTop.click();
  await expect.poll(() => rd.scroll.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(toc).not.toHaveClass(/stuck/);
});

test("M7-result-33 860×900: 固定の状態でも氏名の欄を出さず、「↑ 先頭へ」の左右の余白は 10px。留まる位置とリンクで移る先は同じ", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 860, height: 900 });
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  await stickToc(page, 600);
  await expect(page.locator("#rsn .who")).toBeHidden();
  await expect(rd.toTop).toBeVisible();
  await expect(rd.toTop).toHaveCSS("padding-left", "10px");
  await expect(rd.toTop).toHaveCSS("padding-right", "10px");
  const scrollBox = await rectOf(rd.scroll);
  expect(Math.abs((await rectOf(rd.tocWrap)).top - (scrollBox.top + 4))).toBeLessThanOrEqual(0.5);
  await rd.tocLink("人物像").click();
  await expectLandedBelowToc(page, "rs-pf");
  await expect(rd.tocLink("人物像")).toHaveAttribute("aria-current", "true");
});

test("M7-result-34 390×844（枠の中は画面の幅で並ぶ）: 概要・特性の詳細・相性・人物像・育て方・接し方・12 項目・関わり方のコツが 1 列、育て方の左のカードは留めない、リスクの札が隠れ棒が下の行、相性の線が下の行、タイプのカードは縦、見出しの塊はプルダウンとボタンが同じ行、新しいレイアウトは横にはみ出さない", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConductor(page, adminOrg, "?scope=organization");
  await openAllSections(page);
  const rd = resultDetail(page);

  // 1 列（1023px・760px・560px 以下。§2.17）
  for (const selector of [
    "#rs2 .hero",
    "#rs2 .kpi2",
    "#rs2 .sw",
    "#rs2 .detail",
    "#rs2 .fit",
    "#rs2 .prof",
    "#rs2 .learn",
    "#rs2 .dl2",
    "#rs2 .ss",
    "#rs2 .how",
  ]) {
    expect(await columns(page.locator(selector)), selector).toBe(1);
  }
  await expect(page.locator("#rs-hero .who")).toHaveCSS("flex-direction", "column");
  // 育て方の左のカードは留めない（760px 以下。§2.13・§2.17）
  await expect(rdLearn(page).left).toHaveCSS("position", "static");
  // 16の特性の行と目盛の行の列（760px 以下。110px・残り・40px・56px）
  await expect(page.locator("#rs-trc .tr").first()).toHaveCSS(
    "grid-template-columns",
    /^110px \S+ 40px 56px$/,
  );

  // リスク: 札を隠し、名前と値を 1 行目、棒を 2 行目の全幅（560px 以下）
  const risk = page.locator("#rs2 .rs").first();
  await expect(risk.locator(".lv")).toBeHidden();
  const riskName = await rectOf(risk.locator(".n"));
  const riskValue = await rectOf(risk.locator(".v"));
  const riskBar = await rectOf(risk.locator(".bar"));
  expect(Math.abs(riskName.top - riskValue.top)).toBeLessThanOrEqual(2);
  expect(riskBar.top).toBeGreaterThanOrEqual(Math.max(riskName.bottom, riskValue.bottom));
  expect(Math.abs(riskBar.left - riskName.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(riskBar.right - riskValue.right)).toBeLessThanOrEqual(0.5);

  // 組織との相性: 線を下の行の全幅に置き、左の言葉は左揃え・右の言葉は右揃え（560px 以下）
  const axis = page.locator("#rs-fitc .fr").first();
  const left = await rectOf(axis.locator(".l"));
  const right = await rectOf(axis.locator(".r"));
  const track = await rectOf(axis.locator(".track"));
  expect(track.top).toBeGreaterThanOrEqual(Math.max(left.bottom, right.bottom));
  expect(Math.abs(track.left - left.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(track.right - right.right)).toBeLessThanOrEqual(0.5);
  await expect(axis.locator(".l")).toHaveCSS("text-align", "left");
  await expect(axis.locator(".r")).toHaveCSS("text-align", "right");

  // 見出しの塊: 390px ではプルダウンとボタンが同じ行（§2.3.2）
  const scope = await rectOf(rd.scope);
  const download = await rectOf(rd.download);
  expect(Math.abs(scope.top - download.top)).toBeLessThanOrEqual(0.5);
  expectInside(download, await rectOf(rd.head), "ダウンロード");

  // 新しいレイアウト（#rs2）は横にはみ出さない。育て方・接し方の中の要素もカードの外形の内側（.rd-scroll は下の別のテスト、文書の
  // 横の動きは下の fixme）
  const layout = await rd.layout.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
  await expectInsideLearnStyleCards(page, "390×844");

  // ポップアップ: 幅は画面の幅 − 32px（358px）で画面の中央。表（最小幅 480px）は入れ物の中で横に動き、そのときだけ入れ物が
  // 焦点を受ける（tabindex 0・role region・見出しと同じ読み上げ名。11 総論 8.5）
  await moreTraitsButton(page, "high").click();
  const popup = rdPopup(page);
  await expect(popup).toBeVisible();
  const popupBox = await rectOf(popup);
  expect(Math.round(popupBox.right - popupBox.left)).toBe(358);
  expect(Math.abs(popupBox.left - 16)).toBeLessThanOrEqual(0.5);
  const body = popup.locator(".dialog__body");
  const overflow = await body.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  await expect(body).toHaveAttribute("tabindex", "0");
  await expect(body).toHaveAttribute("role", "region");
  await expect(body).toHaveAttribute("aria-label", "項目のポイントが大きい場合の特性");
  await page.keyboard.press("Escape");

  // 1440×900 では幅 800px で、表がはみ出さないので入れ物は焦点を受けない
  await page.setViewportSize({ width: 1440, height: 900 });
  await moreTraitsButton(page, "high").click();
  await expect(rdPopup(page)).toBeVisible();
  await expect(rdPopup(page).locator(".dialog__body")).not.toHaveAttribute("tabindex");
  const wide = await rectOf(rdPopup(page));
  expect(Math.round(wide.right - wide.left)).toBe(800);
});

test("M7-result-34 1000×800: 特性の詳細が 2 列、概要の上段が 1 列、下段が 2 列で 3 枚目が全幅、組織との相性と人物像が 1 列、リスクの行の列が 1fr・160px・48px・64px。育て方の左は 240px・接し方の左は 250px、12 項目と関わり方のコツは 2 列、左のカードは留まる。4 区分の表は 280px まででマスは折り返さず、はみ出してもカードの外形の内側", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openConductor(page, adminOrg, "?scope=organization");
  expect(await columns(page.locator("#rs2 .detail"))).toBe(2);
  expect(await columns(page.locator("#rs2 .hero"))).toBe(1);
  expect(await columns(page.locator("#rs2 .sw"))).toBe(2);
  expect(await columns(page.locator("#rs2 .fit"))).toBe(1);
  expect(await columns(page.locator("#rs2 .prof"))).toBe(1);
  const sw = await rectOf(page.locator("#rs-sw"));
  const third = await rectOf(page.locator("#rs-risk1"));
  expect(Math.abs(third.left - sw.left)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(third.right - sw.right)).toBeLessThanOrEqual(0.5);
  await expect(page.locator("#rs2 .rs").first()).toHaveCSS(
    "grid-template-columns",
    /^\S+ 160px 48px 64px$/,
  );

  // 育て方・接し方（1023px 以下。§2.13・§2.14・§2.17）: 左の列は 240px・250px、12 項目と関わり方のコツは 2 列、左のカードは留まる
  await expect(page.locator("#rs2 .learn")).toHaveCSS("grid-template-columns", /^240px \S+$/);
  await expect(page.locator("#rs2 .ss")).toHaveCSS("grid-template-columns", /^250px \S+$/);
  expect(await columns(page.locator("#rs2 .dl2"))).toBe(2);
  expect(await columns(page.locator("#rs2 .how"))).toBe(2);
  await expect(rdLearn(page).left).toHaveCSS("position", "sticky");
  // 4 区分の表と注記は最大の幅 280px、マスは余白 10px・文字 11px・折り返さない。マスが中身の幅をはみ出しても（文字の幅による。
  // 参照元の値のまま）カードの外形の内側に収まる
  const style = rdStyle(page);
  await expect(page.locator("#rs2 .quad")).toHaveCSS("max-width", "280px");
  await expect(page.locator("#rs2 .qax")).toHaveCSS("max-width", "280px");
  for (const cell of await style.quadCells.all()) {
    await expect(cell).toHaveCSS("padding", "10px");
    await expect(cell).toHaveCSS("font-size", "11px");
    await expect(cell).toHaveCSS("white-space", "nowrap");
  }
  await expectInsideLearnStyleCards(page, "1000×800");

  // 枠の中は横にはみ出さない（1000px は文書の幅 1280px より狭いが、#rd は画面に固定）
  for (const [label, locator] of [
    [".rd-scroll", resultDetail(page).scroll],
    ["#rs2", resultDetail(page).layout],
  ] as const) {
    const scroll = await locator.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll.scroll, label).toBeLessThanOrEqual(scroll.client);
  }
});

test("M7-result-34 700×900（760px 以下）: 育て方・12 項目・接し方・関わり方のコツが 1 列で、育て方の左のカードは留めずに 2 列の先頭と一緒に流れる", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await openConductor(page, adminOrg);
  // 700px 以下は概要以外がたたまれて始まる（§2.16）ので開く
  await openAllSections(page);
  for (const selector of ["#rs2 .learn", "#rs2 .dl2", "#rs2 .ss", "#rs2 .how"]) {
    expect(await columns(page.locator(selector)), selector).toBe(1);
  }
  const ln = rdLearn(page);
  await expect(ln.left).toHaveCSS("position", "static");
  // 2 列の先頭を、1440px なら留まる位置（領域の上端 + 72px）より 40px 上に出しても、左のカードは先頭と一緒に流れる
  const rd = resultDetail(page);
  const stuckTop = (await rectOf(rd.scroll)).top + 4 + 72;
  await rd.scroll.evaluate(
    (el, dy) => {
      el.scrollTop += dy;
    },
    (await rectOf(ln.root)).top - (stuckTop - 40),
  );
  const root = await rectOf(ln.root);
  const left = await rectOf(ln.left);
  expect(Math.abs(left.top - root.top)).toBeLessThanOrEqual(0.5);
  expect(left.top).toBeLessThan(stuckTop - 30);
  await expectInsideLearnStyleCards(page, "700×900");
});

test("M7-result-34 320×640（枠の最小幅）: 見出しの塊でプルダウンは幅 180px のまま、「ダウンロード」はプルダウンの下の行で右に寄り（行の間 8px・高さ 44px・文字は 1 行）、どちらも見出しの塊の中に入る。育て方・接し方は 1 列で、中の要素はカードの外形の内側", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  const head = await rectOf(rd.head);
  const scope = await rectOf(rd.scope);
  const download = await rectOf(rd.download);
  expect(Math.round(scope.right - scope.left)).toBe(180);
  expect(Math.round(scope.bottom - scope.top)).toBe(44);
  // ボタンはプルダウンの下の行（行の間 8px）で右に寄る
  expect(Math.abs(download.top - (scope.bottom + 8))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(download.right - head.right)).toBeLessThanOrEqual(0.5);
  // ボタンの文字は 1 行で、高さ 44px
  expect(Math.round(download.bottom - download.top)).toBe(44);
  const lines = await rd.download.evaluate((el) => {
    const range = document.createRange();
    const text = Array.from(el.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (!text) return 0;
    range.selectNodeContents(text);
    return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
  // どちらも見出しの塊の幅の中（プルダウンの右の 10px も含めて）
  expectInside(scope, head, "比較組織のプルダウン");
  expect(scope.right + 10).toBeLessThanOrEqual(head.right + 0.5);
  expectInside(download, head, "ダウンロード");

  // 育て方・接し方（§2.17）: 1 列で、中の要素はカードの外形の内側（4 区分の表のマスは折り返さず、文字の幅によってはカードの中身の
  // 幅をはみ出すが、カードの内側の余白の中に収まる。参照元の値のまま。11-4 §2.17）。#rs2 と .rd-scroll の横の動きは上半分の
  // 16の特性の行などによる（11-4 §2.17 の 320×640 のはみ出し）ので、ここでは確かめない
  await openAllSections(page);
  await rdLearn(page).secondButton.click();
  await expect(rdLearn(page).second).toBeVisible();
  for (const selector of ["#rs2 .learn", "#rs2 .ss", "#rs2 .how"]) {
    expect(await columns(page.locator(selector)), selector).toBe(1);
  }
  await expectInsideLearnStyleCards(page, "320×640");
});

test("M7-result-35 1440×900: 比較未選択・比較あり・2 つのポップアップ・第二候補とタブ・目次の固定の状態で axe の重大・深刻な違反が無い", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  await expectAccessibleDetail(page, "1440×900");
});

test("M7-result-35 390×844: 比較未選択・比較あり・2 つのポップアップ・第二候補とタブ・目次の固定の状態で axe の重大・深刻な違反が無い", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConductor(page, adminOrg);
  await expectAccessibleDetail(page, "390×844");
});

test("M7-result-35 名前と状態: プルダウン「比較組織」、目次の nav（リンク 8 つ）、並び替え・項目の説明・タブの aria-pressed、たたむの aria-expanded。キーボードだけで並び替え・説明・ポップアップ・たたむ・第二候補・タブを操作できる", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  await expect(page.getByRole("combobox", { name: "比較組織" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "このページの目次" })).toBeVisible();
  await expect(rd.toc.locator("a")).toHaveCount(8);

  // 並び替え: Enter と Space
  const byItem = traitSortButtons(page).filter({ hasText: "項目順" });
  const byScore = traitSortButtons(page).filter({ hasText: "点数の高い順" });
  await expect(byScore).toHaveAttribute("aria-pressed", "true");
  await focusByKeyboard(byItem);
  await page.keyboard.press("Enter");
  await expect(byItem).toHaveAttribute("aria-pressed", "true");
  await expect(byScore).toHaveAttribute("aria-pressed", "false");
  await focusByKeyboard(byScore);
  await page.keyboard.press("Space");
  await expect(byScore).toHaveAttribute("aria-pressed", "true");

  // 項目の説明: Space で開き、Enter で閉じる
  const help = traitHelpButton(page, "優劣性");
  await expect(help).toHaveAttribute("aria-pressed", "false");
  await focusByKeyboard(help);
  await page.keyboard.press("Space");
  await expect(help).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#rs-trc .sk-p")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(help).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#rs-trc .sk-p")).toHaveCount(0);

  // ポップアップ: Enter で開くと閉じるボタンに焦点、Esc で閉じて開いたボタンに戻る
  const more = moreTraitsButton(page, "low");
  await focusByKeyboard(more);
  await page.keyboard.press("Enter");
  await expect(rdPopup(page)).toBeVisible();
  await expect(rdPopup(page).getByRole("button", { name: "閉じる" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rdPopup(page)).toHaveCount(0);
  await expect(more).toBeFocused();

  // たたむ: Enter でたたみ、Space で開く
  const fold = rdFold(page, "rs-rk");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await focusByKeyboard(fold);
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(rdSection(page, "rs-rk")).toHaveClass("sec fold");
  await page.keyboard.press("Space");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(rdSection(page, "rs-rk")).toHaveClass("sec");

  // 第二候補のボタン: Enter で出し、Space で閉じる。焦点はボタンに残り、状態はボタンの文で伝える（§2.13.4）
  const ln = rdLearn(page);
  await focusByKeyboard(ln.secondButton);
  await page.keyboard.press("Enter");
  await expect(ln.second).toBeVisible();
  await expect(ln.secondButton).toHaveText("第二候補を閉じる");
  await expect(ln.secondButton).toBeFocused();
  await page.keyboard.press("Space");
  await expect(ln.second).toHaveCount(0);
  await expect(ln.secondButton).toHaveText("第二候補を見る\u3000＞");
  await expect(ln.secondButton).toBeFocused();

  // 接し方のタブ: 選んでいるタブに aria-pressed="true"。Tab で隣のタブへ移り、Enter と Space で押せる（§2.14.4）
  const ss = rdStyle(page);
  await expect(ss.tab("ドライビング")).toHaveAttribute("aria-pressed", "true");
  await focusByKeyboard(ss.tab("ドライビング"));
  await page.keyboard.press("Tab");
  await expect(ss.tab("エクスプレッシブ")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ss.tab("エクスプレッシブ")).toHaveAttribute("aria-pressed", "true");
  await expect(ss.tab("ドライビング")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Tab");
  await expect(ss.tab("エミアブル")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(ss.tab("エミアブル")).toHaveAttribute("aria-pressed", "true");
  await expect(ss.tab("エクスプレッシブ")).toHaveAttribute("aria-pressed", "false");
  await expect(ss.tabs.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);

  // 「↑ 先頭へ」: Enter で先頭に戻ると「↑ 先頭へ」は隠れるので、焦点は見出し（h1。輪郭を出さない）に移り、次の Tab は比較組織の
  // プルダウン（焦点が失われない。§2.5）
  await stickToc(page);
  await focusByKeyboard(rd.toTop, true);
  await page.keyboard.press("Enter");
  await expect.poll(() => rd.scroll.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(rd.toTop).toBeHidden();
  await expect(rd.title).toBeFocused();
  await expect(rd.title).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Tab");
  await expect(rd.scope).toBeFocused();
});

test("M7-result-35 焦点の見た目: 「回答一覧に戻る」「ダウンロード」とポップアップの閉じるボタン・表の入れ物は共通の焦点の枠、目次と新しいレイアウトの中のボタン（第二候補のボタンと接し方のタブを含む）は #1F2933", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);

  // 参照元に焦点の見た目の定めが無い部品: 管理画面に共通の焦点の枠（§2.2）
  await focusByKeyboard(rd.back);
  await expectActiveOutline(page, COMMON_FOCUS_RING);
  await focusByKeyboard(rd.download);
  await expectActiveOutline(page, COMMON_FOCUS_RING);
  const more = moreTraitsButton(page, "high");
  await focusByKeyboard(more);
  await expectActiveOutline(page, RS_OUTLINE);
  await page.keyboard.press("Enter");
  await expect(rdPopup(page).getByRole("button", { name: "閉じる" })).toBeFocused();
  await expectActiveOutline(page, COMMON_FOCUS_RING);
  await page.keyboard.press("Escape");

  // 参照元が定めている部品: 新しいレイアウトの中のボタン（たたむ・項目の説明）と「↑ 先頭へ」は #1F2933 を 2px 外
  await focusByKeyboard(rdFold(page, "rs-ov"));
  await expectActiveOutline(page, RS_OUTLINE);
  await focusByKeyboard(traitHelpButton(page, "協力性"));
  await expectActiveOutline(page, RS_OUTLINE);
  await focusByKeyboard(rdLearn(page).secondButton);
  await expectActiveOutline(page, RS_OUTLINE);
  await focusByKeyboard(rdStyle(page).tab("エミアブル"));
  await expectActiveOutline(page, RS_OUTLINE);
  await stickToc(page);
  await focusByKeyboard(rd.toTop, true);
  await expectActiveOutline(page, RS_OUTLINE);

  // 390×844: 表の入れ物が横に動くと焦点を受け、共通の焦点の枠はポップアップの中に収まる（§2.15）
  await page.setViewportSize({ width: 390, height: 844 });
  await rd.scroll.evaluate((el) => el.scrollTo(0, 0));
  await focusByKeyboard(more);
  await page.keyboard.press("Enter");
  const popup = rdPopup(page);
  await expect(popup.getByRole("button", { name: "閉じる" })).toBeFocused();
  const body = popup.locator(".dialog__body");
  await expect(body).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Tab");
  await expect(body).toBeFocused();
  await expectActiveOutline(page, COMMON_FOCUS_RING);
  const bodyBox = await rectOf(body);
  expectInside(
    {
      left: bodyBox.left - 4,
      top: bodyBox.top - 4,
      right: bodyBox.right + 4,
      bottom: bodyBox.bottom + 4,
    },
    await rectOf(popup),
    "表の入れ物の焦点の枠",
  );
});

test("M7-result-35 焦点の枠の形: 「ダウンロード」と固定の状態の「↑ 先頭へ」の焦点の枠（外側 4px）が .rd-scroll の縁の内側に入る（1440×900・1000×800・390×844）", async ({
  page,
  adminOrg,
}) => {
  const resultId = await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  for (const [width, height] of [
    [1440, 900],
    [1000, 800],
    [390, 844],
  ] as const) {
    const size = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await openResultDetail(page, resultId);
    await focusByKeyboard(rd.download);
    await expectActiveOutline(page, COMMON_FOCUS_RING);
    await expectRingInsideScroll(page, rd.download, `ダウンロード（${size}）`);

    // 「↑ 先頭へ」は Shift+Tab と Tab で当てる（Tab の先の AI 解説の領域へ領域が動いて固定が外れないように）
    await stickToc(page);
    await focusByKeyboard(rd.toTop, true);
    await expectActiveOutline(page, RS_OUTLINE);
    await expectRingInsideScroll(page, rd.toTop, `↑ 先頭へ（${size}）`);
  }
});

test("M7-result-35 留まる左のカードとタブの焦点の枠: 育て方の左のカードが留まる所までスクロールしてから、キーボードで第二候補のボタンに焦点を移すと、焦点の枠の外側 4px が .rd-scroll の縁の内側にあり、留まった目次の下端より下にある（1440×900・1000×800）。接し方のタブの焦点の枠は隣のタブに重ならず、カードの中に収まる（1440×900・390×844）", async ({
  page,
  adminOrg,
}) => {
  const resultId = await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  const ln = rdLearn(page);
  for (const [width, height] of [
    [1440, 900],
    [1000, 800],
  ] as const) {
    const size = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await openResultDetail(page, resultId);
    // 2 列の先頭を、留まる位置（領域の上端 + 72px）より 40px 上に出す（左のカードが留まる）
    const stuckTop = (await rectOf(rd.scroll)).top + 4 + 72;
    await rd.scroll.evaluate(
      (el, dy) => {
        el.scrollTop += dy;
      },
      (await rectOf(ln.root)).top - (stuckTop - 40),
    );
    await expect(page.locator("#rsn")).toHaveClass("stuck");
    expect(Math.abs((await rectOf(ln.left)).top - stuckTop), size).toBeLessThanOrEqual(0.5);

    // 次の部品（接し方の「たたむ」）に画面を動かさずに焦点を置き、Shift+Tab で第二候補のボタンに戻る。ブラウザは部品を見える位置まで
    // 動かす（カードが領域より高い 1000×800 では、留まりが外れるまで動く）
    await rdFold(page, "rs-ss").evaluate((el) => {
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    });
    await page.keyboard.press("Shift+Tab");
    await expect(ln.secondButton).toBeFocused();
    await expectActiveOutline(page, RS_OUTLINE, size);
    await expectRingVisibleBelowToc(page, ln.secondButton, `第二候補のボタン（${size}）`);
    expectInside(
      ringOf(await rectOf(ln.secondButton)),
      await rectOf(ln.left),
      `第二候補のボタンの焦点の枠は左のカードの中（${size}）`,
    );
  }

  // 接し方のタブ（間 6px・折り返しあり。§2.14.4）: どのタブの焦点の枠（外側 4px）も、隣のタブに重ならず、カードの中に収まる
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    const size = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await openResultDetail(page, resultId);
    await openAllSections(page);
    const tabs = rdStyle(page).tabs;
    await expect(tabs).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      const label = `タブ ${i + 1}（${size}）`;
      // 最後のタブは Shift+Tab と Tab で当てる（Tab の先に部品が無い）
      await focusByKeyboard(tabs.nth(i), i === 3);
      await expectActiveOutline(page, RS_OUTLINE, label);
      const ring = ringOf(await rectOf(tabs.nth(i)));
      for (let j = 0; j < 4; j += 1) {
        if (j !== i) expect(overlaps(ring, await rectOf(tabs.nth(j))), label).toBe(false);
      }
      expectInside(ring, await rectOf(rdStyle(page).mine), label);
      await expectRingInsideScroll(page, tabs.nth(i), label);
    }
  }
});

test("M7-result-35 第二候補を押したあとの焦点の枠: キーボードで第二候補のボタンを押して出したとき・閉じたときも、焦点はボタンに残り、右のカードの高さが変わって留まる左のカードが動いても、焦点の枠の外側 4px が .rd-scroll の縁の内側で、留まった目次の下端より下にある（1000×800・1024×768・1440×900）", async ({
  page,
  adminOrg,
}) => {
  const resultId = await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  const ln = rdLearn(page);
  for (const [width, height] of [
    [1000, 800],
    [1024, 768],
    [1440, 900],
  ] as const) {
    const size = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await openResultDetail(page, resultId);
    // 育て方の見出しの行を領域の上端から 300px に出し、「たたむ」から Tab で第二候補のボタンへ移る（左のカードが見える高さより高い
    // 1000×800・1024×768 では、留まりが外れる所まで動く。§2.13）
    const fold = rdFold(page, "rs-ln");
    await rd.scroll.evaluate(
      (el, dy) => {
        el.scrollTop += dy;
      },
      (await rectOf(fold)).top - ((await rectOf(rd.scroll)).top + 300),
    );
    await focusByKeyboard(fold);
    await page.keyboard.press("Tab");
    await expectRingVisibleBelowToc(page, ln.secondButton, `Tab で移した（${size}）`);

    // Enter で出す: 右のカードが伸びて左のカードがまた留まり、ボタンが下の縁の外に出るなら、留まりが外れる所（第二候補の終わり）まで動く
    await page.keyboard.press("Enter");
    await expect(ln.second).toBeVisible();
    await expect(ln.secondButton).toHaveText("第二候補を閉じる");
    await expectRingVisibleBelowToc(page, ln.secondButton, `Enter で出したあと（${size}）`);

    // 次の部品（接し方の「たたむ」）へ Tab で移り（領域が第二候補の終わりの先へ動き、左のカードは留まりが外れる）、Shift+Tab で戻って
    // Enter で閉じる: 右のカードが縮んで左のカードが上の縁の外へ動いても、目次の下 4px まで戻る
    await page.keyboard.press("Tab");
    await expect(rdFold(page, "rs-ss")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expectRingVisibleBelowToc(page, ln.secondButton, `Shift+Tab で戻った（${size}）`);
    await page.keyboard.press("Enter");
    await expect(ln.second).toHaveCount(0);
    await expect(ln.secondButton).toHaveText("第二候補を見る　＞");
    await expectRingVisibleBelowToc(page, ln.secondButton, `Enter で閉じたあと（${size}）`);

    // Space でもう一度出しても同じ
    await page.keyboard.press("Space");
    await expect(ln.second).toBeVisible();
    await expectRingVisibleBelowToc(page, ln.secondButton, `Space で出したあと（${size}）`);
  }
});

test("M7-result-35 焦点が目次の下に隠れず下の縁で切れない: 目次が固定の状態で、目次の下に入った部品へ Shift+Tab で戻ると、その部品と焦点の枠の外側 4px が目次の下端より下に出る（目次は固定のまま）。下の縁の近くの部品へ Tab で移すと、焦点の枠の外側 4px が下の縁の内側に入る（1440×900）", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  await stickToc(page);

  // 項目の説明のボタン（項目順の 16 個。1440×900 では 2 段に折り返す）の 1 段目の最後と 2 段目の最初
  const buttons = page.locator("#rs-trc .sk-b button");
  const tops = await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  const secondRow = tops.findIndex((top) => top > (tops[0] ?? 0) + 1);
  expect(secondRow).toBeGreaterThan(0);
  const hidden = buttons.nth(secondRow - 1);
  const next = buttons.nth(secondRow);

  // 2 段目の最初のボタンを目次の下端から 8px 下に置く（1 段目は目次の下に入る）
  const tocBottom = (await rectOf(rd.toc)).bottom;
  const nextTop = (await rectOf(next)).top;
  await rd.scroll.evaluate(
    (el, dy) => {
      el.scrollTop += dy;
    },
    nextTop - (tocBottom + 8),
  );
  await expect(page.locator("#rsn")).toHaveClass("stuck");
  expect((await rectOf(hidden)).top).toBeLessThan((await rectOf(rd.toc)).bottom);

  // 2 段目の最初のボタンからキーボードで 1 つ戻る
  await focusByKeyboard(next);
  await page.keyboard.press("Shift+Tab");
  await expect(hidden).toBeFocused();
  await expectActiveOutline(page, RS_OUTLINE);
  await expect
    .poll(async () => (await rectOf(hidden)).top - 4 - (await rectOf(rd.toc)).bottom)
    .toBeGreaterThanOrEqual(-0.5);
  await expect(page.locator("#rsn")).toHaveClass("stuck");
  await expectRingInsideScroll(page, hidden, "目次の下から戻した項目の説明のボタン");

  // 下の縁: 2 段目の最初のボタンを、下の縁の外（一部だけ見える位置・まったく見えない位置）と、縁から 2px 内側に置き、1 段目の最後から
  // Tab で移すと、ブラウザが縁に合わせて動かしても、焦点の枠の外側 4px が下の縁の内側に入る（scroll-padding-bottom 4px。§2.2）
  for (const offset of [10, 30, -2]) {
    const scrollBottom = (await rectOf(rd.scroll)).bottom;
    const nextBottom = (await rectOf(next)).bottom;
    await rd.scroll.evaluate(
      (el, dy) => {
        el.scrollTop += dy;
      },
      nextBottom - (scrollBottom + offset),
    );
    // 1 段目の最後のボタンには Shift+Tab と Tab で当てる（Tab の先の 2 段目のボタンを先に動かさないように）
    await focusByKeyboard(hidden, true);
    await page.keyboard.press("Tab");
    await expect(next).toBeFocused();
    await expect
      .poll(async () => (await rectOf(next)).bottom + 4 - (await rectOf(rd.scroll)).bottom)
      .toBeLessThanOrEqual(0.5);
    await expectRingInsideScroll(
      page,
      next,
      `下の縁の近くに Tab で移した項目の説明のボタン（${offset}px）`,
    );
  }
});

test("M7-result-35 焦点の枠の形: 目次のリンク（固定でない・固定の状態、390×844 では並びの両端）は −3px、並び替えのボタンは −4px で部品の内側に出る。今見ているセクションの内側の枠 #4395AB は焦点のときも残る", async ({
  page,
  adminOrg,
}) => {
  const resultId = await openConductor(page, adminOrg, "?scope=organization");
  const rd = resultDetail(page);
  const links = page.locator("#rsn .links");
  const linkRing = { ...RS_OUTLINE, offset: "-3px" };

  /** 焦点のある部品の焦点の枠の外の端が、部品の縁からどれだけ内側にあるか（画面で測った −（outline-offset + outline-width）） */
  const ringInset = async (): Promise<number> => {
    const outline = await activeOutline(page);
    return -(Number.parseFloat(outline.offset) + Number.parseFloat(outline.width));
  };

  /**
   * リンクに焦点を当て、枠がリンクの内側（offset −3px。枠の外の端はリンクの縁から 1px 内側）に描かれ、その枠がリンクの並びの中に
   * 入る（並びは横にスクロールするので、端のリンクは焦点を当てると並びが動いて見える位置に来る）。枠の外の端の位置は、画面で測った
   * outline-offset と outline-width から求める
   */
  const expectInnerLinkRing = async (link: Locator, label: string) => {
    await focusByKeyboard(link);
    await expectActiveOutline(page, linkRing, label);
    const inset = await ringInset();
    expect(inset, label).toBe(1);
    const box = await rectOf(link);
    expectInside(
      {
        left: box.left + inset,
        top: box.top + inset,
        right: box.right - inset,
        bottom: box.bottom - inset,
      },
      await rectOf(links),
      label,
    );
  };

  // 固定でない状態と固定の状態（1440×900）
  await expectInnerLinkRing(rd.tocLink("概要"), "目次のリンク（固定でない）");
  await stickToc(page);
  await expectInnerLinkRing(rd.tocLink("組織との相性"), "目次のリンク（固定の状態）");

  // 今見ているセクションのリンク: 内側の 1px の枠は焦点の枠の外に残る
  const current = page.locator("#rsn a.on");
  await expect(current).toHaveCount(1);
  await expectInnerLinkRing(current, "今見ているセクションのリンク");
  await expect(current).toHaveCSS("box-shadow", "rgb(67, 149, 171) 0px 0px 0px 1px inset");

  // 並び替えのボタン: −4px（画面で測った枠の外の端がボタンの縁から 2px 内側）。ボタンは並びの中なので、枠も並びの外に出ない
  const sortButtons = traitSortButtons(page);
  await expect(sortButtons).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const label = `並び替えのボタン ${i + 1}`;
    const button = sortButtons.nth(i);
    await focusByKeyboard(button);
    await expectActiveOutline(page, { ...RS_OUTLINE, offset: "-4px" }, label);
    expect(await ringInset(), label).toBe(2);
    expectInside(await rectOf(button), await rectOf(page.locator("#rs-trc .seg")), label);
  }

  // 390×844: リンクの並びは横にはみ出して動く。両端のリンクに焦点を当てると並びが動き、リンクは並びの中に見える
  await page.setViewportSize({ width: 390, height: 844 });
  await openResultDetail(page, resultId, "?scope=organization");
  const overflow = await links.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  await expectInnerLinkRing(rd.tocLink("接し方"), "目次の右端のリンク（390、固定でない）");
  await expectInnerLinkRing(rd.tocLink("AI解説"), "目次の左端のリンク（390、固定でない）");
  await stickToc(page);
  await expectInnerLinkRing(rd.tocLink("接し方"), "目次の右端のリンク（390、固定の状態）");
  await expectInnerLinkRing(rd.tocLink("AI解説"), "目次の左端のリンク（390、固定の状態）");
});

// 390×844 のスクロールする領域と文書の横の動き（11-4 §5.3 の M7-result-34 のページ全体の分、§2.17・§4.4）。.rd-scroll は、横に
// 動かしていた旧のセクション 5・6 の ApexCharts の固定幅が PR-7.8b で無くなったので今確かめ、文書は PR-7.13a が入ってから fixme を外す
test("M7-result-34 390×844: スクロールする領域 .rd-scroll が横に動かない（すべて開き、第二候補を出した状態）", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConductor(page, adminOrg, "?scope=organization");
  await openAllSections(page);
  const expectNoScrollX = async (label: string) => {
    const scroll = await resultDetail(page).scroll.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll.scroll, label).toBeLessThanOrEqual(scroll.client);
  };
  await expectNoScrollX(".rd-scroll（390×844）");
  await rdLearn(page).secondButton.click();
  await expect(rdLearn(page).second).toBeVisible();
  await expectNoScrollX(".rd-scroll（390×844・第二候補を出した状態）");
});

test.describe("ページ全体の狭い幅（390×844）", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-result-34 390×844: 文書が横に動かない", async ({ page, adminOrg }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openConductor(page, adminOrg, "?scope=organization");
    await expectNoHorizontalScroll(page, "文書（390×844）");
  });
});
