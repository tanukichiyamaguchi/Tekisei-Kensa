// 受検者セッションコンテキスト（04 §2.5.2）
import type { RequestMeta } from "./request-meta";
import { metaFromHeaders, readCookie } from "./request-meta";
import { safeEqualHex } from "./random-token";
import { hashRespondentToken, RESPONDENT_COOKIE_NAME } from "./respondent-token";
import {
  getSession,
  getSessionByTokenHash,
} from "@/lib/db/repositories/assessment-sessions-repository";
import { getRespondentById } from "@/lib/db/repositories/respondents-repository";
import type { AssessmentSession } from "@/lib/db/domain";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { RespondentKind, SessionStatus } from "@/lib/db/types";
import { API_ERRORS } from "@/lib/services/errors";

export interface RespondentSessionContext {
  readonly sessionId: string;
  readonly organizationId: string;
  readonly respondentId: string;
  readonly kind: RespondentKind;
  readonly status: SessionStatus; // draft | submitted（draft 必須の判定は service が行う）
  readonly tokenExpiresAt: Date;
  readonly request: RequestMeta;
  /** 手順 3 で取得した文書。進行状態の取得（04 §4.3）が追加の読み取りをせずに使う */
  readonly session: AssessmentSession;
}

async function resolve(
  cookieToken: string | null,
  sessionId: string,
  request: RequestMeta,
  now: Date,
): Promise<RespondentSessionContext> {
  // 1. 文書 ID の形式
  if (!docIdSchema.safeParse(sessionId).success) throw API_ERRORS.notFound();
  // 2. Cookie
  if (!cookieToken) throw API_ERRORS.respondentTokenInvalid();
  // 3. 文書の取得とハッシュの照合（sessionId の存在有無を区別しない）
  const session = await getSession(sessionId);
  if (!session || !safeEqualHex(session.sessionTokenHash, hashRespondentToken(cookieToken))) {
    throw API_ERRORS.respondentTokenInvalid();
  }
  // 4. 期限
  if (session.tokenExpiresAt.getTime() <= now.getTime()) throw API_ERRORS.respondentTokenExpired();
  // 5. 受検者（kind）
  const respondent = await getRespondentById({
    respondentId: session.respondentId,
    organizationId: session.organizationId,
  });
  if (!respondent) throw API_ERRORS.respondentTokenInvalid();
  return {
    sessionId: session.id,
    organizationId: session.organizationId,
    respondentId: respondent.id,
    kind: respondent.kind,
    status: session.status,
    tokenExpiresAt: session.tokenExpiresAt,
    request,
    session,
  };
}

/** Route Handler 用。Cookie のトークンと {sessionId} の組を検証する */
export async function requireRespondentSession(
  request: Request,
  sessionId: string,
  options: { readonly meta?: RequestMeta; readonly now?: Date } = {},
): Promise<RespondentSessionContext> {
  return resolve(
    readCookie(request.headers, RESPONDENT_COOKIE_NAME),
    sessionId,
    options.meta ?? metaFromHeaders(request.headers),
    options.now ?? new Date(),
  );
}

/** Server Component 用。next/headers の cookies() から tk_session を読む以外は同じ */
export async function requireRespondentSessionFromCookies(
  sessionId: string,
): Promise<RespondentSessionContext> {
  const { cookies, headers } = await import("next/headers");
  const cookieStore = await cookies();
  return resolve(
    cookieStore.get(RESPONDENT_COOKIE_NAME)?.value ?? null,
    sessionId,
    metaFromHeaders(await headers()),
    new Date(),
  );
}

/**
 * 受検リンクを開き直したときの再開判定（04 §2.5.2、D04-43）。例外を投げず、再開できなければ null。
 * organizationId と kind が一致し、draft・未削除・期限内のセッションだけを返す。個人情報は返さない
 */
export async function findResumableSession(
  cookieToken: string | null,
  organizationId: string,
  kind: RespondentKind,
  now: Date = new Date(),
): Promise<{ readonly sessionId: string; readonly answeredCount: number } | null> {
  if (!cookieToken) return null;
  const session = await getSessionByTokenHash({
    organizationId,
    sessionTokenHash: hashRespondentToken(cookieToken),
    now,
  });
  if (!session || session.status !== "draft") return null;
  const respondent = await getRespondentById({
    respondentId: session.respondentId,
    organizationId,
  });
  if (!respondent || respondent.kind !== kind) return null;
  return { sessionId: session.id, answeredCount: Object.keys(session.answers).length };
}
