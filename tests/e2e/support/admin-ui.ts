// 管理画面の E2E の共通操作（08 §3.4.3 E-10〜E-18、11-2 §5.3 M7-list-34〜52、11-3 §5.3 M7-zaiseki-31〜43・48、
// 11-4 §5.3 M7-result-21〜35、11-6 §5.3 M7-ai-38〜50）。
// ログインは画面から行い、Cookie の注入はしない（08 §3.4.1）
import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { emulatorTask } from "./admin";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";

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

/** 指定の適性タイプになる受験を 1 件送信する（求職者・チームなし・テストテスト 50。M7-zaiseki-31 のチームが 1 種類の組織） */
export function submitType(
  organizationId: string,
  aptitudeType: AptitudeTypeKey,
): { readonly resultId: string; readonly respondentId: string } {
  return emulatorTask("submit-type", organizationId, aptitudeType);
}

/**
 * 指定の氏名の受験を 1 件送信する（求職者・チームなし・職業コード 7「事務スタッフ」で責任者でない・固定シードの乱数回答）。
 * M7-ai-42 は氏名を __INVALID_JSON__ にして、スタブの不正な JSON（07 §5.4、D07-24）で採用向けの生成を失敗させる
 */
export function submitNamed(
  organizationId: string,
  name: string,
): { readonly resultId: string; readonly respondentId: string } {
  return emulatorTask("submit-named", organizationId, name);
}

/**
 * 採用向けの AI 解説を、別の画面で生成を始めた状態（start）か、その生成が失敗した状態（fail。reason は失敗の理由）にする
 * （11-6 §2.3.5 の「開いたときに generating」。アプリと同じリポジトリの関数でオーナーとして書く。直接は書かない）
 */
