// 受検者トークン Cookie（tk_session）の発行・再発行（04 §4.2〜§4.4、01 §5.8）
import type { NextResponse } from "next/server";

import { API_ERRORS } from "./errors";
import { readCookie } from "@/lib/auth/request-meta";
import { RESPONDENT_COOKIE_NAME, respondentCookieOptions } from "@/lib/auth/respondent-token";
import { isLocalHttp } from "@/lib/utils/env";

export function setRespondentCookie(
  res: NextResponse,
  token: string,
  expiresAt: Date,
): NextResponse {
  const { name, ...options } = respondentCookieOptions(expiresAt, isLocalHttp());
  res.cookies.set(name, token, options);
  return res;
}

/** リクエストの tk_session。開始・回答保存で同じトークンを延長後の期限で再発行するために読む */
export function respondentCookieToken(request: Request): string {
  const token = readCookie(request.headers, RESPONDENT_COOKIE_NAME);
  // requireRespondentSession を通った後なので通常は発生しない
  if (!token) throw API_ERRORS.respondentTokenInvalid();
  return token;
}
