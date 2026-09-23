// 付録C（表示文言マスタ）から lib/masters/data/texts/*.json を生成する（08 §7.4、06 §4.1）。
//
//   pnpm texts:generate   生成して書き込む
//   pnpm texts:check      生成せずに、コミット済みの生成物と一致するかを検査する（08 §7.6。不一致は終了コード 1）
//
// 本文は付録C のコードブロック・表のセルをそのまま写す（06 §4.1「そのまま転記」）。日本語名は scripts/lib/labels.ts で
// 00 の識別子に写し、写せない名称・想定外の書式・件数の過不足が 1 つでもあれば何も書き込まずに失敗する。
import { pathToFileURL } from "node:url";

import { POSITION_RULES } from "../lib/scoring/compare";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
  type AptitudeKey,
  type AptitudeTypeKey,
  type PositionKey,
  type SocialStyleKey,
  type TraitKey,
} from "../lib/scoring/types";
import {
  codeBlock,
  fail,
  GenerationError,
  readSource,
  sectionByPrefix,
  sourceHashes,
  splitSections,
  tableRows,
  writeOrCheck,
} from "./lib/generator";
import { formatJson } from "./lib/json-format";
import {
  APTITUDE_INTERNAL_NAME_ALIASES,
  APTITUDE_LABELS,
  APTITUDE_TYPE_LABELS,
  DEVELOPMENT_GUIDE_ITEM_LABELS,
  POSITION_LABELS,
  SOCIAL_STYLE_LABELS,
  TRAIT_DETAIL_CATEGORY_LABELS,
  TRAIT_LABELS,
} from "./lib/labels";

/** 解析規則の版（08 §7.2）。規則を変えたら上げ、全生成物を再生成する */
const GENERATOR_VERSION = "1";

const SRC_C = "docs/付録C_表示文言マスタ.md";
const SRC_LABELS = "scripts/lib/labels.ts";
const OUT_DIR = "lib/masters/data/texts";

// ---------------------------------------------------------------------------
// 共通

function lookup<K>(table: ReadonlyMap<string, K>, name: string, where: string): K {
  const key = table.get(name);
  if (key === undefined) fail(`${where}: 写像できない名称です: ${name}`);
  return key;
}

const TYPE_BY_LABEL = new Map(APTITUDE_TYPE_LABELS.map((t) => [t.label, t.key]));
const TYPE_BY_SHORT_LABEL = new Map(APTITUDE_TYPE_LABELS.map((t) => [t.shortLabel, t.key]));
const TYPE_LABEL = new Map(APTITUDE_TYPE_LABELS.map((t) => [t.key, t]));
const STYLE_BY_EN = new Map(SOCIAL_STYLE_LABELS.map((s) => [s.labelEn, s.key]));
const STYLE_LABEL = new Map(SOCIAL_STYLE_LABELS.map((s) => [s.key, s]));
const TRAIT_BY_LABEL = new Map(TRAIT_LABELS.map((t) => [t.label, t.key]));
const POSITION_BY_LABEL = new Map(POSITION_LABELS.map((p) => [p.label, p.key]));

/** `**見出し**` の直後のコードブロックを、見出しの出現順に [見出し, 本文] で返す */
function boldBlocks(lines: readonly string[], where: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\*\*(.+)\*\*$/.exec(lines[i]!);
    if (!match) continue;
    const label = match[1]!;
    const rest = lines.slice(i + 1);
    const nextBold = rest.findIndex((l) => /^\*\*(.+)\*\*$/.test(l));
    const text = codeBlock(nextBold < 0 ? rest : rest.slice(0, nextBold), `${where}「${label}」`);
    if (text.trim() === "") fail(`${where}「${label}」の本文が空です`);
    out.push([label, text]);
  }
  return out;
}

/** 見出し → フィールドの対応で本文を取り出す。見出しの過不足・順序違いは失敗 */
function fieldsFromBlocks<F extends string>(
  blocks: ReadonlyArray<[string, string]>,
  mapping: ReadonlyArray<readonly [string, F]>,
  where: string,
): Record<F, string> {
  const labels = blocks.map(([label]) => label);
  const expected = mapping.map(([label]) => label);
  if (labels.join("|") !== expected.join("|")) {
    fail(`${where}: 見出しが想定と異なります（${labels.join("、")}）`);
  }
  const out = {} as Record<F, string>;
  mapping.forEach(([, field], i) => {
    out[field] = blocks[i]![1];
  });
  return out;
}

