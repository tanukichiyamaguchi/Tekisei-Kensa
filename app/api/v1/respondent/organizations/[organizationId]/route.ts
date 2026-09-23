// GET /api/v1/respondent/organizations/{organizationId}（受検リンクの検証。04 §4.1）
import { readCookie } from "@/lib/auth/request-meta";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import type { AssessmentLinkDto } from "@/lib/services/dto/respondent";
import { API_ERRORS } from "@/lib/services/errors";
import { handle, json } from "@/lib/services/http";
import { getOrganizationForAssessment } from "@/lib/services/organization-lookup";
import { docIdSchema } from "@/lib/services/schemas/common";
import { assessmentLinkQuerySchema } from "@/lib/services/schemas/respondent";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  return handle(request, "/api/v1/respondent/organizations/[organizationId]", async (meta) => {
    const { organizationId } = await params;
    if (!docIdSchema.safeParse(organizationId).success) throw API_ERRORS.notFound();
    const query = assessmentLinkQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const dto = await getOrganizationForAssessment(
      organizationId,
      query.kind,
      readCookie(request.headers, RESPONDENT_COOKIE_NAME),
    );
    return json<AssessmentLinkDto>(meta, dto);
  });
}
