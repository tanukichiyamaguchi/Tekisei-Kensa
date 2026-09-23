// 文言マスタの生成 JSON（lib/masters/data/texts/*.json）の読み込み時検証（06 §4.1）。
// 形とキー集合だけを確かめて型を絞り込む。本文の内容は生成時（scripts/generate-texts.ts）と単体テスト X-01〜X-07 が検査する
import { MasterValidationError } from "../validate";

export type Obj = Readonly<Record<string, unknown>>;

export function fail(where: string, message: string): never {
  throw new MasterValidationError(`文言マスタ ${where}: ${message}`);
}

export function asObject(value: unknown, where: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "オブジェクトではありません");
  }
  return value as Obj;
}

export function asArray(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(where, "配列ではありません");
  return value;
}

export function asString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(where, "空でない文字列ではありません");
  return value;
}

export function asNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(where, "整数ではありません");
  return value;
}

export function asKey<K extends string>(value: unknown, keys: readonly K[], where: string): K {
  if (typeof value !== "string" || !(keys as readonly string[]).includes(value)) {
    fail(where, `想定外の識別子です: ${String(value)}`);
  }
  return value as K;
}

/** 生成物の items 配列（kind も確認する） */
export function itemsOf(raw: unknown, kind: string): readonly Obj[] {
  const file = asObject(raw, kind);
  if (file.kind !== kind) fail(kind, `kind が ${String(file.kind)} です`);
  return asArray(file.items, `${kind}.items`).map((item, i) => asObject(item, `${kind}[${i}]`));
}

/** 全キーをちょうど 1 回ずつ持つ Record にする（X-01） */
export function toRecord<K extends string, V>(
  entries: ReadonlyArray<readonly [K, V]>,
  keys: readonly K[],
  where: string,
): Readonly<Record<K, V>> {
  const out = {} as Record<K, V>;
  for (const [key, value] of entries) {
    if (key in out) fail(where, `${key} が重複しています`);
    out[key] = value;
  }
  const missing = keys.filter((k) => !(k in out));
  if (missing.length > 0) fail(where, `不足しています: ${missing.join(", ")}`);
  return Object.freeze(out);
}

/** 集合の要素がちょうど 1 つであることを確かめて返す */
export function single<T>(values: Iterable<T>, where: string): T {
  const unique = [...new Set(values)];
  if (unique.length !== 1) fail(where, `値が 1 つではありません（${unique.length} 件）`);
  return unique[0] as T;
}
