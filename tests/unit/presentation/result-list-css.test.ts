// M7-list-51 回答一覧の配色と焦点の見た目（11-2 §2.4・§2.6〜§2.8・§2.22・§2.26・§5.1、総論 8.3 の配色の取り決め）。
// app/(admin)/admin.css の一覧の節を読み、K-49・K-50 で変えた 21 個の変数の値と、文字 4.5:1・部品 3:1 を CSS の値から計算する
// （axe が見ないマウス・押下・選択中の色と、axe が調べない部品の 3:1 をここで確かめる）。半透明の色・不透明度 70% は下の地（白）に重ね、
// 各成分を四捨五入（0.5 は切り上げ）して 8 ビットにしてから計算する。ページの地は 11-8 §4.5 に従い #F7F9FC として計算する。
// あわせて、§2.22 のコンテナクエリと pointer: coarse の値（狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）と、管理画面に共通の焦点の枠の値
import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  contrastRatio,
  decl,
  findDecl,
  hexOf,
  over,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  specificity,
  variablesOf,
  type CssRule,
  type Rgb,
} from "./css-rules";

const rules = parseCssRules(readCss("app/(admin)/admin.css"));
const vars = variablesOf(rules, ".rl-root");

/** 宣言の値（var() を .rl-root の変数で解く） */
const value = (selector: string, property: string, at: string | null = null) =>
  resolveVars(decl(rules, selector, property, at), vars);
const solid = (text: string): Rgb => {
  const c = parseColor(resolveVars(text, vars));
  expect(c.alpha, text).toBe(1);
  return c.rgb;
};
const color = (selector: string, property: string) => solid(value(selector, property));

const WHITE: Rgb = [255, 255, 255];
/** ページの地（11-8 §4.5 の --adm-page-bg。今の .admin-root の地 #F3F5F8 は PR-7.13a で #F7F9FC になる） */
const PAGE_BG = solid("#F7F9FC");
const ROW_HOVER = color(".rl-row:hover .rl-td", "background");
/** 一覧の輪郭（§2.4。参照元の ad-app の焦点の指定） */
const LIST_OUTLINE = "2px solid #1f2933";
/** 管理画面に共通の焦点の枠（11-8 §2.2.6・別表A の 1） */
const COMMON_FOCUS = ":where(.admin-root, .adm-focus-scope) :focus-visible";

const NARROW = "@container (width < 840px)";
const MEDIUM = "@container (840px <= width < 1100px)";
const COARSE = "@media (pointer: coarse)";

function expectRatios(
  pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]>,
  minimum: number,
): void {
  for (const [label, front, back, expected] of pairs) {
    const r = contrastRatio(front, back);
    expect(round2(r), label).toBe(expected);
    expect(r, label).toBeGreaterThanOrEqual(minimum);
  }
}

/** セレクタを含む規則（@media・@container の外）のうち、property を持つもの */
const rulesWith = (property: string): readonly CssRule[] =>
  rules.filter((r) => r.at === null && r.declarations.has(property));

describe("M7-list-51 K-49・K-50 で変えた色の変数（§2.26）", () => {
  it("21 個の変数の値", () => {
    const expected: Readonly<Record<string, string>> = {
      "--rl-primary-strong": "#397F94",
      "--rl-tab-count": "#636D79",
      "--rl-placeholder": "#767676",
      "--rl-muted-cell": "#6B7682",
      "--rl-open-text": "#2D6D82",
      "--rl-chip-candidate": "#2C748C",
      "--rl-chip-employed": "#2A7B58",
      "--rl-green": "#147C5B",
      "--rl-muted-text": "#6C7784",
      "--rl-menu-note": "#697380",
      "--rl-menu-note-danger": "#646E7A",
      "--rl-danger-hover": "#8C1B13",
      "--rl-cancel-hover-text": "#333D47",
      "--rl-close-hover-text": "#1D414C",
      "--rl-field-line": "#7A92AE",
      "--rl-team-line": "#7D95B0",
      "--rl-team-line-hover": "#8095AA",
      "--rl-switch-off": "#7E94AC",
      "--rl-date-line": "#8297AC",
      "--rl-tab-on-line": "#627B98",
      "--rl-knob-shadow": "#8996A4",
    };
    for (const [name, hex] of Object.entries(expected)) {
      expect(vars.get(name)?.toUpperCase(), name).toBe(hex);
    }
    // 変数は .rl-root と、document.body の直下に描くメニュー .rl-menu の同じ規則に置く（§2.12）
    const root = rules.find((r) => r.at === null && r.selectors.includes(".rl-root"));
    expect(root?.selectors).toContain(".rl-menu");
    expect(variablesOf(rules, ".rl-menu")).toEqual(vars);
  });
});

