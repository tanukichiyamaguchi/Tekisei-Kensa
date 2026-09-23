// 受検者のセッショントークン（02 §9.10、04 §2.5.2）。平文は HttpOnly Cookie にだけ存在する
import { newRandomToken, sha256Hex } from "./random-token";

export const RESPONDENT_COOKIE_NAME = "tk_session";
export const RESPONDENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 日（00 D-32、10 K-04）

export interface IssuedRespondentToken {
  readonly token: string; // base64url 43 文字
  readonly tokenHash: string; // sha256 hex 64 文字
  readonly expiresAt: Date;
}

export function issueRespondentToken(now: Date): IssuedRespondentToken {
  const token = newRandomToken();
  return { token, tokenHash: hashRespondentToken(token), expiresAt: extendRespondentToken(now) };
}

export function hashRespondentToken(token: string): string {
  return sha256Hex(token);
}

/** now + 7 日（開始・回答保存のたびに延長する。D02-13） */
export function extendRespondentToken(now: Date): Date {
  return new Date(now.getTime() + RESPONDENT_TOKEN_TTL_MS);
}

/** Set-Cookie の属性（01 §5.8）。ローカル（http）のみ Secure を外す */
export function respondentCookieOptions(expiresAt: Date, isLocal: boolean) {
  return {
    name: RESPONDENT_COOKIE_NAME,
    httpOnly: true,
    secure: !isLocal,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