function requireAll<K extends string>(keys: readonly K[], got: ReadonlySet<K>, where: string) {
  const missing = keys.filter((k) => !got.has(k));
  if (missing.length > 0) fail(`${where}: 不足しています: ${missing.join(", ")}`);
}

// ---------------------------------------------------------------------------
// §1 適性タイプ別文言

interface TypeTextsItem {
  key: AptitudeTypeKey;
  aptitudeHeading: string;
  characteristics: string;
  suitableJobs: string;
  advice: string;
}

function parseTypeTexts(section: readonly string[]): TypeTextsItem[] {
  const where = "付録C §1";
  const firstSub = section.findIndex((l) => l.startsWith("### "));
  const [header, ...rows] = tableRows(section.slice(0, firstSub));
  if (header?.join("|") !== "タイプ|組織内分類|キャラクター名|適性（見出し）") {
    fail(`${where} の表の見出しが想定外です: ${header?.join(" | ")}`);
  }
  if (rows.length !== APTITUDE_TYPE_KEYS.length) fail(`${where} の表が 16 行ではありません`);
  const headings = new Map<AptitudeTypeKey, string>();
  for (const cells of rows) {
    if (cells.length !== 4) fail(`${where} の表の列数が 4 ではありません: ${cells.join(" | ")}`);
    const [typeName, styleEn, characterName, heading] = cells as [string, string, string, string];
    const key = lookup(TYPE_BY_LABEL, typeName, where);
    const def = TYPE_LABEL.get(key)!;
    // 付録B §6 由来の aptitude-types.json（labels.ts）と所属分類・キャラクター名が一致すること（08 §7.4）
    if (lookup(STYLE_BY_EN, styleEn, where) !== def.socialStyle) {
      fail(`${where}: ${typeName} の組織内分類が付録B と異なります: ${styleEn}`);
    }
    if (characterName !== def.characterName) {
      fail(`${where}: ${typeName} のキャラクター名が 00 §1.6 と異なります: ${characterName}`);
    }
    if (heading === "") fail(`${where}: ${typeName} の適性（見出し）が空です`);
    if (headings.has(key)) fail(`${where}: ${typeName} が重複しています`);
    headings.set(key, heading);
  }

  const subsections = splitSections(section.join("\n"), "###");
  const items = new Map<AptitudeTypeKey, TypeTextsItem>();
  for (const [title, lines] of subsections) {
    const key = lookup(TYPE_BY_LABEL, title, where);
    const fields = fieldsFromBlocks(
      boldBlocks(lines, `${where} ${title}`),
      [
        ["特徴", "characteristics"],
        ["適性職種", "suitableJobs"],
        ["アドバイス", "advice"],
      ],
      `${where} ${title}`,
    );
    items.set(key, { key, aptitudeHeading: headings.get(key)!, ...fields });
  }
  requireAll(APTITUDE_TYPE_KEYS, new Set(items.keys()), `${where} の各タイプ`);
  return APTITUDE_TYPE_KEYS.map((k) => items.get(k)!);
}

// ---------------------------------------------------------------------------
// §2 特性詳細

interface TraitDetailItem {
  category: string;
  sortOrder: number;
  text: string;
  appliesTo: AptitudeTypeKey[];
}

