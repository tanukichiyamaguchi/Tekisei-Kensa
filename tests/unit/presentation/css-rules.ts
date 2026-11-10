// 配色の単体テストが CSS を読む補助（exam-css.test.ts と同じ書き方。11 総論 8.3 の配色の取り決め）。
// コメントを除いて規則を書かれた順に取り出し（@media・@container の中は 1 段まで。@keyframes は飛ばす）、宣言を読む。
// 色は #hex・rgb()・rgba() を読み、var() は指定したセレクタの規則の変数で解く。WCAG 2 の相対輝度とコントラスト比を求め、
// 半透明の色・不透明度は下の地に重ねて、各成分を四捨五入（0.5 は切り上げ。Math.round）して 8 ビットにする
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface CssRule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
  /** @media・@container の条件（無ければ null） */
  readonly at: string | null;
}

export const normalizeCss = (s: string) => s.trim().replace(/\s+/g, " ");

/** リポジトリの根からの道筋のファイルを読み、コメントを除く */
export function readCss(pathFromRoot: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${pathFromRoot}`, import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** かっこの外の区切り文字で分ける（:where(a, b) の中の , で分けない） */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const part of splitTopLevel(body, ";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    map.set(normalizeCss(part.slice(0, colon)), normalizeCss(part.slice(colon + 1)));
  }
  return map;
}

/** 規則を書かれた順に取り出す（@media・@container の中は 1 段まで。@keyframes は飛ばす） */
export function parseCssRules(text: string, at: string | null = null): CssRule[] {
  const out: CssRule[] = [];
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf("{", pos);
    if (open < 0) break;
    const prelude = normalizeCss(text.slice(pos, open));
    let depth = 1;
    let end = open + 1;
    while (end < text.length && depth > 0) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") depth -= 1;
      end += 1;
    }
    const inner = text.slice(open + 1, end - 1);
    if (prelude.startsWith("@media") || prelude.startsWith("@container")) {
      out.push(...parseCssRules(inner, prelude));
    } else if (!prelude.startsWith("@keyframes")) {
      out.push({
        selectors: splitTopLevel(prelude, ",").map(normalizeCss),
        declarations: parseDeclarations(inner),
        at,
      });
    }
    pos = end;
  }
  return out;
}

/** セレクタの宣言（後に書いたものが勝つ）。at を指定しなければ @media・@container の外だけ。無ければ undefined */
export function findDecl(
  rules: readonly CssRule[],
  selector: string,
  property: string,
  at: string | null = null,
): string | undefined {
  const hits = rules.filter((r) => r.at === at && r.selectors.includes(selector));
  for (const rule of [...hits].reverse()) {
    const value = rule.declarations.get(property);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** findDecl の、無ければ例外を投げる形 */
export function decl(
  rules: readonly CssRule[],
  selector: string,
  property: string,
  at: string | null = null,
): string {
  const value = findDecl(rules, selector, property, at);
  if (value === undefined) throw new Error(`${at ?? ""} ${selector} { ${property} } がありません`);
  return value;
}

/** セレクタの規則（@media・@container の外）の CSS 変数 */
export function variablesOf(
  rules: readonly CssRule[],
  selector: string,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const rule of rules) {
    if (rule.at !== null || !rule.selectors.includes(selector)) continue;
    for (const [name, value] of rule.declarations) if (name.startsWith("--")) map.set(name, value);
  }
  return map;
}

/** var(--x) を変数の値に置き換える */
export function resolveVars(value: string, variables: ReadonlyMap<string, string>): string {
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
    const token = variables.get(name);
    if (token === undefined) throw new Error(`変数 ${name} がありません`);
    return token;
  });
}

export type Rgb = readonly [number, number, number];
export interface Rgba {
  readonly rgb: Rgb;
  readonly alpha: number;
}

/** #hex（6 けた）・rgb()・rgba() を読む（var() は先に解いておく） */
export function parseColor(value: string): Rgba {
  const v = value.trim().toLowerCase();
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
export function over(color: Rgba, background: Rgb, opacity = 1): Rgb {
  const a = color.alpha * opacity;
  return [0, 1, 2].map((i) =>
    Math.round(a * color.rgb[i]! + (1 - a) * background[i]!),
  ) as unknown as Rgb;
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** 比は小数第 3 位を四捨五入して書く */
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const hexOf = (rgb: Rgb) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;

/**
 * セレクタの詳細度 [ID, クラス・属性・疑似クラス, 要素・疑似要素]。:where() は 0、:is()・:not()・:has() は中のいちばん強いもの。
 * 配色の単体テストで使う形（子孫・子の結合子、疑似要素 ::x）だけを読む
 */
export function specificity(selector: string): readonly [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  let rest = selector;
  const pseudoWithArgs = /:(where|is|not|has)\(/;
  for (;;) {
    const m = pseudoWithArgs.exec(rest);
    if (!m) break;
    const start = m.index;
    let depth = 0;
    let end = start + m[0].length - 1;
    for (; end < rest.length; end += 1) {
      if (rest[end] === "(") depth += 1;
      else if (rest[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const inner = rest.slice(start + m[0].length, end);
    if (m[1] !== "where") {
      const best = splitTopLevel(inner, ",")
        .map((s) => specificity(s.trim()))
        .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0];
      if (best) {
        a += best[0];
        b += best[1];
        c += best[2];
      }
    }
    rest = `${rest.slice(0, start)} ${rest.slice(end + 1)}`;
  }
  a += (rest.match(/#[\w-]+/g) ?? []).length;
  b += (rest.match(/\.[\w-]+/g) ?? []).length;
  b += (rest.match(/\[[^\]]*\]/g) ?? []).length;
  b += (rest.match(/(?<!:):[\w-]+/g) ?? []).length;
  c += (rest.match(/::[\w-]+/g) ?? []).length;
  c += (rest.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}

/** 詳細度の比較（x が y より強ければ正） */
export function compareSpecificity(
  x: readonly [number, number, number],
  y: readonly [number, number, number],
): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
