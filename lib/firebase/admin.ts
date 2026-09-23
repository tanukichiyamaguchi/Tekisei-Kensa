// サーバ専用。Firebase Admin SDK の単一インスタンス（01 §5.5）。
// app/・components/ からの import は ESLint（01 §3.5 第 2 群）で禁止する。
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { firebaseAdminEnv, parseServiceAccount } from "@/lib/utils/env";

function getApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const env = firebaseAdminEnv();
  if (env.FIRESTORE_EMULATOR_HOST) {
    // Emulator: 認証情報は不要。FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST を SDK が自動認識する（00 D-33）
    return initializeApp({ projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }
  // firebaseAdminEnv() が Emulator 以外では鍵の存在と project_id の一致を保証している
  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "");
  return initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
    projectId: sa.project_id,
  });
}

/** Firestore。lib/db/ からのみ呼ぶ */
export function adminFirestore(): Firestore {
  return getFirestore(getApp());
}

/** Firebase Auth（Admin）。lib/auth/ と scripts/ からのみ呼ぶ */
export function adminAuth(): Auth {
  return getAuth(getApp());
}