describe("M7-list-51 K-49 の 15 組（文字 4.5:1。マウス・押下・選択中を含む）", () => {
  it("どの組も 4.5:1 以上で、§2.26 の K-49 の表の比", () => {
    const danger = ".rl-popup-btn--danger";
    const cancel = ".rl-popup-btn--cancel";
    const close = ".rl-usage-close";
    const opacityOf = (selector: string) => Number(value(selector, "opacity"));
    // 12・13・15 は不透明度 70% のまま、そのときの地か文字の色を変える（白に重ねた色で計算）
    const pressOpacity = opacityOf('.rl-popup-btn:not([aria-disabled="true"]):hover');
    expect(pressOpacity).toBe(0.7);
    expect(opacityOf('.rl-popup-btn:not([aria-disabled="true"]):active')).toBe(0.7);
    expect(opacityOf(`${close}:hover`)).toBe(0.7);
    expect(opacityOf(`${close}:active`)).toBe(0.7);
    const dangerHover = over(
      parseColor(value(`${danger}:not([aria-disabled="true"]):hover`, "background")),
      WHITE,
      pressOpacity,
    );
    const dangerActive = over(
      parseColor(value(`${danger}:not([aria-disabled="true"]):active`, "background")),
      WHITE,
      pressOpacity,
    );
    const cancelHover = over(
      parseColor(value(`${cancel}:not([aria-disabled="true"]):hover`, "color")),
      WHITE,
      pressOpacity,
    );
    const closeHover = over(parseColor(value(`${close}:hover`, "color")), WHITE, 0.7);
    expect(hexOf(dangerHover)).toBe("#AF5F5A");
    expect(hexOf(dangerActive)).toBe("#AF5F5A");
    expect(hexOf(cancelHover)).toBe("#70777E");
    expect(hexOf(closeHover)).toBe("#617A82");

    expectRatios(
      [
        [
          "1 白い文字／「回答リンクをコピー」の地",
          color(".rl-btn--primary", "color"),
          color(".rl-btn--primary", "background"),
          4.53,
        ],
        [
          "2 選んでいないタブの数／タブの並びの地",
          color(".rl-tab__count", "color"),
          color(".rl-tabs", "background"),
          4.55,
        ],
        [
          "3 検索欄のプレースホルダー／白",
          color(".rl-search__input::placeholder", "color"),
          color(".rl-search", "background"),
          4.54,
        ],
        ["4 「—」／行のマウスの地", color(".rl-type--none", "color"), ROW_HOVER, 4.51],
        ["4 時刻／行のマウスの地", color(".rl-latest__time", "color"), ROW_HOVER, 4.51],
        ["4 「前回」／行のマウスの地", color(".rl-latest__prev", "color"), ROW_HOVER, 4.51],
        ["4 時刻／白", color(".rl-latest__time", "color"), WHITE, 4.63],
        [
          "5 「結果を見る」の文字／マウスのときの地",
          color(".rl-open:link", "color"),
          color(".rl-open:link:hover", "background"),
          4.57,
        ],
        [
          "5 「結果を見る」の文字／ふだんの地",
          color(".rl-open:link", "color"),
          color(".rl-open:link", "background"),
          5.13,
        ],
        [
          "6 区分チップ「求職者」",
          color(".rl-chip--candidate", "color"),
          color(".rl-chip--candidate", "background"),
          4.53,
        ],
        [
          "7 区分チップ「在籍」",
          color(".rl-chip--employed", "color"),
          color(".rl-chip--employed", "background"),
          4.52,
        ],
        [
          "8 「経年比較あり」",
          color(".rl-chip--longitudinal", "color"),
          color(".rl-chip--longitudinal", "background"),
          4.6,
        ],
        [
          "9 チームの選択の未設定の文字／白",
          color('.rl-team[data-empty="true"]', "color"),
          color(".rl-team", "background-color"),
          4.56,
        ],
        [
          "9 メニューの見出し／メニューの地",
          color(".rl-menu__heading", "color"),
          color(".rl-menu", "background"),
          4.56,
        ],
        [
          "10 メニューの右端の小さい文字／マウスを載せた項目の地",
          color(".rl-menu__note", "color"),
          color(".rl-menu__item:hover", "background"),
          4.56,
        ],
        ["10 メニューの右端の小さい文字／白", color(".rl-menu__note", "color"), WHITE, 4.81],
        [
          "11 「この受験を削除」の右端の小さい文字／マウスを載せた地",
          color(".rl-menu__item--danger .rl-menu__note", "color"),
          color(".rl-menu__item--danger:hover", "background"),
          4.54,
        ],
        [
          "11 「この受験を削除」の右端の小さい文字／白",
          color(".rl-menu__item--danger .rl-menu__note", "color"),
          WHITE,
          5.18,
        ],
        ["12 白い文字／「削除する」のマウス", color(danger, "color"), dangerHover, 4.56],
        ["12 白い文字／「削除する」の押下", color(danger, "color"), dangerActive, 4.56],
        ["13 「キャンセル」のマウス・押下の文字／白", cancelHover, WHITE, 4.54],
        ["14 利用履歴の「閉じる」の文字／白", color(close, "color"), WHITE, 4.53],
        ["15 「閉じる」のマウス・押下の文字／白", closeHover, WHITE, 4.55],
      ],
      4.5,
    );
  });

  it("「結果を見る」の文字は、ふだんもマウスのときも --rl-open-text（状態で色を変えない。K-49 の表の 5）", () => {
    for (const selector of [".rl-open:link", ".rl-open:visited"]) {
      expect(decl(rules, selector, "color"), selector).toBe("var(--rl-open-text)");
    }
    for (const selector of [".rl-open:link:hover", ".rl-open:visited:hover"]) {
      expect(findDecl(rules, selector, "color"), selector).toBeUndefined();
    }
  });

  it("基準に届いていて変えない文字（選んでいないタブ・「保存する」・選択中のタブの数・「{n}回目」・注意のカード）", () => {
    expectRatios(
      [
        [
          "選んでいないタブ／並びの地",
          color(".rl-tab", "color"),
          color(".rl-tabs", "background"),
          4.71,
        ],
        [
          "「保存する」の白い文字",
          color(".rl-dates__btn--save", "color"),
          color(".rl-dates__btn--save", "background"),
          4.73,
        ],
        [
          "選択中のタブの数／白",
          color('.rl-tab[aria-selected="true"] .rl-tab__count', "color"),
          color('.rl-tab[aria-selected="true"]', "background"),
          5.64,
        ],
        [
          "「{n}回目」",
          color(".rl-chip--nth", "color"),
          color(".rl-chip--nth", "background"),
          4.99,
        ],
        [
          "注意のカードの値",
          color(".rl-card--alert .rl-card__value", "color"),
          color(".rl-card--alert", "background"),
          4.87,
        ],
        [
          "「受験から1年以上」のチップ",
          color(".rl-chip--one-year", "color"),
          color(".rl-chip--one-year", "background"),
          4.62,
        ],
        [
          "「除外中」／行のマウスの地",
          color('.rl-switch[aria-checked="true"]', "color"),
          ROW_HOVER,
          4.89,
        ],
        ["⋮／行のマウスの地", color(".rl-more", "color"), ROW_HOVER, 5.3],
        ["通知の白い文字", color(".toast", "color"), color(".toast", "background"), 14.76],
        [
          "エラーの通知の白い文字",
          color(".toast", "color"),
          color(".toast--error", "background"),
          5.62,
        ],
      ],
      4.5,
    );
  });
});