function parseTraitDetails(section: readonly string[]): {
  categories: Array<{ key: string; label: string; sortOrder: number }>;
  sentences: TraitDetailItem[];
} {
  const where = "付録C §2";
  const subsections = splitSections(section.join("\n"), "###");
  const titles = [...subsections.keys()];
  const expected = TRAIT_DETAIL_CATEGORY_LABELS.map((c) => c.label);
  if (titles.join("|") !== expected.join("|")) {
    fail(`${where}: カテゴリが想定（${expected.join("、")}）と異なります: ${titles.join("、")}`);
  }
  const sentences: TraitDetailItem[] = [];
  for (const category of TRAIT_DETAIL_CATEGORY_LABELS) {
    const [header, ...rows] = tableRows(subsections.get(category.label)!);
    if (header?.join("|") !== "定型文|表示するタイプ") {
      fail(`${where} ${category.label} の表の見出しが想定外です: ${header?.join(" | ")}`);
    }
    if (rows.length === 0) fail(`${where} ${category.label} に定型文がありません`);
    rows.forEach((cells, i) => {
      if (cells.length !== 2) fail(`${where} ${category.label} の列数が 2 ではありません`);
      const [text, types] = cells as [string, string];
      if (text === "") fail(`${where} ${category.label} ${i + 1} 行目の定型文が空です`);
      const appliesTo = types
        .split("、")
        .map((name) => lookup(TYPE_BY_SHORT_LABEL, name.trim(), `${where} ${category.label}`));
      if (appliesTo.length === 0) fail(`${where} ${category.label}: 表示するタイプが空です`);
      if (new Set(appliesTo).size !== appliesTo.length) {
        fail(`${where} ${category.label}: 表示するタイプが重複しています: ${types}`);
      }
      sentences.push({ category: category.key, sortOrder: i + 1, text, appliesTo });
    });
  }
  return {
    categories: TRAIT_DETAIL_CATEGORY_LABELS.map((c, i) => ({
      key: c.key,
      label: c.label,
      sortOrder: i + 1,
    })),
    sentences,
  };
}

// ---------------------------------------------------------------------------
// §3 項目詳細

interface TraitHighlightItem {
  key: TraitKey;
  highPositive: string;
  highNegative: string;
  lowPositive: string;
  lowNegative: string;
}

function parseTraitHighlights(section: readonly string[]): TraitHighlightItem[] {
  const where = "付録C §3";
  const [header, ...rows] = tableRows(section);
  const expectedHeader = [
    "尺度",
    "高い場合: ポジティブ",
    "高い場合: ネガティブ",
    "低い場合: ポジティブ",
    "低い場合: ネガティブ",
  ];
  if (header?.join("|") !== expectedHeader.join("|")) {
    fail(`${where} の表の見出しが想定外です: ${header?.join(" | ")}`);
  }
  const items = new Map<TraitKey, TraitHighlightItem>();
  for (const cells of rows) {
    if (cells.length !== 5) fail(`${where} の列数が 5 ではありません: ${cells.join(" | ")}`);
    const [name, highPositive, highNegative, lowPositive, lowNegative] = cells as [
      string,
      string,
      string,
      string,
      string,
    ];
    const key = lookup(TRAIT_BY_LABEL, name, where);
    if ([highPositive, highNegative, lowPositive, lowNegative].some((s) => s === "")) {
      fail(`${where}: ${name} に空の文言があります`);
    }
    if (items.has(key)) fail(`${where}: ${name} が重複しています`);
    items.set(key, { key, highPositive, highNegative, lowPositive, lowNegative });
  }
  requireAll(TRAIT_KEYS, new Set(items.keys()), where);
  return TRAIT_KEYS.map((k) => items.get(k)!);
}

// ---------------------------------------------------------------------------
// §4 育成方法

interface DevelopmentGuideItem {
  aptitudeKey: AptitudeKey;
  items: Array<{ key: string; label: string; text: string }>;
}

