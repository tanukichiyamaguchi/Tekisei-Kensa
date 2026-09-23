// POST /auth/session（ID トークン → セッション Cookie）、DELETE /auth/session（ログアウト）。04 §6.1、§6.2
import { readCookie } from "@/lib/auth/request-meta";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/session-cookie";
import { createAdminSession, destroyAdminSession } from "@/lib/services/admin-session";
import type { SessionCreatedDto } from "@/lib/services/dto/admin";
import { empty, handle, json, readJson } from "@/lib/services/http";
import { createSessionInputSchema } from "@/lib/services/schemas/auth";
import { isLocalHttp } from "@/lib/utils/env";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handle(request, "/auth/session", async (meta) => {
    const input = await readJson(request, (v) => createSessionInputSchema.parse(v));
    const { cookie, expiresAt } = await createAdminSession(input);
    const res = json<SessionCreatedDto>(meta, { expiresAt: expiresAt.toISOString() });
    const { name, ...options } = sessionCookieOptions(expiresAt, isLocalHttp());
    res.cookies.set(name, cookie, options);
    return res;
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request, "/auth/session", async (meta) => {
    await destroyAdminSession(readCookie(request.headers, sessionCookieName()));
    const res = empty(meta, 204);
    const { name, ...options } = sessionCookieOptions(new Date(0), isLocalHttp());
    res.cookies.set(name, "", { ...options, maxAge: 0 });
    return res;
  });
}