export function aiGenerationElsewhere(
  org: AdminOrg,
  resultId: string,
  step: "start" | "fail",
  reason = "",
): void {
  emulatorTask("ai-generation", step, org.organizationId, org.ownerUid, resultId, reason);
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

/**
 * email に送ったパスワード設定用のリンクの oobCode（最後に送ったもの）。メールは送られず Auth Emulator に溜まるので、
 * Emulator の REST から取り出す（08 E-18、11-2 §5.3 M7-list-46）
 */
export async function passwordResetCode(email: string): Promise<string> {
  const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-tekisei";
  const res = await fetch(`http://${host}/emulator/v1/projects/${project}/oobCodes`);
  const { oobCodes } = (await res.json()) as {
    oobCodes: Array<{ email: string; requestType: string; oobCode: string }>;
  };
  const code = oobCodes
    .filter((c) => c.email === email && c.requestType === "PASSWORD_RESET")
    .at(-1);
  if (!code) throw new Error(`${email} に送ったパスワード設定用のリンクがありません`);
  return code.oobCode;
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

/** 通知が出てから消えるまでの時間（ミリ秒）を測り始める。返す関数で結果を待つ（11-2 §2.20・11-3 §2.20） */
export async function watchToastLifetime(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    (window as unknown as { __toastLife: Promise<number> }).__toastLife = new Promise((resolve) => {
      let shownAt = 0;
      const observer = new MutationObserver(() => {
        const toast = document.querySelector(".toast");
        if (toast && shownAt === 0) shownAt = performance.now();
        if (!toast && shownAt !== 0) {
          observer.disconnect();
          resolve(performance.now() - shownAt);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true });
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __toastLife: Promise<number> }).__toastLife);
}

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

// ---- 組織内分類（11-3 §2.5〜§2.12。data-testid は 11-3 §3.8）の要素

/** 組織内分類の根（.ob-root。見出し行・集計カード・説明文・マップ） */
export const obRoot = (page: Page): Locator => page.locator(".ob-root");

/** 詳細パネル（dialog。分類のパネルとキャラクターのパネル） */
export const obPanel = (page: Page): Locator => page.getByTestId("ob-panel");

/** 「組織内分類とは」のポップアップ（dialog） */
export const obAbout = (page: Page): Locator => page.getByTestId("ob-about");

/** 見出し行の「組織内分類とは？」 */
export const obHelp = (page: Page): Locator =>
  page.getByRole("button", { name: "組織内分類とは？", exact: true });

/** 凡例の項目 */
export const obLegend = (page: Page, quadrant: SocialStyleKey): Locator =>
  page.getByTestId(`ob-legend-${quadrant}`);

/** 象限の箱 */
export const obQuadrant = (page: Page, quadrant: SocialStyleKey): Locator =>
  page.getByTestId(`ob-quadrant-${quadrant}`);

/** 象限の見出しのボタン */
export const obHeading = (page: Page, quadrant: SocialStyleKey): Locator =>
  obQuadrant(page, quadrant).locator(".ob-qh");

/** 象限の折りたたみのボタン */
export const obFold = (page: Page, quadrant: SocialStyleKey): Locator =>
  obQuadrant(page, quadrant).locator(".ob-fold");

/** キャラクターの枠 */
export const obCell = (page: Page, type: AptitudeTypeKey): Locator =>
  page.getByTestId(`ob-cell-${type}`);

/** 人数の要素（集計カードの数・象限のピルの数・枠の数）。親の要素から引く */
export const obCount = (scope: Locator): Locator => scope.getByTestId("ob-count");

/** 集計カードの人数とそのラベル */
export const obTotal = (page: Page) => ({
  count: obCount(page.locator(".ob-total")),
  label: page.locator(".ob-total .l"),
});

/** 全員／在籍／退職のボタン */
export const obSeg = (page: Page, mode: "all" | "stay" | "left"): Locator =>
  page.getByTestId(`ob-seg-${mode}`);

/** チームの選択欄（チームが 2 種類以上のときだけある） */
export const obTeam = (page: Page): Locator => page.locator(".ob-team select");

// ---- 在籍・退職（11-3 §2.13〜§2.16。data-testid は 11-3 §3.8）の要素

/** 在籍・退職のタブ（an = 分析、stay = 在籍者、left = 退職者、seek = 求職者） */
export const emTab = (page: Page, tab: "an" | "stay" | "left" | "seek"): Locator =>
  page.getByTestId(`em-tab-${tab}`);

/** 在籍・退職の一覧の人の行（代表の resultId） */
export const emRow = (page: Page, resultId: string): Locator =>
  page.getByTestId(`em-row-${resultId}`);

/** 一覧の行の「変更」 */
export const emEditButton = (row: Locator): Locator =>
  row.getByRole("button", { name: "変更", exact: true });

/** 開いている変更ダイアログ（dialog.ob-edit。閉じたダイアログの要素も DOM に残るため open のものに限る） */
export const emEdit = (page: Page): Locator => page.locator("dialog.ob-edit[open]");

/** 分析の数字のカードの並び */
export const retKpi = (page: Page): Locator => page.getByTestId("ret-kpi");

/** 分析のタイプ別の表の行 */
export const retRow = (page: Page, type: AptitudeTypeKey): Locator =>
  page.getByTestId(`ret-row-${type}`);

/** 「回答一覧を開く →」 */
export const pgGo = (page: Page): Locator => page.locator(".ob-pg a.pg-go");

// ---- 結果詳細（11-4 §2。要素の id は §2.1、クラスは別表D）の要素

/** 比較の状態（#rs2 の data-comparison。11-4 §3.6） */
export type ComparisonKind = "none" | "loading" | "ready" | "empty" | "error";

/** 結果詳細の枠と見出しの塊・受験情報の 1 行・目次・新しいレイアウト */
export const resultDetail = (page: Page) => ({
  /** 画面に固定した枠 */
  frame: page.locator("#rd"),
  /** スクロールする領域 */
  scroll: page.locator("#rd .rd-scroll"),
  /** 枠の上の行の「回答一覧に戻る」 */
  back: page.locator("#rd .rd-back"),
  head: page.locator("#rd-head"),
  title: page.locator("#rd-head h1"),
  /** 比較組織のプルダウン（見えるラベルは無く、読み上げの名前「比較組織」） */
  scope: page.getByRole("combobox", { name: "比較組織" }),
  download: page.locator("#rd-head").getByRole("button", { name: "ダウンロード", exact: true }),
  /** 受験情報の 1 行 */
  meta: page.locator("#rsm"),
  tocWrap: page.locator("#rsn-wrap"),
  toc: page.getByRole("navigation", { name: "このページの目次" }),
  tocLinks: page.locator("#rsn .links a"),
  tocLink: (label: string) =>
    page.locator("#rsn .links").getByRole("link", { name: label, exact: true }),
  /** 固定の状態の「↑ 先頭へ」 */
  toTop: page.getByRole("button", { name: "ページの先頭へ戻る" }),
  /** 新しいレイアウトの根 */
  layout: page.locator("#rs2"),
});

/** 比較の状態が kind になるまで待つ */
export async function expectComparison(page: Page, kind: ComparisonKind): Promise<void> {
  await expect(page.locator("#rs2")).toHaveAttribute("data-comparison", kind);
}

/** 結果詳細を開き、新しいレイアウトが比較の状態 kind で描かれるまで待つ（query は「?scope=organization」など） */
export async function openResultDetail(
  page: Page,
  resultId: string,
  query = "",
  kind: ComparisonKind = query === "" ? "none" : "ready",
): Promise<void> {
  await page.goto(`/admin/results/${resultId}${query}`);
  await expectComparison(page, kind);
}

/** 新しいレイアウトのセクション（11-4 §2.1 の id） */
export const rdSection = (page: Page, id: string): Locator => page.locator(`#rs2 section#${id}`);

/** セクションの見出しの行の「たたむ」「ひらく」のボタン */
export const rdFold = (page: Page, id: string): Locator =>
  rdSection(page, id).getByRole("button", { name: "この項目を開閉" });

/** 比較なしの文言を出す 3 か所（概要の組織内のポジション・概要の組織との合致度・組織との相性の凡例。11-4 §2.6） */
export const noComparisonPlaces = (page: Page): Locator[] => [
  page.locator("#rs-hero .pos .empty"),
  page.locator("#rs-gat .empty"),
  page.locator("#rs-fitc .fitlg .empty"),
];

/** 16の特性の並び替えのボタン（点数の高い順・平均との差・項目順） */
export const traitSortButtons = (page: Page): Locator => page.locator("#rs-trc .seg button");

/** 16の特性の項目の説明のボタン（項目順の 16 個） */
export const traitHelpButton = (page: Page, label: string): Locator =>
  page.locator("#rs-trc .sk-b").getByRole("button", { name: label, exact: true });

/** 16の特性の一覧の行の特性名（上から。札「最も高い」「最も低い」を除く） */
export const traitRowNames = (page: Page): Promise<string[]> =>
  page.locator("#rs-trc .tr .n").evaluateAll((cells) =>
    cells.map((cell) =>
      Array.from(cell.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim(),
    ),
  );

/** 概要の「ほかの特性が高い場合を見る」「ほかの特性が低い場合を見る」のボタン（全角空白と全角の「＞」まで文言。11-4 §2.7.5） */
export const moreTraitsButton = (page: Page, side: "high" | "low"): Locator =>
  page.getByRole("button", {
    name: `ほかの特性が${side === "high" ? "高" : "低"}い場合を見る\u3000＞`,
    exact: true,
  });

/** 開いている「ほかの特性が高い／低い場合」のポップアップ（dialog.rd-pop。閉じたポップアップの要素も DOM に残る） */
export const rdPopup = (page: Page): Locator => page.locator("dialog.rd-pop[open]");

/** 育て方の 2 列 #rs-learn と第二候補 #rs-ln2（11-4 §2.13。要素の id は §2.1、クラスは別表D の 12） */
export const rdLearn = (page: Page) => ({
  root: page.locator("#rs-learn"),
  /** 左のカード（育成タイプ・優位感覚・絵・小さいレーダー・資質の割合。1440px ではスクロールする領域の上端から 72px に留まる） */
  left: page.locator("#rs-learn > .card").first(),
  /** 右のカード（関わり方の囲みと 12 項目。第二候補はこの最後に足す） */
  right: page.locator("#rs-learn > .card").nth(1),
  /** 第二候補のボタン（出していないときは「第二候補を見る」、出しているときは「第二候補を閉じる」） */
  secondButton: page.locator("#rs-learn .more"),
  /** 第二候補（出しているときだけある） */
  second: page.locator("#rs-ln2"),
  /** 資質の割合の行（値の大きい順） */
  shareRows: page.locator("#rs-learn .lt > div"),
});

/** 接し方の 2 列 #rs-ss1・関わり方のコツ #rs-how・タイプ別の接し方 #rs-mine（11-4 §2.14。別表D の 13） */
export const rdStyle = (page: Page) => ({
  root: page.locator("#rs-ss1"),
  left: page.locator("#rs-ss1 > .card").first(),
  right: page.locator("#rs-ss1 > .card").nth(1),
  /** 4 区分の表のマス（左上・右上・左下・右下） */
  quadCells: page.locator("#rs-ss1 .quad > div"),
  how: page.locator("#rs-how"),
  /** 関わり方のコツのカード（見分け方・褒め方・効果的な対応・声かけ例） */
  howCards: page.locator("#rs-how .how > .card"),
  mine: page.locator("#rs-mine"),
  /** タイプ別の接し方のタブ（見ている人のスタイル。ドライビング・エクスプレッシブ・エミアブル・アナリティカル） */
  tabs: page.locator("#rs-mine .tabs button"),
  tab: (label: string) =>
    page.locator("#rs-mine .tabs").getByRole("button", { name: label, exact: true }),
});

/** .ob-root の輪郭（参照元の ob-map の焦点の指定。#1F2933 の 2px を 2px 外側） */
export const OB_ROOT_OUTLINE = {
  focusVisible: true,
  style: "solid",
  color: "rgb(31, 41, 51)",
  width: "2px",
  offset: "2px",
} as const;

// ---- AI 解説の領域（11-6 §2.1〜§2.4。結果詳細の #ai。クラスは別表C）の要素

/** AI 解説の種類（タブとパネル。PR-7.9 は採用向けと育成・定着の 2 つ。経年比較のタブは PR-7.11a） */
export type AiKind = "recruitment" | "training" | "longitudinal";

/** AI 解説の領域の部品（タブ・パネル・生成ボタン・生成中・失敗の枠・採用向けの表示） */
export const aiArea = (page: Page) => ({
  /** 領域（section#ai。読み上げの名前「AI解説」） */
  root: page.locator("#ai"),
  /** タブの行（role="tablist"。読み上げの名前「AI解説の種類」） */
  tablist: page.getByRole("tablist", { name: "AI解説の種類" }),
  tabs: page.getByRole("tablist", { name: "AI解説の種類" }).getByRole("tab"),
  tab: (kind: AiKind) => page.locator(`#ai-tab-${kind}`),
  /** パネル（role="tabpanel"。data-status は種類の状態） */
  panel: (kind: AiKind) => page.locator(`#ai-panel-${kind}`),
  /** 生成ボタン（「採用向けAI解説を生成」「育成・定着AI解説を生成」） */
  genButton: (kind: "recruitment" | "training") =>
    page.locator(`#ai-panel-${kind}`).getByRole("button", {
      name: kind === "recruitment" ? "採用向けAI解説を生成" : "育成・定着AI解説を生成",
      exact: true,
    }),
  /** 生成中（.ai-loading。読み上げは中の role="status"） */
  loading: page.locator("#ai .ai-loading"),
  /** 失敗の枠（.ai-fail。role="alert"） */
  fail: page.locator("#ai .ai-fail"),
  /** 採用向けの表示（.ai-rec） */
  view: page.locator("#ai .ai-rec"),
});

/** 採用向けの AI 解説の API のパス（11-6 §3.4） */
const recruitmentAiPath = (resultId: string): string =>
  `/api/v1/admin/results/${resultId}/ai-analysis/recruitment`;

/** 採用向けの生成の要求（POST …/ai-analysis/recruitment）を数える（返す配列に出た要求の URL が入る） */
export function watchAiPosts(page: Page, resultId: string): string[] {
  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === recruitmentAiPath(resultId)) {
      posts.push(req.url());
    }
  });
  return posts;
}

