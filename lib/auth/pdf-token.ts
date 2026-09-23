// PDF 印刷トークン（04 §7.2、D04-39・D04-40）。HMAC-SHA256 署名付きの短命トークン（Firestore に保存しない）
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ADMIN_ROLES } from "@/lib/db/types";
import type { AdminRole } from "@/lib/db/types";
import { API_ERRORS } from "@/lib/services/errors";
import type { ComparisonScope } from "@/lib/scoring/types";
import { serverEnv } from "@/lib/utils/env";

export const PDF_TOKEN_TTL_SECONDS = 120;

export interface PdfTokenPayload {
  readonly resultId: string;
  readonly organizationId: string;
  readonly adminUid: string;
  readonly role: AdminRole;
  readonly mode: "full" | "restricted";
  readonly scope: ComparisonScope | null;
  readonly exp: number; // Unix 秒
}

const docId = z.string().regex(/^[A-Za-z0-9]{1,128}$/);
const payloadSchema = z.strictObject({
  resultId: docId,
  organizationId: docId,
  adminUid: docId,
  role: z.enum(ADMIN_ROLES),
  mode: z.enum(["full", "restricted"]),
  scope: z
    .union([
      z.strictObject({ kind: z.literal("organization") }),
      z.strictObject({ kind: z.literal("team"), teamCode: z.string().regex(/^[A-Z]$/) }),
    ])
    .nullable(),
  exp: z.number().int(),
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64url");
}

/** base64url(json).base64url(hmac) */
export function issuePdfToken(
  payload: Omit<PdfTokenPayload, "exp">,
  now: Date,
  secret: string = serverEnv().PDF_TOKEN_SECRET,
): string {
  const full: PdfTokenPayload = {
    ...payload,
    exp: Math.floor(now.getTime() / 1000) + PDF_TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** 署名不一致・期限切れ・ペイロード不正はすべて 404 NOT_FOUND（トークンの有無で結果の存在を推測させない） */
export function verifyPdfToken(
  token: string,
  now: Date,
  secret: string = serverEnv().PDF_TOKEN_SECRET,
): PdfTokenPayload {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) throw API_ERRORS.notFound();
  const expected = Buffer.from(sign(body, secret), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw API_ERRORS.notFound();
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw API_ERRORS.notFound();
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) throw API_ERRORS.notFound();
  if (parsed.data.exp <= Math.floor(now.getTime() / 1000)) throw API_ERRORS.notFound();
  return parsed.data as PdfTokenPayload;
}
