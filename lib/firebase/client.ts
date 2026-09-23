"use client";
// ブラウザ専用。Firebase Auth クライアント SDK の初期化のみ（01 §5.5）。Firestore クライアントは初期化しない（00 §2.5）
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";

import { publicEnv } from "@/lib/utils/env";

let authPromise: Promise<Auth> | null = null;

/**
 * ログイン・パスワード再設定の Client Component からのみ呼ぶ。
 * 認証状態をブラウザに永続化しない（inMemoryPersistence。01 D01-41）。setPersistence の完了を待ってから返す
 */
export function clientAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const env = publicEnv();
    const app: FirebaseApp =
      getApps()[0] ??
      initializeApp({
        apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
    const auth = getAuth(app);
    if (env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
      connectAuthEmulator(auth, `http://${env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}`, {
        disableWarnings: true,
      });
    }
    await setPersistence(auth, inMemoryPersistence);
    return auth;
  })();
  return authPromise;
}