describe("M7-list-51 K-50 の 7 組（部品 3:1。外の地と中の地の両方。部品の縁に常に接する影も）", () => {
  it("どの組も 3:1 以上で、§2.26 の K-50 の表の比", () => {
    const fieldLine = solid("var(--rl-field-line)");
    expect(value(".rl-search", "border")).toBe(`1px solid ${vars.get("--rl-field-line")}`);
    expect(value(".rl-select", "border")).toBe(`1px solid ${vars.get("--rl-field-line")}`);
    const teamLine = solid(value(".rl-team", "border").replace(/^1px solid /, ""));
    const teamHover = color(".rl-team:hover", "border-color");
    const switchOff = color(".rl-switch__track", "background");
    const knob = color(".rl-switch__knob", "background");
    const knobShadow = solid(value(".rl-switch__knob", "box-shadow").replace(/^0 1px 2px /, ""));
    const dateLine = solid(value(".rl-dates__input", "border").replace(/^1px solid /, ""));
    // 選択中のタブ: 外側の 1px の枠と、枠の下にかかるタブ自身の影（不透明の色なので重ねた色は影の色のまま）
    const selectedShadow = value('.rl-tab[aria-selected="true"]', "box-shadow");
    const [ring, drop] = selectedShadow.split(/,\s*/);
    expect(ring?.startsWith("0 0 0 1px ")).toBe(true);
    expect(drop?.startsWith("0 1px 2px ")).toBe(true);
    const tabLine = solid(ring!.replace(/^0 0 0 1px /, ""));
    const tabShadow = solid(drop!.replace(/^0 1px 2px /, ""));
    const tabBg = color(".rl-tabs", "background");
    const tabSelected = color('.rl-tab[aria-selected="true"]', "background");

    expectRatios(
      [
        ["1 検索欄・選択欄の枠／ページの地", fieldLine, PAGE_BG, 3.04],
        ["1 検索欄の枠／中の白", fieldLine, color(".rl-search", "background"), 3.21],
        ["1 選択欄の枠／中の白", fieldLine, color(".rl-select", "background-color"), 3.21],
        ["2 チームの選択の枠／行のマウスの地", teamLine, ROW_HOVER, 3.01],
        ["2 チームの選択の枠／中の白", teamLine, color(".rl-team", "background-color"), 3.09],
        ["3 チームの選択のマウスの枠／行のマウスの地", teamHover, ROW_HOVER, 3.01],
        ["3 チームの選択のマウスの枠／中の白", teamHover, WHITE, 3.09],
        ["4 スイッチのオフの溝／行のマウスの地", switchOff, ROW_HOVER, 3.04],
        ["4 スイッチのオフの溝／白いつまみ", switchOff, knob, 3.13],
        ["5 日付の入力欄の枠／ダイアログの地", dateLine, color(".rl-dates", "background"), 3.01],
        ["5 日付の入力欄の枠／中の白", dateLine, color(".rl-dates__input", "background"), 3.01],
        ["6 選択中のタブの枠／並びの地", tabLine, tabBg, 3.78],
        ["6 選択中のタブの枠／枠の下にかかる影", tabLine, tabShadow, 3.01],
        ["6 選択中のタブの枠／白い地", tabLine, tabSelected, 4.37],
        ["7 白いつまみ／つまみの影", knob, knobShadow, 3.02],
      ],
      3,
    );
    // 3 のマウスのときの枠は 2 のふだんの枠とほぼ同じ濃さ（総論 8.3 の 24。手動確認 M7-list-48）
    expect(round2(contrastRatio(teamLine, teamHover))).toBe(1);
    // オンの溝はつまみと届く（参照元のまま）
    expect(
      round2(
        contrastRatio(
          color('.rl-switch[aria-checked="true"] .rl-switch__track', "background"),
          knob,
        ),
      ),
    ).toBe(5.02);
  });

  it("参照元の色のまま使う用途は置き換えない（検索欄の焦点の枠・「閉じる」の枠・下向きの山・カードと表とメニューの枠・タブの影・「保存する」の地）", () => {
    expect(value(".rl-search:focus-within", "border-color").toUpperCase()).toBe("#3F8DA5");
    expect(value(".rl-usage-close", "border").toUpperCase()).toBe("2PX SOLID #3F8DA5");
    for (const selector of [".rl-select", ".rl-team"]) {
      const image = value(selector, "background-image").toUpperCase();
      expect(image.match(/#7A8592/g)?.length, selector).toBe(2);
    }
    expect(solid("var(--rl-mark)")).toEqual(solid("#7A8592"));
    for (const selector of [".rl-card", ".rl-table", ".rl-menu", ".rl-empty-box"]) {
      expect(value(selector, "border").toUpperCase(), selector).toBe("1PX SOLID #E3E8EE");
    }
    expect(value(".rl-th", "border-bottom").toUpperCase()).toBe("1PX SOLID #E3E8EE");
    expect(value('.rl-tab[aria-selected="true"]', "box-shadow").toUpperCase()).toContain(
      "0 1PX 2PX #CFD7E0",
    );
    expect(value(".rl-dates__btn--save", "background").toUpperCase()).toBe("#2F7C96");
    // 閉じるアイコンのマウス（白と 3.77:1）と下向きの山（白と 3.75:1）は届く
    expect(
      round2(contrastRatio(color(".rl-popup .dialog__header .icon-btn:hover", "color"), WHITE)),
    ).toBe(3.77);
    expect(round2(contrastRatio(solid("var(--rl-mark)"), WHITE))).toBe(3.75);
  });

  it("プレースホルダーは色と不透明度 1（ブラウザの既定の色と薄さを使わない。総論 8.3 の 18）", () => {
    expect(decl(rules, ".rl-search__input::placeholder", "color")).toBe("var(--rl-placeholder)");
    expect(decl(rules, ".rl-search__input::placeholder", "opacity")).toBe("1");
  });
});

describe("M7-list-51 焦点の見た目（§2.4・§2.6・§2.7、総論 8.3 の 19）", () => {
  it("管理画面に共通の焦点の枠は 2px solid #3F8DA5・外へ 2px（11-8 §2.2.6・別表A の 1）。詳細度は :focus-visible だけ", () => {
    expect(value(COMMON_FOCUS, "outline").toUpperCase()).toBe("2PX SOLID #3F8DA5");
    expect(value(COMMON_FOCUS, "outline-offset")).toBe("2px");
    expect(specificity(COMMON_FOCUS)).toEqual([0, 1, 0]);
  });

  it("一覧の輪郭 #1F2933 は部品ごとのクラスに当て、区分チップと「絞り込みを解除」には当てない（共通の焦点の枠が効く）", () => {
    // 組織内分類の節（11-3。.ob-root の輪郭と詳細パネルの ×。同じ値）は classification-css.test.ts で確かめる
    const outlined = rulesWith("outline")
      .filter((r) => r.declarations.get("outline") === LIST_OUTLINE)
      .flatMap((r) => r.selectors)
      .filter((selector) => !selector.startsWith(".ob-"));
    for (const selector of [
      ".rl-btn:focus-visible",
      ".rl-card--alert:focus-visible",
      ".rl-select:focus-visible",
      ".rl-name:focus-visible",
      ".rl-team:focus-visible",
      ".rl-switch:focus-visible",
      ".rl-open:focus-visible",
      ".rl-more:focus-visible",
      ".rl-empty__btn:focus-visible",
      ".rl-menu__item:focus-visible",
      ".rl-tab:focus-visible",
    ]) {
      expect(outlined, selector).toContain(selector);
    }
    for (const selector of outlined) {
      expect(selector, selector).not.toMatch(/rl-chip|rl-clear|rl-popup|rl-usage|rl-dates|dialog/);
      // ボタンのすべてに当てる書き方をしない
      expect(selector, selector).toMatch(/^\.rl-[a-z_-]+(--[a-z]+)?:focus-visible$/);
    }
    // 区分チップと「絞り込みを解除」には、自分の焦点の指定が無い（共通の焦点の枠が効く）
    for (const rule of rulesWith("outline")) {
      for (const selector of rule.selectors) {
        expect(selector, selector).not.toMatch(/rl-chip--status|rl-clear/);
      }
    }
    const ring = solid("#3F8DA5");
    expectRatios(
      [
        ["共通の焦点の枠／区分チップのまわりのセルの白", ring, WHITE, 3.77],
        ["共通の焦点の枠／マウスを載せた行の地", ring, ROW_HOVER, 3.68],
        ["共通の焦点の枠／「絞り込みを解除」のまわりのページの地", ring, PAGE_BG, 3.58],
      ],
      3,
    );
    expect(round2(contrastRatio(solid("#1F2933"), color(".rl-tabs", "background")))).toBe(12.78);
  });

  it("区分タブの輪郭はタブの内側（outline-offset: -4px。§2.6）で、隣の選択中のタブの影とも届く", () => {
    expect(decl(rules, ".rl-tab:focus-visible", "outline")).toBe(LIST_OUTLINE);
    expect(decl(rules, ".rl-tab:focus-visible", "outline-offset")).toBe("-4px");
    expect(round2(contrastRatio(solid("#1F2933"), solid("#CFD7E0")))).toBe(10.15);
  });

  it("検索欄の入力欄は焦点のときも outline: none で、共通の焦点の枠より強い。焦点は欄の枠 #3F8DA5 で示す（§2.7）", () => {
    for (const selector of [
      ".rl-search .rl-search__input",
      ".rl-search .rl-search__input:focus",
      ".rl-search .rl-search__input:focus-visible",
    ]) {
      expect(decl(rules, selector, "outline"), selector).toBe("none");
    }
    expect(
      compareSpecificity(
        specificity(".rl-search .rl-search__input:focus-visible"),
        specificity(COMMON_FOCUS),
      ),
    ).toBeGreaterThan(0);
    expect(
      compareSpecificity(
        specificity(".rl-search .rl-search__input:focus"),
        specificity(COMMON_FOCUS),
      ),
    ).toBeGreaterThan(0);
    expectRatios(
      [
        [
          "検索欄の焦点の枠／ページの地",
          color(".rl-search:focus-within", "border-color"),
          PAGE_BG,
          3.58,
        ],
        ["検索欄の焦点の枠／中の白", color(".rl-search:focus-within", "border-color"), WHITE, 3.77],
      ],
      3,
    );
  });
});

describe("M7-list-51 氏名と「結果を見る」のリンクの 4 つの状態（§2.8、総論 8.3 の 25）", () => {
  const adminLink = specificity(".admin-root a");

  it(":link・:visited を付けた指定で .admin-root a より強く、押している間の指定が無い", () => {
    for (const link of [".rl-name", ".rl-open"]) {
      for (const selector of [
        `${link}:link`,
        `${link}:visited`,
        `${link}:link:hover`,
        `${link}:visited:hover`,
      ]) {
        expect(
          rules.some((r) => r.at === null && r.selectors.includes(selector)),
          selector,
        ).toBe(true);
        expect(compareSpecificity(specificity(selector), adminLink), selector).toBeGreaterThan(0);
      }
      for (const rule of rules) {
        for (const selector of rule.selectors) {
          if (selector.startsWith(link)) expect(selector, selector).not.toContain(":active");
        }
      }
    }
  });

  it("ふだん・訪れたあと・マウスの色が §2.8 の表のとおりで、各状態の地と 4.5:1 以上", () => {
    const name = color(".rl-name:link", "color");
    expect(color(".rl-name:visited", "color")).toEqual(name);
    expect(hexOf(name)).toBe("#1F2933");
    expect(decl(rules, ".rl-name:link", "text-decoration")).toBe("none");
    const nameHover = color(".rl-name:link:hover", "color");
    expect(color(".rl-name:visited:hover", "color")).toEqual(nameHover);
    expect(hexOf(nameHover)).toBe("#2E6F84");
    expect(decl(rules, ".rl-name:link:hover", "text-decoration")).toBe("underline");
    const open = color(".rl-open:link", "color");
    expect(color(".rl-open:visited", "color")).toEqual(open);
    expect(color(".rl-open:visited", "background")).toEqual(color(".rl-open:link", "background"));
    expect(hexOf(color(".rl-open:link", "background"))).toBe("#E8F3F6");
    expect(hexOf(color(".rl-open:link:hover", "background"))).toBe("#D3E8EE");
    expect(color(".rl-open:visited:hover", "background")).toEqual(
      color(".rl-open:link:hover", "background"),
    );
    expectRatios(
      [
        ["氏名 ふだん／白", name, WHITE, 14.76],
        ["氏名 ふだん／行のマウスの地", name, ROW_HOVER, 14.37],
        ["氏名 マウス／行のマウスの地", nameHover, ROW_HOVER, 5.49],
        ["氏名 マウス／白（狭い幅・指の端末）", nameHover, WHITE, 5.64],
        ["結果を見る ふだん", open, color(".rl-open:link", "background"), 5.13],
        ["結果を見る マウス", open, color(".rl-open:link:hover", "background"), 4.57],
      ],
      4.5,
    );
  });
});

describe("（ID なし）§2.22 の狭い幅・中くらいの幅と pointer: coarse の値（狭い幅の E2E は PR-7.13a まで fixme。総論 5.1）", () => {
  it("一覧の根はコンテナで、切り替えは一覧の幅（840px 未満・840〜1099px）", () => {
    expect(decl(rules, ".rl-root", "container-type")).toBe("inline-size");
    const ats = new Set(rules.map((r) => r.at));
    expect(ats.has(NARROW)).toBe(true);
    expect(ats.has(MEDIUM)).toBe(true);
    expect(ats.has(COARSE)).toBe(true);
  });

  it("狭い（840px 未満）: ボタン・タブを幅いっぱいで同じ幅、カード 2 列、検索欄は 2 段目、選択欄は 3 段目、件数は最後の段、表はカード型の行", () => {
    expect(decl(rules, ".rl-head__actions", "width", NARROW)).toBe("100%");
    expect(decl(rules, ".rl-head__actions", "margin-left", NARROW)).toBe("0");
    expect(decl(rules, ".rl-head__actions .rl-btn", "flex", NARROW)).toBe("1 1 0");
    expect(decl(rules, ".rl-stats", "grid-template-columns", NARROW)).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
    expect(decl(rules, ".rl-tabs", "width", NARROW)).toBe("100%");
    expect(decl(rules, ".rl-tab", "flex", NARROW)).toBe("1 1 0");
    expect(decl(rules, ".rl-search", "width", NARROW)).toBe("100%");
    expect(decl(rules, ".rl-select", "flex", NARROW)).toBe("1 1 40%");
    expect(decl(rules, ".rl-select", "min-width", NARROW)).toBe("0");
    expect(decl(rules, ".rl-count", "width", NARROW)).toBe("100%");
    expect(decl(rules, ".rl-count", "margin-left", NARROW)).toBe("0");
    expect(decl(rules, ".rl-table thead", "display", NARROW)).toBe("none");
    expect(decl(rules, ".rl-table", "border", NARROW)).toBe("none");
    expect(decl(rules, ".rl-table", "background", NARROW)).toBe("none");
    const row = ".rl-row";
    expect(decl(rules, row, "display", NARROW)).toBe("grid");
    expect(decl(rules, row, "grid-template-columns", NARROW)).toBe("1fr auto");
    expect(decl(rules, row, "gap", NARROW)).toBe("8px 10px");
    expect(decl(rules, row, "margin-bottom", NARROW)).toBe("10px");
    expect(decl(rules, row, "padding", NARROW)).toBe("12px 14px");
    expect(value(row, "border", NARROW).toUpperCase()).toBe("1PX SOLID #E3E8EE");
    expect(decl(rules, row, "border-radius", NARROW)).toBe("12px");
    expect(decl(rules, row, "background", NARROW)).toBe("#ffffff");
    expect(decl(rules, ".rl-td", "padding", NARROW)).toBe("0");
    expect(decl(rules, ".rl-td", "border-bottom", NARROW)).toBe("none");
    expect(decl(rules, ".rl-row:hover .rl-td", "background", NARROW)).toBe("none");
    const cells: ReadonlyArray<readonly [string, string, string]> = [
      [".rl-td--person", "1", "1"],
      [".rl-td--actions", "1", "2"],
      [".rl-td--type", "2", "1"],
      [".rl-td--latest", "2", "2"],
      [".rl-td--team", "3", "1"],
      [".rl-td--excl", "3", "2"],
    ];
    for (const [selector, gridRow, gridColumn] of cells) {
      expect(decl(rules, selector, "grid-row", NARROW), selector).toBe(gridRow);
      expect(decl(rules, selector, "grid-column", NARROW), selector).toBe(gridColumn);
    }
    expect(decl(rules, ".rl-td--type", "align-self", NARROW)).toBe("center");
    expect(decl(rules, ".rl-td--latest", "text-align", NARROW)).toBe("right");
    expect(decl(rules, ".rl-td--excl", "text-align", NARROW)).toBe("right");
    expect(decl(rules, ".rl-team", "width", NARROW)).toBe("100%");
    expect(decl(rules, ".rl-team", "min-height", NARROW)).toBe("40px");
    for (const selector of [".rl-switch", ".rl-open", ".rl-more"]) {
      expect(decl(rules, selector, "min-height", NARROW), selector).toBe("40px");
    }
    expect(decl(rules, ".rl-more", "width", NARROW)).toBe("40px");
    // 狭い幅でも時刻は出す
    expect(findDecl(rules, ".rl-latest__time", "display", NARROW)).toBeUndefined();
  });

  it("中くらい（840〜1099px）: 検索欄は伸び縮み、件数は次の段に右寄せ、セルの余白を詰め、時刻とオフの「集計に含む」を隠す", () => {
    expect(decl(rules, ".rl-search", "flex", MEDIUM)).toBe("1 1 150px");
    expect(decl(rules, ".rl-search", "min-width", MEDIUM)).toBe("140px");
    expect(decl(rules, ".rl-count", "width", MEDIUM)).toBe("100%");
    expect(decl(rules, ".rl-count", "margin-left", MEDIUM)).toBe("0");
    expect(decl(rules, ".rl-count", "text-align", MEDIUM)).toBe("right");
    expect(decl(rules, ".rl-th", "padding", MEDIUM)).toBe("10px 10px");
    expect(decl(rules, ".rl-td", "padding", MEDIUM)).toBe("12px 10px");
    expect(decl(rules, ".rl-team", "min-width", MEDIUM)).toBe("104px");
    expect(
      decl(rules, '.rl-switch[aria-checked="false"] .rl-switch__label', "display", MEDIUM),
    ).toBe("none");
    expect(decl(rules, ".rl-latest__time", "display", MEDIUM)).toBe("none");
    // オンの「除外中」は隠さない
    expect(
      findDecl(rules, '.rl-switch[aria-checked="true"] .rl-switch__label', "display", MEDIUM),
    ).toBeUndefined();
  });

  it("指で操作する端末: 結果を見る・⋮・チームの選択・スイッチを 40px にし、行のマウスの地を付けない", () => {
    expect(decl(rules, ".rl-open", "min-height", COARSE)).toBe("40px");
    expect(decl(rules, ".rl-more", "min-height", COARSE)).toBe("40px");
    expect(decl(rules, ".rl-more", "width", COARSE)).toBe("40px");
    expect(decl(rules, ".rl-team", "height", COARSE)).toBe("40px");
    expect(decl(rules, ".rl-switch", "min-height", COARSE)).toBe("40px");
    expect(decl(rules, ".rl-row:hover .rl-td", "background", COARSE)).toBe("none");
  });

  it("見出しのセルは上に残る（sticky・top 0・重なり 6）。一覧があるときだけ根のスクロールに scroll-padding-top 48px（総論 8.5）", () => {
    expect(decl(rules, ".rl-th", "position")).toBe("sticky");
    expect(decl(rules, ".rl-th", "top")).toBe("0");
    expect(decl(rules, ".rl-th", "z-index")).toBe("6");
    expect(decl(rules, "html:has(.rl-root)", "scroll-padding-top")).toBe("48px");
    // 見出しの行を上に残すため、一覧の根に overflow を付けない
    expect(findDecl(rules, ".rl-root", "overflow")).toBeUndefined();
  });
});
