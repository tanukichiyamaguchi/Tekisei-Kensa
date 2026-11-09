// M7-exam-13・M7-exam-16 受験者側の画面の配色（11-1 §2.1.3・§5.1、総論 8.3 の配色の取り決め）。
// exam.css を読み、トークンの値を照合し、WCAG 2 の相対輝度とコントラスト比をトークンの値から計算する。
// 半透明の色・不透明度は下の地に重ね、各成分を四捨五入（0.5 は切り上げ。Math.round）して 8 ビットにしてから計算する。
// axe が見ないホバー・押下・訪れたあとの文字の色と、axe が調べない部品の 3:1 をここで確かめる
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../../../app/(respondent)/exam.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
  /** @media の条件（無ければ null） */
  readonly media: string | null;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    map.set(normalize(part.slice(0, colon)), normalize(part.slice(colon + 1)));
  }
  return map;
}

/** 規則を書かれた順に取り出す（@media の中は 1 段まで。@keyframes は飛ばす） */
function parseRules(text: string, media: string | null = null): Rule[] {
  const out: Rule[] = [];
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf("{", pos);
    if (open < 0) break;
    const prelude = normalize(text.slice(pos, open));
    let depth = 1;
    let end = open + 1;
    while (end < text.length && depth > 0) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") depth -= 1;
      end += 1;
    }
    const inner = text.slice(open + 1, end - 1);
    if (prelude.startsWith("@media")) out.push(...parseRules(inner, prelude));
    else if (!prelude.startsWith("@keyframes")) {
      out.push({
        selectors: prelude.split(",").map(normalize),
        declarations: parseDeclarations(inner),
        media,
      });
    }
    pos = end;
  }
  return out;
}

const rules = parseRules(source);

/** セレクタの宣言（後に書いたものが勝つ）。media を指定しなければ @media の外だけ */
function decl(selector: string, property: string, media: string | null = null): string {
  const hits = rules.filter((r) => r.media === media && r.selectors.includes(selector));
  for (const rule of [...hits].reverse()) {
    const value = rule.declarations.get(property);
    if (value !== undefined) return value;
  }
  throw new Error(`${media ?? ""} ${selector} { ${property} } がありません`);
}

const rootRule = rules.find((r) => r.media === null && r.selectors.includes(".exam-root"));
if (!rootRule) throw new Error(".exam-root の規則がありません");
const tokens = new Map(
  [...rootRule.declarations].filter(([name]) => name.startsWith("--")),
) as ReadonlyMap<string, string>;

/** var(--x) をトークンの値に置き換える */
function resolve(value: string): string {
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
    const token = tokens.get(name);
    if (token === undefined) throw new Error(`トークン ${name} がありません`);
    return token;
  });
}

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly alpha: number;
}

function parseColor(value: string): Rgba {
  const v = resolve(value).trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex?.[1]) {
    const n = hex[1];
    return {
      rgb: [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)],
      alpha: 1,
    };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`色として読めません: ${value}`);
}

/** 色を下の地に重ねた色（各成分を Math.round で 8 ビットに） */
function over(color: Rgba, background: Rgb, opacity = 1): Rgb {
  const a = color.alpha * opacity;
  return [0, 1, 2].map((i) =>
    Math.round(a * color.rgb[i]! + (1 - a) * background[i]!),
  ) as unknown as Rgb;
}

const solid = (value: string): Rgb => {
  const c = parseColor(value);
  expect(c.alpha, value).toBe(1);
  return c.rgb;
};

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** 比は小数第 3 位を四捨五入して書く（11-1 §2.1.3） */
const round2 = (n: number) => Math.round(n * 100) / 100;
const hexOf = (rgb: Rgb) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;

const WHITE: Rgb = [255, 255, 255];
const PAGE_BG = solid("var(--color-bg)");

