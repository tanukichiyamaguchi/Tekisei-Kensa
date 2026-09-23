// Route Handler の共通処理（04 §2.10）: requestId 採番・ログ・エラー変換を一元化する
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApiError } from "./errors";
import { translateFirebaseError } from "./firebase-errors";
import { metaFromHeaders, type RequestMeta } from "@/lib/auth/request-meta";
import { errorFields, logger } from "@/lib/utils/logger";

export function requestMeta(request: Request): RequestMeta {
  return metaFromHeaders(request.headers);
}

/** JSON 本文を読み、parse で検証する。Content-Type 不正は 415、構文エラーは 400 */
export async function readJson<T>(request: Request, parse: (input: unknown) => T): Promise<T> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type は application/json を指定してください",
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "リクエスト本文を JSON として読み取れません");
  }
  return parse(body);
}

export function json<T>(
  meta: RequestMeta,
  body: T,
  init: { readonly status?: number; readonly headers?: Readonly<Record<string, string>> } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", "X-Request-Id": meta.requestId, ...init.headers },
  });
}

/** 本文なしの応答（204 など） */
export function empty(meta: RequestMeta, status = 204): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": meta.requestId },
  });
}

/** zod の path を 04 §2.3 の表記（例 "answers[3].choiceCode"）にする */
export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === "number") return `${out}[${key}]`;
    const name = String(key);
    return out.length === 0 ? name : `${out}.${name}`;
  }, "");
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ZodError) {
    const issues = e.issues.map((i) => ({ path: formatIssuePath(i.path), message: i.message }));
    return new ApiError(422, "VALIDATION_ERROR", "入力内容に誤りがあります", { issues });
  }
  return translateFirebaseError(e);
}

export async function handle(
  request: Request,
  route: string,
  fn: (meta: RequestMeta) => Promise<Response>,
): Promise<Response> {
  const meta = requestMeta(request);
  const started = Date.now();
  try {
    const res = await fn(meta);
    logger.info("request.end", {
      requestId: meta.requestId,
      route,
      method: request.method,
      status: res.status,
      durationMs: Date.now() - started,
    });
    return res;
  } catch (e: unknown) {
    const err = toApiError(e);
    const fields = {
      requestId: meta.requestId,
      route,
      method: request.method,
      status: err.status,
      code: err.code,
      durationMs: Date.now() - started,
      ...(err === e ? {} : errorFields(e)),
    };
    if (err.status >= 500) logger.error("request.error", fields);
    else logger.info("request.error", fields);
    return json(
      meta,
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers: err.headers },
    );
  }
}
