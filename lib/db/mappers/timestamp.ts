// Timestamp ↔ Date（02 §5.5）。フィールド欠落（undefined）はデータ不整合として例外にする
import { Timestamp } from "firebase-admin/firestore";

export class MappingError extends Error {
  override readonly name = "MappingError";
}

export function toDate(ts: unknown, field: string): Date {
  if (!(ts instanceof Timestamp)) throw new MappingError(`${field} が Timestamp ではありません`);
  return ts.toDate();
}

export function toNullableDate(ts: unknown, field: string): Date | null {
  if (ts === null) return null;
  return toDate(ts, field);
}

/** アプリが計算する期限（tokenExpiresAt など）にだけ使う。createdAt / updatedAt は serverTimestamp() を書く */
export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}
