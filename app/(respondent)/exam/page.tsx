// R-01 受検者登録（05 §5.1、§11.1）。/exam?q={organizationId}&p=user|executives
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { RegistrationForm } from "@/components/respondent/RegistrationForm";
import { ResumeBanner } from "@/components/respondent/ResumeBanner";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import { kindFromLinkParam } from "@/lib/presentation/registration-rules";
import type { AssessmentLinkDto } from "@/lib/services/dto/respondent";
import { ApiError } from "@/lib/services/errors";
import { getOrganizationForAssessment } from "@/lib/services/organization-lookup";
import { docIdSchema } from "@/lib/services/schemas/common";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const single = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? undefined : v;

async function lookup(
  organizationId: string,
  kind: AssessmentLinkDto["kind"],
): Promise<AssessmentLinkDto | null> {
  const cookieToken = (await cookies()).get(RESPONDENT_COOKIE_NAME)?.value ?? null;
  try {
    return await getOrganizationForAssessment(organizationId, kind, cookieToken);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "ORGANIZATION_NOT_FOUND" || error.code === "NOT_FOUND")
    ) {
      return null;
    }
    throw error;
  }
}

export default async function RegistrationPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const params = await searchParams;
  const organizationId = single(params.q);
  const kind = kindFromLinkParam(single(params.p));
  // q・p の不正、組織なし・削除済みは同じ表示（organization_not_found、404。D05-21）
  if (!organizationId || !kind || !docIdSchema.safeParse(organizationId).success) notFound();
  const link = await lookup(organizationId, kind);
  if (!link) notFound();
  // organizationName は表示しない（05 D05-34）
  return (
    <>
      {link.resumable ? (
        <ResumeBanner
          sessionId={link.resumable.sessionId}
          answeredCount={link.resumable.answeredCount}
        />
      ) : null}
      <RegistrationForm organizationId={link.organizationId} kind={kind} />
    </>
  );
}
