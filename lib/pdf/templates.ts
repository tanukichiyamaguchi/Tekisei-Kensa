// PDF のヘッダー・フッター（07 §9.5）。印刷用ページの CSS の @page マージンボックスで描く。
// 07 §9.7 の案（page.pdf の headerTemplate に @font-face を埋め込む）は、Chromium がテンプレート内のフォント取得を
// 許さず「Printing failed」になり、ページ側の Web フォントも使われない（日本語が豆腐になる）ことを実装時に確認したため、
// ページ自身のフォント（Noto Sans JP）がそのまま使えるマージンボックス（Chromium 131 以降）に置き換えた
import type { PdfMode } from "./visibility";

export const RESTRICTED_FOOTER_NOTE = "評価・合致度・リスク非表示";

export interface PageMarginArgs {
  readonly headerText: string; // 「{氏名} 様の診断結果」
  readonly submittedAtText: string; // 06 §10.3 で整形済み
  readonly generatedAtText: string; // 出力日時（Asia/Tokyo）
  readonly mode: PdfMode;
}

/** CSS の文字列リテラル。引用符・改行・山括弧（</style> による脱出）をエスケープする */
export function cssString(value: string): string {
  const escaped = value.replace(/[\\"<>\n\r\f]/g, (c) => {
    const hex = (c.codePointAt(0) ?? 0).toString(16).toUpperCase();
    return `\\${hex} `;
  });
  return `"${escaped}"`;
}

/** 左上「{氏名} 様の診断結果」、右上「回答日時 …」、左下「出力日時 …」、下中央「ページ / 総ページ」、右下（restricted のみ）の注記 */
export function buildPageMarginCss(args: PageMarginArgs): string {
  const box = 'font-family: "Noto Sans JP", sans-serif; font-size: 8px; color: #52606d;';
  const rules = [
    `@top-left { content: ${cssString(args.headerText)}; ${box} }`,
    `@top-right { content: ${cssString(`回答日時 ${args.submittedAtText}`)}; ${box} }`,
    `@bottom-left { content: ${cssString(`出力日時 ${args.generatedAtText}`)}; ${box} }`,
    `@bottom-center { content: counter(page) " / " counter(pages); ${box} }`,
  ];
  if (args.mode === "restricted") {
    rules.push(`@bottom-right { content: ${cssString(RESTRICTED_FOOTER_NOTE)}; ${box} }`);
  }
  return `@page { ${rules.join(" ")} }`;
}
