// PATCH/DELETE /api/v1/admin/respondents/{respondentId}（チーム・除外の更新、論理削除。04 §5.6）
import { requireAdmin } from "@/lib/auth/admin-context";
import type { RespondentUpdatedDto } from "@/lib/services/dto/admin";
import { empty, handle, json, readJson } from "@/lib/services/http";
import { deleteRespondent, updateRespondent } from "@/lib/services/respondent-management";
import { updateRespondentInputSchema } from "@/lib/services/schemas/admin-respondents";

export const runtime = "nodejs";

type Params = { params: Promise<{ respondentId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return handle(request, "/api/v1/admin/respondents/[respondentId]", async (meta) => {
    const { respondentId } = await params;
    const ctx = await requireAdmin(request, meta);
    const input = await readJson(request, (v) => updateRespondentInputSchema.parse(v));
    return json<RespondentUpdatedDto>(meta, await updateRespondent(ctx, respondentId, input));
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  return handle(request, "/api/v1/admin/respondents/[respondentId]", async (meta) => {
    const { respondentId } = await params;
    const ctx = await requireAdmin(request, meta);
    await deleteRespondent(ctx, respondentId);
    return empty(meta, 204);
  });
}
