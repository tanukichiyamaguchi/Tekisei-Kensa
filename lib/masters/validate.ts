// 生成 JSON（lib/masters/data/*.json）の読み込み時検証（03 §4.5、D3-03）。
// モジュール初期化時に 1 回だけ呼ばれ、形・キー集合・並び順を検証して型を絞り込む。
// 失敗は起動時エラーとし、不正なマスタで採点が走らないようにする。
import { SCORED_QUESTION_COUNT } from "./question-layout";
import type {
  AptitudeDefinition,
  AptitudeTypeDefinition,
  ChoiceScoreTable,
  CompatibilityDefinition,
  IndicatorDefinition,
  IndicatorTerm,
  QuestionDefinition,
  RiskDefinition,
  SocialStyleDefinition,
  TraitDefinition,
} from "./types";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SCORE_ATTRIBUTE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "@/lib/scoring/types";
import type { ChoiceCode, ChoiceScoreAttributes, ScoreAttributeKey } from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

export class MasterValidationError extends Error {
  override readonly name = "MasterValidationError";
}

type Obj = Readonly<Record<string, unknown>>;

function fail(where: string, message: string): never {
  throw new MasterValidationError(`マスタ ${where}: ${message}`);
}

function asObject(value: unknown, where: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "オブジェクトではありません");
  }
  return value as Obj;
}

function asArray(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(where, "配列ではありません");
  return value;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string" || value === "") fail(where, "空でない文字列ではありません");
  return value;
}

function asNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, "有限の数値ではありません");
  return value;
}

function asBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") fail(where, "真偽値ではありません");
  return value;
}

function asOneOf<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  where: string,
): T {
  if (!(allowed as readonly unknown[]).includes(value)) {
    fail(where, `${JSON.stringify(value)} は許可された値（${allowed.join(", ")}）ではありません`);
  }
  return value as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 共通メタデータ（08 §7.2）を検証して items を返す */
function itemsOf(raw: unknown, kind: string): readonly unknown[] {
  const where = `(${kind})`;
  const root = asObject(raw, where);
  if (root.kind !== kind) fail(where, `kind が ${JSON.stringify(root.kind)} です`);
  if (root.scoringVersion !== SCORING_VERSION) {
    fail(
      where,
      `scoringVersion ${JSON.stringify(root.scoringVersion)} が ${SCORING_VERSION} と一致しません。pnpm masters:generate で再生成してください`,
    );
  }
  asString(root.generatorVersion, `${where}.generatorVersion`);
  return asArray(root.items, `${where}.items`);
}

/** items のキーが KEYS と同じ並びで揃っていることを確認する */
function checkKeyOrder(items: readonly Obj[], keys: readonly string[], kind: string): void {
  const actual = items.map((i) => i.key);
  if (actual.length !== keys.length || actual.some((k, i) => k !== keys[i])) {
    fail(`(${kind})`, `キーの並びが定義順（${keys.join(", ")}）と一致しません`);
  }
}

function parseTerm(raw: unknown, where: string): IndicatorTerm {
  const o = asObject(raw, where);
  const questionNo = asNumber(o.questionNo, `${where}.questionNo`);
  if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > SCORED_QUESTION_COUNT) {
    fail(where, `questionNo ${questionNo} は 1〜${SCORED_QUESTION_COUNT} の整数ではありません`);
  }
  return {
    questionNo,
    attribute: asOneOf<ScoreAttributeKey>(o.attribute, SCORE_ATTRIBUTE_KEYS, `${where}.attribute`),
    sign: asOneOf<1 | -1>(o.sign, [1, -1], `${where}.sign`),
  };
}

function parseIndicator<K extends string>(
  o: Obj,
  keys: readonly K[],
  where: string,
): IndicatorDefinition<K> {
  const terms = asArray(o.terms, `${where}.terms`).map((t, i) =>
    parseTerm(t, `${where}.terms[${i}]`),
  );
  if (terms.length === 0) fail(where, "項がありません");
  return {
    key: asOneOf<K>(o.key, keys, `${where}.key`),
    terms,
    constant: asNumber(o.constant, `${where}.constant`),
    multiplier: asNumber(o.multiplier, `${where}.multiplier`),
    clampMin: o.clampMin === null ? null : asNumber(o.clampMin, `${where}.clampMin`),
  };
}

function parseIndicatorList<K extends string, D>(
  raw: unknown,
  kind: string,
  keys: readonly K[],
  extra: (o: Obj, where: string) => Omit<D, keyof IndicatorDefinition<K>>,
): readonly D[] {
  const items = itemsOf(raw, kind).map((v, i) => asObject(v, `(${kind}).items[${i}]`));
  checkKeyOrder(items, keys, kind);
  return deepFreeze(
    items.map((o, i) => {
      const where = `(${kind}).items[${i}]`;
      return { ...parseIndicator(o, keys, where), ...extra(o, where) } as D;
    }),
  );
}