function parseDevelopmentGuides(section: readonly string[]): DevelopmentGuideItem[] {
  const where = "付録C §4";
  const byInternalName = new Map<string, AptitudeKey>([
    ...APTITUDE_LABELS.map((a) => [a.internalName, a.key] as const),
    ...Object.entries(APTITUDE_INTERNAL_NAME_ALIASES),
  ]);
  const labelOf = new Map(APTITUDE_LABELS.map((a) => [a.key, a.label]));

  // 内部名・表示名の表（表示名が 00 §1.4 と一致すること）
  const firstSub = section.findIndex((l) => l.startsWith("### "));
  const [header, ...rows] = tableRows(section.slice(0, firstSub));
  if (header?.join("|") !== "内部名|表示名") fail(`${where} の表の見出しが想定外です`);
  if (rows.length !== APTITUDE_KEYS.length) fail(`${where} の表が 4 行ではありません`);
  for (const [internalName, label] of rows as Array<[string, string]>) {
    const key = lookup(byInternalName, internalName, where);
    if (labelOf.get(key) !== label)
      fail(`${where}: ${internalName} の表示名が 00 §1.4 と異なります`);
  }

  const guides = new Map<AptitudeKey, DevelopmentGuideItem>();
  for (const [title, lines] of splitSections(section.join("\n"), "###")) {
    const match = /^(.+)（(.+)）$/.exec(title);
    if (!match) fail(`${where}: 見出しが「表示名（内部名）」の形ではありません: ${title}`);
    const key = lookup(byInternalName, match[2]!, where);
    if (labelOf.get(key) !== match[1]) fail(`${where}: ${title} の表示名が 00 §1.4 と異なります`);
    const fields = fieldsFromBlocks(
      boldBlocks(lines, `${where} ${title}`),
      DEVELOPMENT_GUIDE_ITEM_LABELS.map((item) => [item.label, item.key] as const),
      `${where} ${title}`,
    );
    if (guides.has(key)) fail(`${where}: ${title} が重複しています`);
    guides.set(key, {
      aptitudeKey: key,
      items: DEVELOPMENT_GUIDE_ITEM_LABELS.map((item) => ({
        key: item.key,
        label: item.label,
        text: fields[item.key],
      })),
    });
  }
  requireAll(APTITUDE_KEYS, new Set(guides.keys()), where);
  return APTITUDE_KEYS.map((k) => guides.get(k)!);
}

// ---------------------------------------------------------------------------
// §5 ソーシャルスタイル別文言とタイプ別の対処法

const STYLE_FIELDS = [
  ["タイプ名", "typeName"],
  ["偉人名（イラスト）", "greatPersonName"],
  ["本文", "body"],
  ["対処法見出し", "interactionHeading"],
  ["見分け方（見出し）", "identifyHeading"],
  ["見分け方", "identify"],
  ["褒め方（見出し）", "praiseHeading"],
  ["褒め方", "praise"],
  ["効果的な対応（見出し）", "responseHeading"],
  ["効果的な対応", "response"],
  ["声かけ例（見出し）", "phrasesHeading"],
  ["声かけ例", "phrases"],
] as const;
type StyleField = (typeof STYLE_FIELDS)[number][1];

type StyleTextsItem = { socialStyleKey: SocialStyleKey } & Record<StyleField, string>;

interface StyleInteractionItem {
  viewer: SocialStyleKey;
  target: SocialStyleKey;
  viewerHeading: string;
  text: string;
}

const INTERACTIONS_TITLE = "タイプ別の対処法（閲覧者のスタイル × 対象者のスタイル）";

function parseStyleTexts(section: readonly string[]): StyleTextsItem[] {
  const where = "付録C §5";
  const items = new Map<SocialStyleKey, StyleTextsItem>();
  for (const [title, lines] of splitSections(section.join("\n"), "###")) {
    if (title === INTERACTIONS_TITLE) continue;
    const match = /^(.+)タイプ（(.+)）$/.exec(title);
    if (!match)
      fail(`${where}: 見出しが「{カタカナ}タイプ（{英名}）」の形ではありません: ${title}`);
    const key = lookup(STYLE_BY_EN, match[2]!, where);
    if (STYLE_LABEL.get(key)!.labelKatakana !== match[1]) {
      fail(`${where}: ${title} のカタカナ名が 00 §1.7 と異なります`);
    }
    const fields = fieldsFromBlocks(boldBlocks(lines, `${where} ${title}`), STYLE_FIELDS, title);
    if (items.has(key)) fail(`${where}: ${title} が重複しています`);
    items.set(key, { socialStyleKey: key, ...fields });
  }
  requireAll(SOCIAL_STYLE_KEYS, new Set(items.keys()), where);
  return SOCIAL_STYLE_KEYS.map((k) => items.get(k)!);
}

