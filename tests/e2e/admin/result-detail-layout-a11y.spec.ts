// 結果詳細の M7-result-33 目次、M7-result-34 狭い幅（K-22）、M7-result-35 アクセシビリティと焦点の見た目（K-49・K-50）
// （11-4 §5.3。§2.2・§2.3.2・§2.5・§2.15・§2.17。PR-7.8a の分）。axe は color-contrast も検査し、対象から外すのは押せない状態の表示と
// 文字のロゴ「適性検査」だけ（expectAccessibleAdmin）。結果詳細の枠 #rd は画面に固定され、11-4 の切り替え（1180・1023・860・760・700・
// 560px）は画面の幅の @media なので、管理画面の最小幅 1280px（.admin-root。文書の幅だけに効く）を外す PR-7.13a の前でも、画面の幅を
// 変えれば枠の中は PR-7.13a のあとと同じ幅で並ぶ。そこで枠の中の形（390×844・1000×800・320×640）・焦点の枠・axe は今確かめる。
// 390×844 で文書と .rd-scroll が横に動かないことだけは、文書が .admin-root の最小幅 1280px（PR-7.13a）、.rd-scroll が新しい
// レイアウトの後ろに残る旧のセクション 5・6 の ApexCharts の固定幅（PR-7.8b）で横に動くので fixme にする（11 総論 5.1、11-4 §4.4）
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
  rdPopup,
  rdSection,
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

/** PR-7.13a と PR-7.8b の両方が入ってから外す fixme の理由（11 総論 5.1、11-4 §4.4） */
const NARROW_FIXME =
  "390px では、管理画面の最小幅 1280px を外す PR-7.13a まで文書が、旧のセクション 5・6 の ApexCharts（固定幅 440・484px）を消す PR-7.8b まで .rd-scroll が横に動く（11 総論 5.1、11-4 §4.4）";

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
  for (const id of ["rs-ov", "rs-tr", "rs-rk", "rs-fit", "rs-pf"]) {
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
 * M7-result-35 の axe（11-4 §5.3）: 比較未選択・比較あり・2 つのポップアップ・目次の固定の状態で、axe の重大・深刻な違反が無い。
 * 画面の大きさは page の大きさ。セクションはすべて開いて調べる
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

  await stickToc(page);
  await expectAccessibleAdmin(page, `目次の固定の状態（${size}）`);
}

test("M7-result-33 目次（1440×900）: スクロールすると固定の状態（氏名の欄と「↑ 先頭へ」、「目次」なし）で、上端はスクロールする領域の上端（縁 + 4px）に留まり、上の 4px を白い影で覆う。今見ているセクションに aria-current、リンクで行き先の先頭が目次の下 16px、「↑ 先頭へ」で先頭に戻る", async ({
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
  for (const [label, id] of [
    ["リスク", "rs-rk"],
    ["組織との相性", "rs-fit"],
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

test("M7-result-34 390×844（枠の中は画面の幅で並ぶ）: 概要・特性の詳細・相性・人物像が 1 列、リスクの札が隠れ棒が下の行、相性の線が下の行、タイプのカードは縦、見出しの塊はプルダウンとボタンが同じ行、新しいレイアウトは横にはみ出さない", async ({
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
  ]) {
    expect(await columns(page.locator(selector)), selector).toBe(1);
  }
  await expect(page.locator("#rs-hero .who")).toHaveCSS("flex-direction", "column");
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

  // 新しいレイアウト（#rs2）は横にはみ出さない（文書と .rd-scroll の横の動きは下の fixme）
  const layout = await rd.layout.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.client);

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

test("M7-result-34 1000×800: 特性の詳細が 2 列、概要の上段が 1 列、下段が 2 列で 3 枚目が全幅、組織との相性と人物像が 1 列、リスクの行の列が 1fr・160px・48px・64px", async ({
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
  // 枠の中は横にはみ出さない（1000px は文書の幅 1280px より狭いが、#rd は画面に固定）
  const scroll = await resultDetail(page).scroll.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
});

test("M7-result-34 320×640（枠の最小幅）: 見出しの塊でプルダウンは幅 180px のまま、「ダウンロード」はプルダウンの下の行で右に寄り（行の間 8px・高さ 44px・文字は 1 行）、どちらも見出しの塊の中に入る", async ({
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
});

test("M7-result-35 1440×900: 比較未選択・比較あり・2 つのポップアップ・目次の固定の状態で axe の重大・深刻な違反が無い", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  await expectAccessibleDetail(page, "1440×900");
});

test("M7-result-35 390×844: 比較未選択・比較あり・2 つのポップアップ・目次の固定の状態で axe の重大・深刻な違反が無い", async ({
  page,
  adminOrg,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConductor(page, adminOrg);
  await expectAccessibleDetail(page, "390×844");
});

test("M7-result-35 名前と状態: プルダウン「比較組織」、目次の nav、並び替え・項目の説明の aria-pressed、たたむの aria-expanded。キーボードだけで並び替え・説明・ポップアップ・たたむを操作できる", async ({
  page,
  adminOrg,
}) => {
  await openConductor(page, adminOrg);
  const rd = resultDetail(page);
  await expect(page.getByRole("combobox", { name: "比較組織" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "このページの目次" })).toBeVisible();
  await expect(rd.toc.locator("a")).toHaveCount(6);

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

test("M7-result-35 焦点の見た目: 「回答一覧に戻る」「ダウンロード」とポップアップの閉じるボタン・表の入れ物は共通の焦点の枠、目次と新しいレイアウトの中のボタンは #1F2933", async ({
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
  await expectInnerLinkRing(rd.tocLink("人物像"), "目次の右端のリンク（390、固定でない）");
  await expectInnerLinkRing(rd.tocLink("AI解説"), "目次の左端のリンク（390、固定でない）");
  await stickToc(page);
  await expectInnerLinkRing(rd.tocLink("人物像"), "目次の右端のリンク（390、固定の状態）");
  await expectInnerLinkRing(rd.tocLink("AI解説"), "目次の左端のリンク（390、固定の状態）");
});

// ページ全体の狭い幅。PR-7.13a と PR-7.8b の両方が入ってから fixme を外す（11-4 §5.3 の M7-result-34 のページ全体の分、§2.17）
test.describe("ページ全体の狭い幅（390×844）", () => {
  test.fixme(true, NARROW_FIXME);

  test("M7-result-34 390×844: 文書とスクロールする領域が横に動かない", async ({
    page,
    adminOrg,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openConductor(page, adminOrg, "?scope=organization");
    await expectNoHorizontalScroll(page, "文書（390×844）");
    const scroll = await resultDetail(page).scroll.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
  });
});
