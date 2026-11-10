// 受検者登録（04 §4.2.1、11-1 §3.4.1）。生のトークンは Cookie でだけ返し、応答ボディには含めない（00 D-32）
import { examUrls, type SessionCreatedDto } from "./dto/respondent";
import { organizationNotFound } from "./organization-lookup";
import { assertRegistrationAllowed } from "./rate-limit";
import { docIdSchema } from "./schemas/common";
import type { RegisterRespondentInput } from "./schemas/respondent";
import type { RequestMeta } from "@/lib/auth/request-meta";
import { issueRespondentToken, type IssuedRespondentToken } from "@/lib/auth/respondent-token";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import { registerRespondent as registerRespondentDocs } from "@/lib/db/repositories/respondents-repository";
import { canLinkAsPrevious } from "@/lib/db/repositories/results-repository";

/**
 * 前回の候補の判定（11-1 §2.2.8 の手順 1〜3）。prev が無い・文書 ID の形でなければ候補なし。
 * 同じ組織の論理削除されていない結果で、まだほかの結果の前回になっていなければ、その ID を候補にする（K-31 ①）
 */
async function previousCandidate(
  organizationId: string,
  previousResultId: string | undefined,
): Promise<string | null> {
  if (previousResultId === undefined || !docIdSchema.safeParse(previousResultId).success) {
    return null;
  }
  return (await canLinkAsPrevious({ organizationId, resultId: previousResultId }))
    ? previousResultId
    : null;
}

export async function registerRespondent(
  input: RegisterRespondentInput,
  request: RequestMeta,
  now: Date = new Date(),
): Promise<{ readonly dto: SessionCreatedDto; readonly issued: IssuedRespondentToken }> {
  // 1. 組織（§4.1 と同じ条件）
  const org = await getOrganization(input.organizationId);
  if (!org) throw organizationNotFound();
  // 2. レート制限（§2.8）
  await assertRegistrationAllowed({
    organizationId: org.id,
    ipAddress: request.ipAddress,
    now,
  });
  // 3. 前回の候補。候補を受け付けた受験は p にかかわらず既存スタッフ（11-1 §1.4 の 7）。候補の有無で応答の状態・Cookie・
  //    エラーを変えず、受験者には何も知らせない（候補にならなければ通常の受験）。前回の結果の ID はログに出さない
  const previousResultId = await previousCandidate(org.id, input.previousResultId);
  const kind = previousResultId === null ? input.kind : "executive";
  // 4. トークン
  const issued = issueRespondentToken(now);
  // 5. 3 文書（受検者・受検セッション・監査ログ respondent.register）を 1 バッチで作成する。
  //    利用履歴は送信のときに作る（11-1 §2.7.4）
  const registered = await registerRespondentDocs({
    organizationId: org.id,
    kind,
    name: input.name,
    phoneNumber: input.phoneNumber,
    occupationCode: input.occupationCode,
    diagnosisExperience: input.diagnosisExperience,
    previousResultId,
    sessionTokenHash: issued.tokenHash,
    tokenExpiresAt: issued.expiresAt,
    meta: request,
  });
  return {
    dto: {
      sessionId: registered.sessionId,
      organizationId: org.id,
      kind, // 保存した受検者区分（11-1 §3.4.1）
      status: "draft",
      tokenExpiresAt: issued.expiresAt.toISOString(),
      nextUrl: examUrls.session(registered.sessionId),
    },
    issued,
  };
}
