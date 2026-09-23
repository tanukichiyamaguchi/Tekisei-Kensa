// Admin SDK（Emulator）で文書を読む・数える・例外的に直接書く（08 §3.3.2）
import type { WhereFilterOp } from "firebase-admin/firestore";

import { adminFirestore } from "@/lib/firebase/admin";

export async function getDocForTest<T = Record<string, unknown>>(
  collection: string,
  id: string,
): Promise<T | null> {
  const snap = await adminFirestore().collection(collection).doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}

export async function countDocs(
  collection: string,
  where: ReadonlyArray<readonly [string, WhereFilterOp, unknown]> = [],
): Promise<number> {
  let q: FirebaseFirestore.Query = adminFirestore().collection(collection);
  for (const [f, op, v] of where) q = q.where(f, op, v);
  return (await q.count().get()).data().count;
}

/** 例外的な直接書き込み（テスト名に例外であることを明記して使う） */
export async function writeDocForTest(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await adminFirestore().collection(collection).doc(id).set(data, { merge: true });
}

export async function listDocs(
  collection: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snap = await adminFirestore().collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}
