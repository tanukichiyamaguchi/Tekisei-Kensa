// Route Handler を Request を組み立てて直接呼ぶ（08 §3.3.1）
// params の型は Route Handler ごとに異なる（{ sessionId: string } など）ため never で受ける
type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response>;

export interface CallInit {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly contentType?: string;
  readonly cookieHeader?: string;
  readonly params?: Record<string, string>;
  readonly headers?: Record<string, string>;
}

export async function callRoute(handler: Handler, init: CallInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookieHeader) headers.set("cookie", init.cookieHeader);
  let body: string | undefined;
  if (init.rawBody !== undefined) body = init.rawBody;
  else if (init.body !== undefined) body = JSON.stringify(init.body);
  if (body !== undefined) headers.set("content-type", init.contentType ?? "application/json");
  const request = new Request(new URL(init.url, "http://localhost:3000"), {
    method: init.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
  return handler(request, { params: Promise.resolve(init.params ?? {}) as Promise<never> });
}

/** Set-Cookie から name=value を取り出して Cookie ヘッダー形式にする */
export function cookieHeaderFrom(res: Response, name: string): string | null {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    if (pair?.startsWith(`${name}=`)) return pair;
  }
  return null;
}

/** エラー応答（04 §2.4 の { error: { code } }）の code を返す */
export async function errorCode(res: Response): Promise<string | null> {
  const body = (await res.clone().json()) as { error?: { code?: string } };
  return body.error?.code ?? null;
}

/** JWT（ID トークン・セッション Cookie）のペイロードを署名検証なしで読む（テストの観察用） */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  if (!payload) throw new Error("JWT の形式ではありません");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

export function setCookieLine(res: Response, name: string): string | null {
  return res.headers.getSetCookie().find((line) => line.startsWith(`${name}=`)) ?? null;
}
