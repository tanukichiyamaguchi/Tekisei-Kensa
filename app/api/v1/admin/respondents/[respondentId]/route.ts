// PATCH/DELETE /api/v1/admin/respondents/{respondentId}（受検者の更新と論理削除。04 §5.6、11-2 §3.6・§3.7）。
// PATCH はチーム・除外・区分と日付・役職を、パスの受検者の受験を含む行のつながり全件（閲覧範囲の中）に書く
import { requireAdmin } from "@/lib/auth/admin-context";
import type { PersonUpdatedDto } from "@/lib/services/dto/admin";
import { empty, handle, json, readJson } from "@/lib/services/http";
import { deleteRespondent, updatePerson } from "@/lib/services/respondent-management";
import { updatePersonInputSchema } from "@/lib/services/schemas/admin-respondents";

export const runtime = "nodejs";

type Params = { params: Promise<{ respondentId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  return handle(request, "/api/v1/admin/respondents/[respondentId]", async (meta) => {
    const { respondentId } = await params;
    const ctx = await requireAdmin(request, meta);
    const input = await readJson(request, (v) => updatePersonInputSchema.parse(v));
    return json<PersonUpdatedDto>(meta, await updatePerson(ctx, respondentId, input));
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