function parseStyleInteractions(section: readonly string[]): StyleInteractionItem[] {
  const where = `付録C §5 ${INTERACTIONS_TITLE}`;
  const lines = splitSections(section.join("\n"), "###").get(INTERACTIONS_TITLE);
  if (!lines) fail(`${where} がありません`);
  const [header, ...rows] = tableRows(lines);
  if (header?.[0] !== "閲覧者 ＼ 対象者" || header.length !== 5) {
    fail(`${where} の表の見出しが想定外です: ${header?.join(" | ")}`);
  }
  const targets = header.slice(1).map((en) => lookup(STYLE_BY_EN, en, where));
  requireAll(SOCIAL_STYLE_KEYS, new Set(targets), `${where} の列`);
  const byViewerHeading = new Map(
    SOCIAL_STYLE_LABELS.map((s) => [`${s.labelKatakana}なあなたは`, s.key]),
  );
  const items: StyleInteractionItem[] = [];
  for (const cells of rows) {
    if (cells.length !== 5) fail(`${where} の列数が 5 ではありません`);
    const viewerHeading = cells[0]!;
    const viewer = lookup(byViewerHeading, viewerHeading, where);
    targets.forEach((target, i) => {
      const text = cells[i + 1]!;
      if (text === "") fail(`${where}: ${viewerHeading} × ${target} が空です`);
      items.push({ viewer, target, viewerHeading, text });
    });
  }
  requireAll(SOCIAL_STYLE_KEYS, new Set(items.map((i) => i.viewer)), `${where} の行`);
  if (items.length !== 16) fail(`${where} が 4 × 4 = 16 件ではありません（${items.length} 件）`);
  const order = (k: SocialStyleKey) => SOCIAL_STYLE_KEYS.indexOf(k);
  return items.sort(
    (a, b) => order(a.viewer) - order(b.viewer) || order(a.target) - order(b.target),
  );
}

// ---------------------------------------------------------------------------
// §6 立ち位置

interface PositionItem {
  positionKey: PositionKey;
  label: string;
  descriptionLines: string[];
}

/** 「60 以上」「50 以上 60 未満」「30 未満」→ 下限（なければ null） */
function parseDeviationRange(cell: string, where: string): number | null {
  const m = /^(?:(\d+) 以上)?(?: ?(\d+) 未満)?$/.exec(cell);
  if (!m || (m[1] === undefined && m[2] === undefined))
    fail(`${where}: 偏差値の書式が想定外です: ${cell}`);
  return m[1] === undefined ? null : Number(m[1]);
}

function parsePositions(section: readonly string[]): PositionItem[] {
  const where = "付録C §6";
  const [header, ...rows] = tableRows(section);
  if (header?.join("|") !== "偏差値|立ち位置|説明文") fail(`${where} の表の見出しが想定外です`);
  const items = new Map<PositionKey, PositionItem>();
  for (const cells of rows) {
    if (cells.length !== 3) fail(`${where} の列数が 3 ではありません`);
    const [range, label, description] = cells as [string, string, string];
    const key = lookup(POSITION_BY_LABEL, label, where);
    // 閾値は 03 の POSITION_RULES が正（06 X-06）。付録C の記載と食い違えば失敗させる
    const rule = POSITION_RULES.find((r) => r.key === key);
    if (!rule || rule.minDeviation !== parseDeviationRange(range, where)) {
      fail(`${where}: ${label} の偏差値（${range}）が 03 POSITION_RULES と一致しません`);
    }
    // 改行タグは表内の改行の記法として区切りにだけ使い、生成物に残さない（08 D08-12）
    const descriptionLines = description.split(/<br\s*\/?>/).map((s) => s.trim());
    if (descriptionLines.some((s) => s === "" || /<[^>]+>/.test(s))) {
      fail(`${where}: ${label} の説明文に空行またはタグが残っています`);
    }
    if (descriptionLines.length < 3) fail(`${where}: ${label} の説明文が 3 行未満です`);
    if (items.has(key)) fail(`${where}: ${label} が重複しています`);
    items.set(key, { positionKey: key, label, descriptionLines });
  }
  const keys = POSITION_RULES.map((r) => r.key);
  requireAll(keys, new Set(items.keys()), where);
  return keys.map((k) => items.get(k)!);
}

// ---------------------------------------------------------------------------
// §8 組織内分類

