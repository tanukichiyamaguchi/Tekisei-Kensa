// 管理画面の E2E の共通操作（08 §3.4.3 E-10〜E-18、11-2 §5.3 M7-list-34〜52）。ログインは画面から行い、Cookie の注入はしない（08 §3.4.1）
import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { emulatorTask } from "./admin";

export const E2E_ADMIN_PASSWORD = "e2e-admin-pass-1234";

export interface AdminOrg {
  readonly organizationId: string;
  readonly inviteLink: string;
  readonly ownerEmail: string;
  readonly adminEmail: string;
  readonly ownerUid: string;
  readonly adminUid: string;
  readonly submitted: ReadonlyArray<{
    readonly respondentId: string;
    readonly resultId: string;
    readonly kind: "applicant" | "executive";
  }>;
}

/** seed:local と同じ構成の組織（求職者 8 人・幹部 2 人・下書き 1 人）をテストごとに作る */
export const test = base.extend<{ adminOrg: AdminOrg }>({
  // eslint-disable-next-line no-empty-pattern
  adminOrg: async ({}, use) => {
    await use(emulatorTask<AdminOrg>("seed-admin-org", E2E_ADMIN_PASSWORD));
  },
});
export { expect };

/** seed の受験者の氏名（テストテスト 01〜10。01〜08 は求職者、09・10 は既存スタッフ。02 §13.2） */
export const seedName = (index: number): string => `テストテスト ${String(index).padStart(2, "0")}`;

/** seed の n 番目（1 から）の送信済みの受験 */
export function seedExam(org: AdminOrg, index: number): AdminOrg["submitted"][number] {
  const exam = org.submitted[index - 1];
  if (!exam) throw new Error(`シードに ${index} 番目の受験がありません`);
  return exam;
}

/**
 * 再受験（11-2 §5 の前置き。前回の候補を付けて登録・送信し、前回とつながる）。index を前回と同じにすると氏名・電話番号も同じになる。
 * 再受験は既存スタッフ扱い（Q-33）なので、オーナー以外の一覧には出ない
 */
export function addReexam(
  org: { readonly organizationId: string },
  previousResultId: string,
  index: number,
): { readonly resultId: string; readonly respondentId: string } {
  return emulatorTask("add-reexam", org.organizationId, previousResultId, String(index));
}

/** 受験日を days 日前にする（M7-list-37。E2E に限った直接書き込み） */
export function backdateResult(resultId: string, days = 400): void {
  emulatorTask("backdate-result", resultId, String(days));
}

export interface ManyRowsOrg {
  readonly organizationId: string;
  readonly ownerEmail: string;
  /** 送信の順（テストテスト 101 から） */
  readonly resultIds: readonly string[];
}

/** 101 行以上の組織（オーナーと求職者 count 人。氏名はテストテスト 101〜。M7-list-38・46・50） */
export function seedManyRows(count = 105): ManyRowsOrg {
  return emulatorTask<ManyRowsOrg>("seed-many-rows", E2E_ADMIN_PASSWORD, String(count));
}

/** 受験が 0 件の組織（組織・オーナー・管理者だけ。M7-list-47） */
export function seedEmptyOrg(): {
  readonly organizationId: string;
  readonly ownerEmail: string;
  readonly adminEmail: string;
} {
  return emulatorTask("seed-empty-org", E2E_ADMIN_PASSWORD);
}

/** M-01 から画面でログインし、/admin（または next）に着くまで待つ。login-events の呼び出し回数を返す */
export async function loginViaUi(
  page: Page,
  email: string,
  password = E2E_ADMIN_PASSWORD,
): Promise<{ loginEvents: number }> {
  let loginEvents = 0;
  const listener = (req: { url(): string; method(): string }) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/v1/admin/me/login-events"
    ) {
      loginEvents += 1;
    }
  };
  page.on("request", listener);
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "回答一覧" })).toBeVisible();
  page.off("request", listener);
  return { loginEvents };
}

/** ヘッダーのログアウトから M-01 に戻る（ヘッダーの廃止は PR-7.13a） */
export async function logoutViaHeader(page: Page): Promise<void> {
  await page.locator(".admin-header").getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL((url) => url.pathname === "/admin/login");
}

// ---- 回答一覧（11-2 §2）の要素

/** 表の行（data-testid="result-table" は旧一覧から引き継いだ目印。1 行 = 同じ人の受験をまとめた行） */
export const resultRows = (page: Page) => page.locator("[data-testid=result-table] tbody tr");

/** 氏名で行を引く（氏名のリンクの名前が一致する行） */
export const rowOf = (page: Page, name: string): Locator =>
  resultRows(page).filter({ has: page.getByRole("link", { name, exact: true }) });

/** 表示中の行の氏名（上から） */
export const rowNames = (page: Page): Promise<string[]> =>
  resultRows(page).locator(".rl-name").allTextContents();

/** 行の⋮（読み上げ名「{氏名}のその他の操作」） */
export const moreButton = (row: Locator): Locator =>
  row.getByRole("button", { name: /のその他の操作$/ });

/** 行の区分チップ（「{区分} ▾」のボタン） */
export const statusChip = (row: Locator): Locator => row.locator(".rl-chip--status");

/** 開いているメニュー（⋮メニュー・区分メニュー・リンクのメニュー。画面に 1 つだけ） */
export const popupMenu = (page: Page): Locator => page.getByRole("menu");

/** メニューの項目（右端の小さい文字を除いた名前で引く） */
export const menuItem = (page: Page, label: string): Locator =>
  popupMenu(page)
    .getByRole("menuitem")
    .filter({ has: page.locator(".rl-menu__label").getByText(label, { exact: true }) });

