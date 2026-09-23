// 管理者のセッション Cookie（02 §9.11、04 §2.5.1・§6）。発行・検証・失効
import type { DecodedIdToken } from "firebase-admin/auth";

import { adminAuth } from "@/lib/firebase/admin";
import { API_ERRORS } from "@/lib/services/errors";
import { firebaseErrorCode } from "@/lib/services/firebase-errors";
import { serverEnv } from "@/lib/utils/env";

/** 7 日・延長なし（04 D04-53。Firebase の許容範囲は 5 分〜14 日） */
export const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** ID トークンの auth_time の許容範囲（古い ID トークンの再利用防止。04 §6.1） */
export const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

export function sessionCookieName(): string {
  return serverEnv().SESSION_COOKIE_NAME;
}

/** Firebase Auth の「入力が不正・期限切れ・失効・無効化」を表すエラーか（それ以外の障害は呼び出し元へ投げ直す） */
function isCredentialError(error: unknown): boolean {
  // ペイロードが JSON として壊れた JWT は Admin SDK の decode で SyntaxError になる（Firebase のエラーに包まれない）
  if (error instanceof SyntaxError) return true;
  const code = firebaseErrorCode(error);
  return (
    code !== null &&
    code.startsWith("auth/") &&
    code !== "auth/internal-error" &&
    code !== "auth/too-many-requests" &&
    code !== "auth/insufficient-permission"
  );
}

/** ID トークンを検証し、auth_time が直近 5 分以内であることを確認する（失敗は 401 ID_TOKEN_INVALID） */
export async function verifyRecentIdToken(
  idToken: string,
  now: Date = new Date(),
): Promise<DecodedIdToken> {
  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch (error) {
    if (isCredentialError(error)) throw API_ERRORS.idTokenInvalid();
    throw error;
  }
  // auth_time は Unix 秒（09 §6.4 の 23）
  if (
    typeof decoded.auth_time !== "number" ||
    now.getTime() - decoded.auth_time * 1000 > RECENT_SIGN_IN_MS
  ) {
    throw API_ERRORS.idTokenInvalid();
  }
  return decoded;
}

/** verifyIdToken(idToken, true) と auth_time の確認 → createSessionCookie。クレームは検査しない（D04-54） */
export async function createAdminSessionCookie(
  idToken: string,
  now: Date = new Date(),
): Promise<{ readonly cookie: string; readonly expiresAt: Date; readonly uid: string }> {
  const decoded = await verifyRecentIdToken(idToken, now);
  let cookie: string;
  try {
    cookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
  } catch (error) {
    if (isCredentialError(error)) throw API_ERRORS.idTokenInvalid();
    throw error;
  }
  return {
    cookie,
    expiresAt: new Date(now.getTime() + SESSION_COOKIE_MAX_AGE_MS),
    uid: decoded.uid,
  };
}

/** verifySessionCookie(cookie, true)（失効チェックあり）。失効・無効・期限切れ・無効化ユーザーは null */
export async function verifyAdminSessionCookie(cookie: string): Promise<DecodedIdToken | null> {
  try {
    return await adminAuth().verifySessionCookie(cookie, true);
  } catch (error) {
    if (isCredentialError(error)) return null;
    throw error;
  }
}

/** ログアウト用。失効チェックなしで uid を得る（期限切れ・不正なら null。04 §6.2） */
export async function peekSessionCookieUid(cookie: string): Promise<string | null> {
  try {
    return (await adminAuth().verifySessionCookie(cookie, false)).uid;
  } catch (error) {
    if (isCredentialError(error)) return null;
    throw error;
  }
}

/** revokeRefreshTokens(uid)。以後、この uid の既存セッション Cookie は verifyAdminSessionCookie で null になる */
export async function revokeAdminSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}

/** Set-Cookie の属性（04 §2.5.1）。HttpOnly、Secure（ローカルのみ外す）、SameSite=Lax、Path=/ */
export function sessionCookieOptions(expiresAt: Date, isLocal: boolean) {
  return {
    name: sessionCookieName(),
    httpOnly: true as const,
    secure: !isLocal,
    sameSite: "lax" as const,
    path: "/" as const,
    expires: expiresAt,
  };
}
