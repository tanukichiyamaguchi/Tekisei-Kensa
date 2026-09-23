// 32 バイトの乱数トークン（base64url 43 文字）と SHA-256 hex（02 §9.7、§9.10）
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** hex 文字列の定数時間比較（長さが違えば false） */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
