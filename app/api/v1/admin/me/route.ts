// GET/PATCH /api/v1/admin/me（04 §5.1）
import { requireAdmin } from "@/lib/auth/admin-context";
import { sessionCookieOptions } from "@/lib/auth/session-cookie";
import { getMe, updateMe } from "@/lib/services/admin-account";
import type { MeDto, MeUpdatedDto } from "@/lib/services/dto/admin";
import { handle, json, readJson } from "@/lib/services/http";
import { updateMeInputSchema } from "@/lib/services/schemas/admin-account";
import { isLocalHttp } from "@/lib/utils/env";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/me", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    return json<MeDto>(meta, await getMe(ctx));
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return handle(request, "/api/v1/admin/me", async (meta) => {
    const ctx = await requireAdmin(request, meta);
    const input = await readJson(request, (v) => updateMeInputSchema.parse(v));
    const dto = await updateMe(ctx, input);
    const res = json<MeUpdatedDto>(meta, dto);
    if (dto.reloginRequired) {
      // メール・パスワードの変更後は全セッションを失効させた。この端末の Cookie も削除する
      const { name, ...options } = sessionCookieOptions(new Date(0), isLocalHttp());
      res.cookies.set(name, "", { ...options, maxAge: 0 });
    }
    return res;
  });
}