const EMOTION_AXIS = new Map([
  ["感情を抑える", "suppress"],
  ["感情を表す", "express"],
] as const);
const ASSERTION_AXIS = new Map([
  ["意見を聞く", "listen"],
  ["意見を主張する", "assert"],
] as const);

interface ClassificationItem {
  socialStyleKey: SocialStyleKey;
  labelJa: string;
  axisPosition: { emotion: "suppress" | "express"; assertion: "listen" | "assert" };
  characterOrder: AptitudeTypeKey[];
  characterNamesHiragana: string[];
  description: string;
  emptyMessage: string;
}

interface ClassificationFile {
  axes: {
    emotion: { suppress: string; express: string };
    assertion: { listen: string; assert: string };
  };
  items: ClassificationItem[];
}

function allCodeBlocks(lines: readonly string[]): string[] {
  const out: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (current) {
        out.push(current.join("\n"));
        current = null;
      } else {
        current = [];
      }
    } else if (current) {
      current.push(line);
    }
  }
  if (current) fail("付録C §8: コードブロックが閉じていません");
  return out;
}

function parseClassifications(section: readonly string[]): ClassificationFile {
  const where = "付録C §8";
  const text = section.join("\n");
  const axesMatch = /縦軸「(.+?)／(.+?)」、横軸「(.+?)／(.+?)」/.exec(text);
  if (!axesMatch) fail(`${where}: 縦軸・横軸の記載が見つかりません`);
  const axes = {
    emotion: { suppress: axesMatch[1]!, express: axesMatch[2]! },
    assertion: { listen: axesMatch[3]!, assert: axesMatch[4]! },
  };
  const emptyMatch = /該当者がいない場合は「(.+?)」と表示/.exec(text);
  if (!emptyMatch) fail(`${where}: 該当者 0 名の文言が見つかりません`);
  const emptyMessage = emptyMatch[1]!;

  const descriptionStart = section.findIndex((l) => l.startsWith("分類の説明文"));
  if (descriptionStart < 0) fail(`${where}: 「分類の説明文」がありません`);
  const [header, ...rows] = tableRows(section.slice(0, descriptionStart));
  if (header?.join("|") !== "分類|日本語名|位置|キャラクター（適性タイプ）") {
    fail(`${where} の表の見出しが想定外です: ${header?.join(" | ")}`);
  }

  const descriptions = new Map<SocialStyleKey, string>();
  for (const block of allCodeBlocks(section.slice(descriptionStart))) {
    const en = /^([A-Za-z]+)タイプ/.exec(block)?.[1];
    if (!en) fail(`${where}: 説明文が「{英名}タイプ」で始まっていません`);
    const key = lookup(STYLE_BY_EN, en, where);
    if (descriptions.has(key)) fail(`${where}: ${en} の説明文が重複しています`);
    descriptions.set(key, block);
  }

  const items = new Map<SocialStyleKey, ClassificationItem>();
  const seenTypes = new Set<AptitudeTypeKey>();
  for (const cells of rows) {
    if (cells.length !== 4) fail(`${where} の列数が 4 ではありません`);
    const [en, labelJa, position, characters] = cells as [string, string, string, string];
    const key = lookup(STYLE_BY_EN, en, where);
    if (STYLE_LABEL.get(key)!.labelJa !== labelJa)
      fail(`${where}: ${en} の日本語名が 00 §1.7 と異なります`);
    const [emotionText, assertionText] = position.split(" × ");
    const emotion = lookup(EMOTION_AXIS, emotionText ?? "", where);
    const assertion = lookup(ASSERTION_AXIS, assertionText ?? "", where);
    const characterOrder: AptitudeTypeKey[] = [];
    const characterNamesHiragana: string[] = [];
    for (const entry of characters.split("、")) {
      const m = /^(.+)（(.+)）$/.exec(entry.trim());
      if (!m) fail(`${where}: キャラクターの書式が想定外です: ${entry}`);
      const type = lookup(TYPE_BY_SHORT_LABEL, m[2]!, where);
      const def = TYPE_LABEL.get(type)!;
      if (def.characterNameHiragana !== m[1])
        fail(`${where}: ${entry} のひらがな名が 00 §1.6 と異なります`);
      if (def.socialStyle !== key)
        fail(`${where}: ${entry} の所属分類が付録B と異なります（${en}）`);
      if (seenTypes.has(type)) fail(`${where}: ${entry} が複数の分類にあります`);
      seenTypes.add(type);
      characterOrder.push(type);
      characterNamesHiragana.push(m[1]!);
    }
    const description = descriptions.get(key);
    if (!description) fail(`${where}: ${en} の説明文がありません`);
    items.set(key, {
      socialStyleKey: key,
      labelJa,
      axisPosition: { emotion, assertion },
      characterOrder,
      characterNamesHiragana,
      description,
      emptyMessage,
    });
  }
  requireAll(SOCIAL_STYLE_KEYS, new Set(items.keys()), where);
  requireAll(APTITUDE_TYPE_KEYS, seenTypes, `${where} のキャラクター`);
  return { axes, items: SOCIAL_STYLE_KEYS.map((k) => items.get(k)!) };
}