describe("M7-exam-13 受験者側のトークンと文字のコントラスト（K-48）", () => {
  it("11-1 §2.1.3 のトークンの値", () => {
    const expected: Readonly<Record<string, string>> = {
      "--color-bg": "#F7F9FC",
      "--color-surface": "#FFFFFF",
      "--color-text": "#4C4B4B",
      "--color-primary": "#3F8DA5",
      "--color-button": "#397F94",
      "--color-button-hover": "rgba(50, 111, 130, 0.9)",
      "--color-primary-50": "rgba(63, 141, 165, 0.5)",
      "--color-primary-10": "rgba(63, 141, 165, 0.1)",
      "--color-step-number-current": "#24515F",
      "--color-step-number-future": "#141313",
      "--color-step-label": "#377A8F",
      "--color-step-circle-hover-done": "#437E92",
      "--color-loading-text": "#387D93",
      "--color-line": "#D5D5D5",
      "--color-input-border": "#7C90B9",
      "--color-placeholder": "#767676",
      "--color-select-placeholder": "#767676",
      "--color-select-text": "#252525",
      "--color-select-arrow": "#949494",
      "--color-destructive": "#DD0D0D",
      "--color-select-focus": "#2B94E8",
      "--color-select-invalid": "#FF0000",
      "--color-link": "#3B799C",
      "--color-radio-border": "#949494",
      "--color-radio-checked": "#337AB7",
      "--color-step-row-border": "rgba(76, 75, 75, 0.2)",
      "--color-step-circle-border": "rgba(76, 75, 75, 0.3)",
      "--color-step-circle-bg": "rgba(76, 75, 75, 0.1)",
      "--color-overlay-light": "rgba(255, 255, 255, 0.5)",
      "--color-overlay-dark": "rgba(0, 0, 0, 0.4)",
      "--font-inter": '"Inter"',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(tokens.get(name)?.toLowerCase(), name).toBe(value.toLowerCase());
    }
    // 本文の書体は Inter が先頭（日本語は代わりの書体）。ラジオボタンの文言は Arial
    expect(tokens.get("--font-body")).toMatch(/^var\(--font-inter\), "Hiragino Sans"/);
    expect(tokens.get("--font-radio")).toMatch(/^Arial, "Hiragino Sans"/);
    expect(decl(".exam-root", "font-family")).toBe("var(--font-body)");
    expect(decl(".exam-root .exam-choice", "font-family")).toBe("var(--font-radio)");
  });

  it("--color-primary-90 と、ホバー・押下のときだけの番号の色のトークンは置かない", () => {
    expect(tokens.has("--color-primary-90")).toBe(false);
    for (const name of tokens.keys()) {
      expect(name, name).not.toMatch(/number.*(hover|active)|(hover|active).*number/);
    }
  });

  it("K-48 で変えた 12 組（ホバー・押下を含む）がトークンの値で 4.5:1 以上", () => {
    const button = ".exam-root .exam-button";
    const circle = ".exam-root .exam-steps__circle";
    const current = '.exam-root .exam-steps__cell[data-state="current"] .exam-steps__circle';
    const done = '.exam-root .exam-steps__cell[data-state="done"] .exam-steps__circle';
    const future = '.exam-root .exam-steps__cell[data-state="future"] .exam-steps__circle';
    const futureOpacity = Number(decl(future, "opacity"));
    expect(futureOpacity).toBe(0.7);
    const hoverBg = parseColor(decl(`${circle}:hover`, "background"));
    const futureNumber = over(parseColor(decl(circle, "color")), PAGE_BG, futureOpacity);
    const futureCircleBg = over(parseColor(decl(circle, "background")), PAGE_BG, futureOpacity);
    const futureHoverBg = over(hoverBg, PAGE_BG, futureOpacity);
    const currentNumber = solid(decl(current, "color"));
    const overlay = parseColor(decl(".exam-root .exam-loading", "background"));
    const loadingText = solid(decl(".exam-root .exam-loading__text", "color"));

    const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
      [
        "1 プレースホルダー／入力欄の白",
        solid(decl(".exam-root .exam-input::placeholder", "color")),
        solid(decl(".exam-root .exam-input", "background")),
        4.54,
      ],
      [
        "2 プルダウンの未選択／白",
        solid(decl('.exam-root .exam-select[data-empty="true"]', "color")),
        solid(decl(".exam-root .exam-select", "background")),
        4.54,
      ],
      [
        "3 白い文字／ボタンの地",
        solid(decl(button, "color")),
        solid(decl(button, "background")),
        4.53,
      ],
      [
        "4 白い文字／ボタンのホバー（白のカードの上）",
        WHITE,
        over(parseColor(decl(`${button}:hover`, "background")), WHITE),
        4.57,
      ],
      [
        "4 白い文字／ボタンの押下（画面の背景の上）",
        WHITE,
        over(parseColor(decl(`${button}:active`, "background")), PAGE_BG),
        4.58,
      ],
      [
        "5 ログインのリンク／画面の背景",
        solid(decl(".exam-root .exam-login-link:link", "color")),
        PAGE_BG,
        4.52,
      ],
      [
        "6 今のステップの番号／丸の地",
        currentNumber,
        over(parseColor(decl(current, "background")), PAGE_BG),
        7.39,
      ],
      [
        "7 今と済んだステップのラベル／画面の背景",
        solid(
          decl('.exam-root .exam-steps__cell[data-state="current"] .exam-steps__label', "color"),
        ),
        PAGE_BG,
        4.58,
      ],
      ["8 先のステップの番号／丸の地（丸ごと 70%）", futureNumber, futureCircleBg, 6.06],
      [
        "9 白い番号／済んだステップの丸のホバー・押下",
        solid(decl(done, "color")),
        solid(decl(`${done}:hover`, "background")),
        4.53,
      ],
      [
        "10 今のステップの番号／ホバー・押下の地",
        currentNumber,
        over(parseColor(decl(`${current}:hover`, "background")), PAGE_BG),
        4.6,
      ],
      ["11 先のステップの番号／ホバー・押下の地（丸ごと 70%）", futureNumber, futureHoverBg, 4.53],
      ["12 「ロード中」／全面（画面の背景の上）", loadingText, over(overlay, PAGE_BG), 4.52],
      ["12 「ロード中」／全面（白のカードの上）", loadingText, over(overlay, WHITE), 4.64],
    ];
    // 表の重ねた色（11-1 §2.1.3）
    expect(hexOf(over(parseColor(decl(`${button}:hover`, "background")), WHITE))).toBe("#477D8F");
    expect(hexOf(over(parseColor(decl(`${button}:hover`, "background")), PAGE_BG))).toBe("#467D8E");
    expect(hexOf(futureNumber)).toBe("#585859");
    expect(hexOf(futureCircleBg)).toBe("#EBEDF0");
    expect(hexOf(futureHoverBg)).toBe("#B7D3DE");
    expect(hexOf(over(hoverBg, PAGE_BG))).toBe("#9BC3D1");
    expect(hexOf(over(overlay, PAGE_BG))).toBe("#FBFCFE");
    for (const [label, text, background, expected] of pairs) {
      const r = ratio(text, background);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("基準に届いていて変えない文字の組も 4.5:1 以上", () => {
    const text = solid("var(--color-text)");
    expect(round2(ratio(text, WHITE))).toBe(8.69);
    expect(round2(ratio(text, PAGE_BG))).toBe(8.24);
    expect(round2(ratio(solid(decl(".exam-root .exam-select", "color")), WHITE))).toBe(15.33);
    const unanswered = solid(
      decl(".exam-root .exam-question--unanswered .exam-question__text", "color"),
    );
    expect(round2(ratio(unanswered, WHITE))).toBe(5.08);
    expect(round2(ratio(solid(decl(".exam-root .swal-title", "color")), WHITE))).toBe(7);
    expect(round2(ratio(solid(decl(".exam-root .swal-content", "color")), WHITE))).toBe(7.57);
  });

  it("ログインのリンクは 4 つの状態の指定がこの順にあり、どれも画面の背景の上で 4.5:1 以上。下線なし", () => {
    const index = (selector: string) =>
      rules.findIndex((r) => r.media === null && r.selectors.includes(selector));
    const link = index(".exam-root .exam-login-link:link");
    const visited = index(".exam-root .exam-login-link:visited");
    const hover = index(".exam-root .exam-login-link:hover");
    const active = index(".exam-root .exam-login-link:active");
    expect(link).toBeGreaterThanOrEqual(0);
    expect(visited).toBeGreaterThanOrEqual(link);
    expect(hover).toBeGreaterThan(visited);
    expect(active).toBeGreaterThan(hover);
    expect(decl(".exam-root .exam-login-link:link", "color")).toBe("var(--color-link)");
    expect(decl(".exam-root .exam-login-link:visited", "color")).toBe("var(--color-link)");
    expect(decl(".exam-root .exam-login-link:hover", "color").toUpperCase()).toBe("#205F82");
    expect(decl(".exam-root .exam-login-link:active", "color").toUpperCase()).toBe("#134B70");
    const expected: ReadonlyArray<readonly [string, number]> = [
      [":link", 4.52],
      [":visited", 4.52],
      [":hover", 6.59],
      [":active", 8.78],
    ];
    for (const [state, value] of expected) {
      const selector = `.exam-root .exam-login-link${state}`;
      expect(round2(ratio(solid(decl(selector, "color")), PAGE_BG)), state).toBe(value);
      expect(decl(selector, "text-decoration"), state).toBe("none");
    }
  });

  it("プレースホルダーは色と不透明度 1。押せない状態のボタンは --color-primary と --color-primary-10", () => {
    expect(decl(".exam-root .exam-input::placeholder", "color")).toBe("var(--color-placeholder)");
    expect(decl(".exam-root .exam-input::placeholder", "opacity")).toBe("1");
    const disabled = '.exam-root .exam-button[aria-disabled="true"]';
    expect(decl(disabled, "background")).toBe("var(--color-primary-10)");
    expect(decl(disabled, "color")).toBe("var(--color-primary)");
    for (const state of [":hover", ":active"]) {
      expect(decl(`${disabled}${state}`, "background")).toBe("var(--color-primary-10)");
    }
  });

  it("フォーカスの見た目: R-07 の箱・入力欄・プルダウン・見出しは輪郭を出さず、ボタン・リンク・ラジオボタンは 2px の枠を外側 2px", () => {
    expect(decl(".exam-root .swal-modal:focus", "outline")).toBe("none");
    expect(decl(".exam-root .exam-input:focus", "outline")).toBe("none");
    expect(decl(".exam-root .exam-select:focus", "outline")).toBe("none");
    expect(decl(".exam-root .exam-title:focus", "outline")).toBe("none");
    expect(decl(".exam-root .exam-step__heading:focus", "outline")).toBe("none");
    for (const selector of [
      ".exam-root .exam-button:focus-visible",
      ".exam-root .exam-login-link:focus-visible",
      ".exam-root .exam-choice__input:focus-visible",
    ]) {
      expect(decl(selector, "outline"), selector).toBe("2px solid var(--color-primary)");
      expect(decl(selector, "outline-offset"), selector).toBe("2px");
    }
    // R-07 の背景は変数を使わずに値で書く（::backdrop が変数を受け継がないブラウザがある）
    expect(decl(".exam-root .swal-layer::backdrop", "background")).toBe("rgba(0, 0, 0, 0.4)");
  });

  it("幅 490px・768px・920px の切り替え（11-1 §2.1.4）", () => {
    expect(decl(".exam-root .exam-frame-narrow", "max-width")).toBe("500px");
    expect(decl(".exam-root .exam-frame-narrow", "padding")).toBe("134px 20px 96px");
    expect(decl(".exam-root .exam-frame-wide", "width")).toBe("90%");
    expect(decl(".exam-root .exam-frame-wide", "padding-top")).toBe("50px");
    const narrow = "@media (max-width: 489.98px)";
    expect(decl(".exam-root .exam-frame-narrow", "margin", narrow)).toBe("0 8px");
    const tablet = "@media (max-width: 767.98px)";
    expect(decl(".exam-root .exam-title", "font-size")).toBe("23px");
    expect(decl(".exam-root .exam-title", "font-size", tablet)).toBe("19px");
    const mobile = "@media (max-width: 920px)";
    expect(decl(".exam-root .exam-steps__label", "display", mobile)).toBe("none");
    expect(decl(".exam-root .exam-steps__numbers", "min-width", mobile)).toBe("100%");
    expect(decl(".exam-root .exam-steps__line", "margin-top", mobile)).toBe("0");
    expect(decl(".exam-root .exam-step-content", "padding", mobile)).toBe("0 8px");
  });

  it("指定はすべて .exam-root の下に書く（body の margin を除く）", () => {
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (selector === "body") {
          expect([...rule.declarations.keys()]).toEqual(["margin"]);
          continue;
        }
        expect(selector, selector).toMatch(/^\.exam-root(\s|$)/);
      }
    }
    const keyframes = [...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(keyframes.length).toBeGreaterThan(0);
    for (const name of keyframes) expect(name).toMatch(/^exam-/);
  });
});

describe("M7-exam-16 部品の色（K-50）", () => {
  it("K-50 で変えた 4 組が 3:1 以上（枠は外の地と中の地の両方と比べる）", () => {
    const inputBorder = decl(".exam-root .exam-input", "border");
    expect(inputBorder).toBe("1px solid var(--color-input-border)");
    expect(decl(".exam-root .exam-select", "border")).toBe(inputBorder);
    const border = solid("var(--color-input-border)");
    const fieldBg = solid(decl(".exam-root .exam-input", "background"));
    const arrow = solid(decl(".exam-root .exam-select__arrow", "color"));
    const selectBg = solid(decl(".exam-root .exam-select", "background"));
    const focus = solid(decl(".exam-root .exam-select:focus", "border-color"));
    expect(decl(".exam-root .exam-select:focus", "box-shadow")).toBe(
      "0 0 6px var(--color-select-focus)",
    );
    expect(decl(".exam-root .exam-choice__input", "border")).toBe(
      "1px solid var(--color-radio-border)",
    );
    const radio = solid("var(--color-radio-border)");
    const radioBg = solid(decl(".exam-root .exam-choice__input", "background"));
    const cardBg = solid(decl(".exam-root .exam-card", "background"));

    const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
      ["1 入力欄・プルダウンの枠／画面の背景", border, PAGE_BG, 3.04],
      ["1 入力欄・プルダウンの枠／中の白", border, fieldBg, 3.21],
      ["2 プルダウンの矢印／プルダウンの地", arrow, selectBg, 3.03],
      ["3 プルダウンのフォーカスの枠と影／画面の背景", focus, PAGE_BG, 3.06],
      ["3 プルダウンのフォーカスの枠と影／中の白", focus, selectBg, 3.23],
      ["4 ラジオボタンの円／カードの地", radio, cardBg, 3.03],
      ["4 ラジオボタンの円／円の中", radio, radioBg, 3.03],
    ];
    for (const [label, part, next, expected] of pairs) {
      const r = ratio(part, next);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeGreaterThanOrEqual(3);
    }
  });

  it("基準に届いていて変えない部品も 3:1 以上", () => {
    const hoverBorder = solid(decl(".exam-root .exam-input:hover", "border-color"));
    expect(decl(".exam-root .exam-input:focus", "border-color")).toBe("var(--color-primary)");
    const invalid = over(
      parseColor(decl('.exam-root .exam-input[aria-invalid="true"]:not(:focus)', "border-color")),
      WHITE,
    );
    expect(hexOf(invalid)).toBe("#E75656");
    const selectInvalid = solid(
      decl('.exam-root .exam-select[aria-invalid="true"]:focus', "border-color"),
    );
    expect(decl('.exam-root .exam-select[aria-invalid="true"]', "box-shadow")).toBe(
      "0 0 6px var(--color-select-invalid)",
    );
    const checked = solid(decl(".exam-root .exam-choice__input:checked", "border-color"));
    expect(decl(".exam-root .exam-choice__input:checked", "background")).toBe(
      "var(--color-radio-checked)",
    );
    const ring = solid(
      decl(".exam-root .exam-button:focus-visible", "outline").replace(/^2px solid /, ""),
    );

    const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
      ["入力欄のホバー・押下・フォーカスの枠／画面の背景", hoverBorder, PAGE_BG, 3.58],
      ["入力欄のホバー・押下・フォーカスの枠／中の白", hoverBorder, WHITE, 3.77],
      ["入力欄の不正の枠／画面の背景", invalid, PAGE_BG, 3.4],
      ["入力欄の不正の枠／中の白", invalid, WHITE, 3.58],
      ["プルダウンの不正の枠と影／画面の背景", selectInvalid, PAGE_BG, 3.79],
      ["プルダウンの不正の枠と影／中の白", selectInvalid, WHITE, 4],
      ["選んだラジオボタンの円と点／白", checked, WHITE, 4.56],
      ["ボタン・リンク・ラジオボタンのフォーカスの枠／画面の背景", ring, PAGE_BG, 3.58],
      ["ボタン・リンク・ラジオボタンのフォーカスの枠／白のカード", ring, WHITE, 3.77],
    ];
    for (const [label, part, next, expected] of pairs) {
      const r = ratio(part, next);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeGreaterThanOrEqual(3);
    }
  });
});
