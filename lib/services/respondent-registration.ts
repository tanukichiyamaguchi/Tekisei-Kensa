// 受検者登録（04 §4.2.1）。生のトークンは Cookie でだけ返し、応答ボディには含めない（00 D-32）
import { examUrls, type SessionCreatedDto } from "./dto/respondent";
import { organizationNotFound } from "./organization-lookup";
import { assertRegistrationAllowed } from "./rate-limit";
import type { RegisterRespondentInput } from "./schemas/respondent";
import type { RequestMeta } from "@/lib/auth/request-meta";
import { issueRespondentToken, type IssuedRespondentToken } from "@/lib/auth/respondent-token";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import { registerRespondent as registerRespondentDocs } from "@/lib/db/repositories/respondents-repository";

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
  // 3. トークン
  const issued = issueRespondentToken(now);
  // 4. 4 文書を 1 バッチで作成（監査ログ respondent.register もリポジトリが同じバッチに積む）
  const registered = await registerRespondentDocs({
    organizationId: org.id,
    kind: input.kind,
    name: input.name,
    phoneNumber: input.phoneNumber,
    occupationCode: input.occupationCode,
    diagnosisExperience: input.diagnosisExperience,
    sessionTokenHash: issued.tokenHash,
    tokenExpiresAt: issued.expiresAt,
    meta: request,
  });
  return {
    dto: {
      sessionId: registered.sessionId,
      organizationId: org.id,
      kind: input.kind,
      status: "draft",
      tokenExpiresAt: issued.expiresAt.toISOString(),
      nextUrl: examUrls.session(registered.sessionId),
    },
    issued,
  };
}