export function parseChoiceScoreTable(raw: unknown): ChoiceScoreTable {
  const items = itemsOf(raw, "choice_score").map((v, i) =>
    asObject(v, `(choice_score).items[${i}]`),
  );
  if (items.length !== 5) fail("(choice_score)", "選択肢が 5 件ではありません");
  const table = {} as Record<ChoiceCode, ChoiceScoreAttributes>;
  items.forEach((o, i) => {
    const where = `(choice_score).items[${i}]`;
    const expectedCode = (i + 1) as ChoiceCode;
    const code = asOneOf<ChoiceCode>(o.choiceCode, [expectedCode], `${where}.choiceCode`);
    const attrs = {} as Record<ScoreAttributeKey, number>;
    for (const key of SCORE_ATTRIBUTE_KEYS) attrs[key] = asNumber(o[key], `${where}.${key}`);
    table[code] = attrs;
  });
  return deepFreeze(table);
}

export function parseQuestionDefinitions(raw: unknown): readonly QuestionDefinition[] {
  const items = itemsOf(raw, "question");
  return deepFreeze(
    items.map((v, i): QuestionDefinition => {
      const where = `(question).items[${i}]`;
      const o = asObject(v, where);
      const questionNo = asNumber(o.questionNo, `${where}.questionNo`);
      if (questionNo !== i + 1) fail(where, `questionNo ${questionNo} が連番ではありません`);
      return {
        questionNo,
        text: asString(o.text, `${where}.text`),
        isActive: asBoolean(o.isActive, `${where}.isActive`),
        isScored: asBoolean(o.isScored, `${where}.isScored`),
        step: o.step === null ? null : asOneOf(o.step, [1, 2, 3, 4] as const, `${where}.step`),
        page: o.page === null ? null : asOneOf(o.page, [1, 2, 3, 4, 5] as const, `${where}.page`),
      };
    }),
  );
}

export function parseTraitDefinitions(raw: unknown): readonly TraitDefinition[] {
  return parseIndicatorList<(typeof TRAIT_KEYS)[number], TraitDefinition>(
    raw,
    "trait",
    TRAIT_KEYS,
    (o, w) => ({
      label: asString(o.label, `${w}.label`),
      sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
    }),
  );
}

export function parseCompatibilityDefinitions(raw: unknown): readonly CompatibilityDefinition[] {
  return parseIndicatorList<(typeof COMPATIBILITY_KEYS)[number], CompatibilityDefinition>(
    raw,
    "compatibility",
    COMPATIBILITY_KEYS,
    (o, w) => ({
      label: asString(o.label, `${w}.label`),
      lowLabel: asString(o.lowLabel, `${w}.lowLabel`),
      highLabel: asString(o.highLabel, `${w}.highLabel`),
      sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
    }),
  );
}

export function parseAptitudeDefinitions(raw: unknown): readonly AptitudeDefinition[] {
  return parseIndicatorList<(typeof APTITUDE_KEYS)[number], AptitudeDefinition>(
    raw,
    "aptitude",
    APTITUDE_KEYS,
    (o, w) => ({
      internalName: asString(o.internalName, `${w}.internalName`),
      label: asString(o.label, `${w}.label`),
      sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
    }),
  );
}

export function parseRiskDefinitions(raw: unknown): readonly RiskDefinition[] {
  return parseIndicatorList<(typeof RISK_KEYS)[number], RiskDefinition>(
    raw,
    "risk",
    RISK_KEYS,
    (o, w) => ({
      label: asString(o.label, `${w}.label`),
      shortLabel: asString(o.shortLabel, `${w}.shortLabel`),
      aiLabel: asString(o.aiLabel, `${w}.aiLabel`),
      sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
    }),
  );
}

export function parseAptitudeTypeDefinitions(raw: unknown): readonly AptitudeTypeDefinition[] {
  return parseIndicatorList<(typeof APTITUDE_TYPE_KEYS)[number], AptitudeTypeDefinition>(
    raw,
    "aptitude_type",
    APTITUDE_TYPE_KEYS,
    (o, w) => ({
      label: asString(o.label, `${w}.label`),
      shortLabel: asString(o.shortLabel, `${w}.shortLabel`),
      socialStyle: asOneOf(o.socialStyle, SOCIAL_STYLE_KEYS, `${w}.socialStyle`),
      characterName: asString(o.characterName, `${w}.characterName`),
      characterNameHiragana: asString(o.characterNameHiragana, `${w}.characterNameHiragana`),
      sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
    }),
  );
}

export function parseSocialStyleDefinitions(raw: unknown): readonly SocialStyleDefinition[] {
  const items = itemsOf(raw, "social_style").map((v, i) =>
    asObject(v, `(social_style).items[${i}]`),
  );
  checkKeyOrder(items, SOCIAL_STYLE_KEYS, "social_style");
  return deepFreeze(
    items.map((o, i): SocialStyleDefinition => {
      const w = `(social_style).items[${i}]`;
      return {
        key: asOneOf(o.key, SOCIAL_STYLE_KEYS, `${w}.key`),
        labelEn: asString(o.labelEn, `${w}.labelEn`),
        labelKatakana: asString(o.labelKatakana, `${w}.labelKatakana`),
        labelJa: asString(o.labelJa, `${w}.labelJa`),
        color: asString(o.color, `${w}.color`),
        sortOrder: asNumber(o.sortOrder, `${w}.sortOrder`),
        chartOrder: asNumber(o.chartOrder, `${w}.chartOrder`),
      };
    }),
  );
}