/** 集計カード（左から 1〜4） */
export const statCard = (page: Page, n: 1 | 2 | 3 | 4): Locator =>
  page.locator(".rl-stats > *").nth(n - 1);

/** 道具の行の部品 */
export const listTools = (page: Page) => ({
  tabs: page.getByRole("tablist", { name: "表示する受験者" }).getByRole("tab"),
  tab: (name: string) =>
    page
      .getByRole("tablist", { name: "表示する受験者" })
      .getByRole("tab")
      .filter({ hasText: new RegExp(`^${name}\\d+$`) }),
  search: page.getByRole("searchbox", { name: "氏名・電話番号で探す" }),
  team: page.getByRole("combobox", { name: "チームで絞り込む" }),
  sort: page.getByRole("combobox", { name: "並び順" }),
  count: page.locator(".rl-count"),
  clear: page.locator(".rl-count").getByRole("button", { name: "絞り込みを解除" }),
});

/** 通知（11-2 §2.20）。情報は role="status"、エラーは role="alert"。モーダルの dialog が開いている間はその中に出る */
export const statusToast = (page: Page): Locator => page.locator(".toast[role=status]");
export const alertToast = (page: Page): Locator => page.locator(".toast[role=alert]");

/** 表示中のダイアログ（閉じたダイアログの中身も DOM に残るため open のものに限る） */
export const openDialog = (page: Page) => page.locator("dialog[open]");

/** 入社日・退職日のダイアログ（11-2 §2.14。閉じるアイコンの無い dialog 要素） */
export const datesDialog = (page: Page): Locator => page.locator("dialog.rl-dates[open]");

/** 東京の今日の日付を「Y/M/D」（ゼロ埋めなし。11-2 §2.9・§2.13）と「YYYY-MM-DD」で */
export function todayInTokyo(): { readonly ymd: string; readonly iso: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const [y, m, d] = [parts.year ?? "", parts.month ?? "", parts.day ?? ""];
  return { ymd: `${y}/${m}/${d}`, iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
}

// ---- クリップボード（回答リンクのコピー。11-2 §2.17）

export async function grantClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

export const readClipboard = (page: Page): Promise<string> =>
  page.evaluate(() => navigator.clipboard.readText());

/** 回答リンク（アカウント画面と同じ受検リンク。MeDto.links） */
export const answerLink = (organizationId: string, kind: "applicant" | "executive"): string =>
  `http://localhost:3000/exam?q=${organizationId}&p=${kind === "applicant" ? "user" : "executives"}`;

// ---- 焦点の見た目（11-2 §2.4。M7-list-52）

/** 管理画面に共通の焦点の枠（11-8 §2.2.6。#3F8DA5 の 2px を 2px 外側） */
export const COMMON_FOCUS_RING = {
  focusVisible: true,
  style: "solid",
  color: "rgb(63, 141, 165)",
  width: "2px",
  offset: "2px",
} as const;

/** 一覧の輪郭（参照元の ad-app の焦点の指定。#1F2933 の 2px を 2px 外側） */
export const LIST_OUTLINE = {
  focusVisible: true,
  style: "solid",
  color: "rgb(31, 41, 51)",
  width: "2px",
  offset: "2px",
} as const;

/**
 * キーボードで焦点を当てる（:focus-visible にする）。要素に焦点を移したあと、Tab と Shift+Tab で同じ要素に戻る
 * （backward が真なら Shift+Tab と Tab。ダイアログの最初の部品など、Tab の先に戻れないとき）
 */
export async function focusByKeyboard(target: Locator, backward = false): Promise<void> {
  const page = target.page();
  await target.focus();
  await page.keyboard.press(backward ? "Shift+Tab" : "Tab");
  await page.keyboard.press(backward ? "Tab" : "Shift+Tab");
  await expect(target).toBeFocused();
}

/** 焦点のある要素（document.activeElement）の輪郭 */
export function activeOutline(page: Page): Promise<{
  readonly focusVisible: boolean;
  readonly style: string;
  readonly color: string;
  readonly width: string;
  readonly offset: string;
}> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) throw new Error("焦点のある要素がありません");
    const s = getComputedStyle(el);
    return {
      focusVisible: el.matches(":focus-visible"),
      style: s.outlineStyle,
      color: s.outlineColor,
      width: s.outlineWidth,
      offset: s.outlineOffset,
    };
  });
}

// ---- アクセシビリティ（M7-list-52）

/**
 * axe の color-contrast の対象から外す節点か: 押せない状態の表示（aria-disabled の操作の要素と、押せない「削除する」）と、
 * 枠の文字のロゴ「適性検査」（11-8 の .adm-logo。K-49 の対象外。PR-7.13a で入る）だけ（11 総論 5.1）
 */
const isContrastExempt = (node: { readonly html: string; readonly target: unknown[] }) =>
  /aria-disabled="true"/.test(node.html) ||
  node.target.some((t) => String(t).includes(".adm-logo"));

/**
 * axe の重大・深刻な違反が無いこと（wcag2a・wcag2aa。文字のコントラスト color-contrast も検査する）。
 * マウスの位置で地の色が変わる部品があるので、先にマウスを部品の無い場所（サイドメニューの上の余白）へ動かす
 */
export async function expectAccessibleAdmin(page: Page, label: string): Promise<void> {
  await page.mouse.move(1, 1);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      ...v,
      nodes: v.id === "color-contrast" ? v.nodes.filter((n) => !isContrastExempt(n)) : [...v.nodes],
    }))
    .filter((v) => v.nodes.length > 0);
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    label,
  ).toEqual([]);
}

/** ページ全体が横に動かない（文書の幅が表示の幅を超えない） */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, label).toBeLessThanOrEqual(clientWidth);
}

/** 要素の画面上の矩形 */
export const rectOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
