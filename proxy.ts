// 管理者ページ・管理者 API の早期遮断（01 §5.5、04 §8.5）。Next.js 16 で middleware.ts は proxy.ts に改名された。
// セッション Cookie の「有無」だけを見る。Cookie の検証・認可は Route Handler / Server Component の requireAdmin が行う。
// firebase-admin は import しない（遮断は利便性のためであり、セキュリティ境界ではない）。
import { NextResponse, type NextRequest } from "next/server";

/** 未認証でも遮断しないパス（認証画面自身と、PDF 印刷トークンで認可する印刷用ページ） */
export const PUBLIC_ADMIN_PATHS: readonly RegExp[] = [
  /^\/admin\/login$/,
  /^\/admin\/signup$/,
  /^\/admin\/password-reset$/,
  /^\/admin\/results\/[^/]+\/print$/,
];

function sessionCookieName(): string {
  // proxy は lib/utils/env.ts（起動時検証）を使わず、Cookie 名の既定値だけを直接読む（01 §5.5 の例外）
  return process.env.SESSION_COOKIE_NAME || "admin_session";
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((re) => re.test(pathname))) return NextResponse.next();
  if (request.cookies.has(sessionCookieName())) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインが必要です", details: {} } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/api/v1/admin/:path*"] };
