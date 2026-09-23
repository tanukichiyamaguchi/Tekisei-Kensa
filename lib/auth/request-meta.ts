// リクエスト付帯情報（04 §2.5.1 の RequestMeta。監査ログ・ログ用）
import { randomUUID } from "node:crypto";

import type { RequestMeta as BaseRequestMeta } from "./claims";

export interface RequestMeta extends BaseRequestMeta {
  readonly requestId: string; // サーバが採番する（クライアントの X-Request-Id は使わない）
}

/** x-forwarded-for の先頭を IP とし、User-Agent は 500 文字で切り詰める（04 §2.10） */
export function metaFromHeaders(headers: Headers): RequestMeta {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded ? (forwarded.split(",")[0]?.trim() ?? "") : "";
  const ua = headers.get("user-agent");
  return {
    requestId: randomUUID(),
    ipAddress: ip.length > 0 ? ip.slice(0, 45) : null,
    userAgent: ua ? ua.slice(0, 500) : null,
  };
}

/** Cookie ヘッダーから 1 つの値を取り出す（Route Handler 用） */
export function readCookie(headers: Headers, name: string): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return value.length > 0 ? decodeURIComponent(value) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
