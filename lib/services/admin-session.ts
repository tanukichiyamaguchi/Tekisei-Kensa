// ログイン・ログアウト（04 §6.1、§6.2）
import type { CreateSessionInput } from "./schemas/auth";
import {
  createAdminSessionCookie,
  peekSessionCookieUid,
  revokeAdminSessions,
} from "@/lib/auth/session-cookie";

/** ID トークン → セッション Cookie（7 日）。クレーム・adminUsers は検査しない（D04-54） */
export async function createAdminSession(
  input: CreateSessionInput,
  now: Date = new Date(),
): Promise<{ readonly cookie: string; readonly expiresAt: Date }> {
  const { cookie, expiresAt } = await createAdminSessionCookie(input.idToken, now);
  return { cookie, expiresAt };
}

/** Cookie があれば uid を得て revokeRefreshTokens（同じ利用者の他端末のセッションも失効する） */
export async function destroyAdminSession(cookie: string | null): Promise<void> {
  if (!cookie) return;
  const uid = await peekSessionCookieUid(cookie);
  if (uid) await revokeAdminSessions(uid);
}
