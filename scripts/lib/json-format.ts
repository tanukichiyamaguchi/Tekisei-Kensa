// 生成物の JSON を決定的に整形する（08 §7.6: 再生成結果とコミット済みの生成物をバイト比較するため）。
// プリミティブだけから成る短いオブジェクト・配列は 1 行にまとめ、差分を読みやすくする。

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MAX_INLINE_WIDTH = 100;

function isPrimitive(value: Json): value is null | boolean | number | string {
  return value === null || typeof value !== "object";
}

function inline(value: Json): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
  return `{ ${entries.join(", ")} }`;
}

function format(value: Json, indent: string): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  if (children.every(isPrimitive)) {
    const oneLine = inline(value);
    if (indent.length + oneLine.length <= MAX_INLINE_WIDTH) return oneLine;
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => inner + format(v, inner)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const body = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`);
  return `{\n${body.join(",\n")}\n${indent}}`;
}

export function formatJson(value: unknown): string {
  return `${format(JSON.parse(JSON.stringify(value)) as Json, "")}\n`;
}
