// ブラウザ専用の Firebase Auth 操作（06 §10.4）。firebase/auth を import してよいのはこのファイルと lib/firebase/client.ts だけ。
// ID トークンはこのファイルの外に出さない（再認証の reauthIdToken を除く）。Firebase のエラーコードは reason に丸め、画面に出さない
import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
  type Auth,
} from "firebase/auth";

import { clientAuth } from "@/lib/firebase/client";

export type AdminAuthErrorReason =
  | "invalid_credential"
  | "session_rejected"
  | "too_many_requests"
  | "invalid_code"
  | "weak_password"
  | "network";

export class AdminAuthError extends Error {
  override readonly name = "AdminAuthError";
  constructor(readonly reason: AdminAuthErrorReason) {
    super(reason);
  }
}

function firebaseCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function isNetworkError(error: unknown): boolean {
  return firebaseCode(error) === "auth/network-request-failed";
}

async function safeSignOut(auth: Auth): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // クライアント SDK の状態は inMemoryPersistence のため、失敗しても画面を閉じれば消える
  }
}

/**
 * signInWithEmailAndPassword → getIdToken → POST /auth/session → signOut の順に行い、セッション Cookie を発行させる
 * （06 §3.1、00 §4.2）。M-01 と M-03 が使う
 */
export async function establishSession(email: string, password: string): Promise<void> {
  const auth = await clientAuth();
  try {
    let idToken: string;
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      idToken = await credential.user.getIdToken();
    } catch (error) {
      throw new AdminAuthError(isNetworkError(error) ? "network" : "invalid_credential");
    }
    let res: Response;
    try {
      res = await fetch("/auth/session", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
    } catch {
      throw new AdminAuthError("network");
    }
    if (!res.ok) throw new AdminAuthError("session_rejected");
  } finally {
    await safeSignOut(auth);
  }
}

/**
 * 現在のパスワードによる再認証（04 D04-47 改）。戻り値の ID トークンは PATCH /api/v1/admin/me の reauthIdToken にだけ使う
 */
export async function reauthenticate(email: string, currentPassword: string): Promise<string> {
  const auth = await clientAuth();
  try {
    const credential = await signInWithEmailAndPassword(auth, email, currentPassword);
    return await credential.user.getIdToken();
  } catch (error) {
    const code = firebaseCode(error);
    if (code === "auth/too-many-requests") throw new AdminAuthError("too_many_requests");
    throw new AdminAuthError(isNetworkError(error) ? "network" : "invalid_credential");
  } finally {
    await safeSignOut(auth);
  }
}

/** sendPasswordResetEmail。存在しないアカウントでも成功扱い（存在の有無を区別しない。06 §3.3） */
export async function requestPasswordReset(email: string): Promise<void> {
  const auth = await clientAuth();
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (isNetworkError(error)) throw new AdminAuthError("network");
  }
}

/** verifyPasswordResetCode。戻り値はメールアドレス */
export async function verifyResetCode(oobCode: string): Promise<string> {
  const auth = await clientAuth();
  try {
    return await verifyPasswordResetCode(auth, oobCode);
  } catch (error) {
    throw new AdminAuthError(isNetworkError(error) ? "network" : "invalid_code");
  }
}

/** confirmPasswordReset */
export async function completePasswordReset(oobCode: string, newPassword: string): Promise<void> {
  const auth = await clientAuth();
  try {
    await confirmPasswordReset(auth, oobCode, newPassword);
  } catch (error) {
    if (firebaseCode(error) === "auth/weak-password") throw new AdminAuthError("weak_password");
    throw new AdminAuthError(isNetworkError(error) ? "network" : "invalid_code");
  }
}
