// 送信・採点・結果保存（04 §4.5）。採点はリポジトリのトランザクション内で行い、結果は受検者に返さない
import { examUrls, type SessionSubmittedDto } from "./dto/respondent";
import { assertDraft } from "./session-progress";
import type { RespondentSessionContext } from "@/lib/auth/respondent-session";
import { submitSession as submitSessionDocs } from "@/lib/db/repositories/assessment-sessions-repository";

/**
 * 二重送信は (1) ここでの status 確認、(2) トランザクション内の再読み取り（D04-59）で 409 にする。
 * リポジトリの例外（SESSION_ALREADY_SUBMITTED・ANSWERS_INCOMPLETE・SESSION_NOT_FOUND）は handle() が変換する
 */
export async function submitSession(ctx: RespondentSessionContext): Promise<SessionSubmittedDto> {
  assertDraft(ctx);
  const submitted = await submitSessionDocs({ sessionId: ctx.sessionId, meta: ctx.request });
  return {
    sessionId: ctx.sessionId,
    status: "submitted",
    submittedAt: submitted.submittedAt.toISOString(),
    nextUrl: examUrls.complete(ctx.sessionId),
  };
}
