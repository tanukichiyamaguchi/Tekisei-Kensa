// 管理者追加用リンクの招待トークン（02 §9.7）。平文はリンクにだけ現れ、ハッシュだけを保存する。有効期限は無い
import { newRandomToken, sha256Hex, TOKEN_PATTERN } from "./random-token";

export interface IssuedInviteToken {
  readonly token: string; // base64url 43 文字
  readonly tokenHash: string; // sha256 hex 64 文字
}

export function issueInviteToken(): IssuedInviteToken {
  const token = newRandomToken();
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return sha256Hex(token);
}

export function isInviteTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** 管理者追加用リンク `{baseUrl}/admin/signup?q={inviteToken}`（02 §9.7） */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/admin/signup?q=${encodeURIComponent(token)}`;
}