/** 採用向けの状態の読み直し（GET …/ai-analysis/recruitment）を数える（返す配列に、出た要求の時刻（ミリ秒）が入る） */
export function watchAiGets(page: Page, resultId: string): number[] {
  const gets: number[] = [];
  page.on("request", (req) => {
    if (req.method() === "GET" && new URL(req.url()).pathname === recruitmentAiPath(resultId)) {
      gets.push(Date.now());
    }
  });
  return gets;
}

/** 採用向けの生成の要求を止める（生成中の表示を確かめるため）。返す関数で放すと、要求はそのままサーバへ送られる */
export async function holdAiPost(page: Page, resultId: string): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${recruitmentAiPath(resultId)}`, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  return release;
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
 * 記号だけの印（AI 解説の育成・定着の案内の警告の「！」の丸 .warn-i。文字に添えた印で K-49 の対象外。11-6 §2.17・M7-ai-50）と、
 * 枠の文字のロゴ「適性検査」（11-8 の .adm-logo。K-49 の対象外。PR-7.13a で入る）だけ（11 総論 5.1）。押せない生成ボタン（11-6
 * §2.3.2）は disabled の属性のボタンで、axe の color-contrast が調べない
 */
const isContrastExempt = (node: { readonly html: string; readonly target: unknown[] }) =>
  /aria-disabled="true"/.test(node.html) ||
  node.target.some((t) => String(t).includes(".warn-i") || String(t).includes(".adm-logo"));

/**
 * 動いている有限の CSS の移り変わり（transition と、回数の決まった animation）が終わるまで待つ。タブを切り替えた直後などは、文字や地の
 * 色が途中の値（AI 解説のタブなら白から #6B7885 へ 0.2 秒）になっていて、axe の color-contrast がその途中の色で測ってしまうため。
 * 無限に繰り返すアニメーション（AI 解説の生成中の輪・点など）と、止めてあるものは待たない
 */
async function waitForFiniteAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/**
 * axe の重大・深刻な違反が無いこと（wcag2a・wcag2aa。文字のコントラスト color-contrast も検査する）。
 * マウスの位置で地の色が変わる部品があるので、先にマウスを部品の無い場所（サイドメニューの上の余白）へ動かし、色の移り変わりが終わって
 * から測る
 */
export async function expectAccessibleAdmin(page: Page, label: string): Promise<void> {
  await page.mouse.move(1, 1);
  await waitForFiniteAnimations(page);
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

export type Rect = Awaited<ReturnType<typeof rectOf>>;

/** inner が outer の中にある（±0.5px） */
export function expectInside(inner: Rect, outer: Rect, label: string): void {
  expect(inner.left, label).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.top, label).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.right, label).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.bottom, label).toBeLessThanOrEqual(outer.bottom + 0.5);
}

/** 焦点の枠（部品の外側 4px。2px の線と、離す 2px）の矩形 */
export const ringOf = (box: Rect): Rect => ({
  left: box.left - 4,
  top: box.top - 4,
  right: box.right + 4,
  bottom: box.bottom + 4,
});

/** 2 つの矩形が重なる（接するだけは重ならない） */
export const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** 焦点のある部品の外側 4px（焦点の枠の 2px と、離す 2px）までが、結果詳細のスクロールする領域の縁の内側に入る（11-4 §2.2） */
export async function expectRingInsideScroll(
  page: Page,
  target: Locator,
  label: string,
): Promise<void> {
  await expect(target).toBeFocused();
  expectInside(ringOf(await rectOf(target)), await rectOf(resultDetail(page).scroll), label);
}

/**
 * 焦点のある部品の焦点の枠（外側 4px）が、固定の状態の目次の下端より下で、.rd-scroll の縁の内側にある（領域を動かす処理は描いた後の
 * 次のフレームなので、そうなるまで待つ。11-4 §2.2・§2.5・§2.13）
 */
export async function expectRingVisibleBelowToc(
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