// ---------------------------------------------------------------------------
// 組み立て

export interface GeneratedTexts {
  typeTexts: TypeTextsItem[];
  traitDetails: ReturnType<typeof parseTraitDetails>;
  traitHighlights: TraitHighlightItem[];
  developmentGuides: DevelopmentGuideItem[];
  styleTexts: StyleTextsItem[];
  styleInteractions: StyleInteractionItem[];
  positions: PositionItem[];
  classifications: ClassificationFile;
}

function build(appendixC: string): GeneratedTexts {
  const sections = splitSections(appendixC, "##");
  const section5 = sectionByPrefix(sections, "5. ");
  return {
    typeTexts: parseTypeTexts(sectionByPrefix(sections, "1. ")),
    traitDetails: parseTraitDetails(sectionByPrefix(sections, "2. ")),
    traitHighlights: parseTraitHighlights(sectionByPrefix(sections, "3. ")),
    developmentGuides: parseDevelopmentGuides(sectionByPrefix(sections, "4. ")),
    styleTexts: parseStyleTexts(section5),
    styleInteractions: parseStyleInteractions(section5),
    positions: parsePositions(sectionByPrefix(sections, "6. ")),
    classifications: parseClassifications(sectionByPrefix(sections, "8. ")),
  };
}

const SOURCES = [SRC_C, SRC_LABELS];

function render(kind: string, body: Record<string, unknown>): string {
  return formatJson({
    generatedFrom: SOURCES,
    sourceHash: sourceHashes(SOURCES),
    generatorVersion: GENERATOR_VERSION,
    kind,
    ...body,
  });
}

function files(g: GeneratedTexts) {
  const out: Array<[string, string, Record<string, unknown>]> = [
    ["type-texts.json", "type_texts", { items: g.typeTexts }],
    [
      "trait-details.json",
      "trait_details",
      { categories: g.traitDetails.categories, items: g.traitDetails.sentences },
    ],
    ["trait-highlights.json", "trait_highlights", { items: g.traitHighlights }],
    ["development-guides.json", "development_guides", { items: g.developmentGuides }],
    ["style-texts.json", "style_texts", { items: g.styleTexts }],
    ["style-interactions.json", "style_interactions", { items: g.styleInteractions }],
    ["positions.json", "positions", { items: g.positions }],
    [
      "classifications.json",
      "classifications",
      { axes: g.classifications.axes, items: g.classifications.items },
    ],
  ];
  return out.map(([fileName, kind, body]) => ({
    fileName,
    sources: SOURCES,
    content: render(kind, body),
  }));
}

function main(): void {
  const check = process.argv.includes("--check");
  const rendered = files(build(readSource(SRC_C)));
  const count = writeOrCheck(rendered, OUT_DIR, { check, generateCommand: "pnpm texts:generate" });
  console.log(
    check
      ? `文言マスタの生成物は付録C と一致しています（${count} ファイル）。`
      : `${count} ファイルを ${OUT_DIR}/ に生成しました。`,
  );
}

/** テストから解析・検査だけを呼べるように公開する（ファイルは書かない） */
export { build, GenerationError };

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  try {
    main();
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error(`文言マスタの生成に失敗しました: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
