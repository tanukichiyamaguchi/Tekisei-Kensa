// 受検者のチーム・除外の更新と論理削除（04 §5.6）。複製フィールド（results）と監査ログはリポジトリが同一バッチで書く
import type { RespondentUpdatedDto } from "./dto/admin";
import { API_ERRORS } from "./errors";
import type { UpdateRespondentInput } from "./schemas/admin-respondents";
import type { AdminContext } from "@/lib/auth/admin-context";
import {
  softDeleteRespondent,
  updateRespondentFlags,
} from "@/lib/db/repositories/respondents-repository";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { TeamCode } from "@/lib/scoring/types";

function assertDocId(respondentId: string): void {
  if (!docIdSchema.safeParse(respondentId).success) throw API_ERRORS.notFound();
}

/** 見えない文書（他組織・削除済み・admin に対する幹部）はリポジトリが RESPONDENT_NOT_FOUND を投げ、handle() が 404 にする */
export async function updateRespondent(
  ctx: AdminContext,
  respondentId: string,
  input: UpdateRespondentInput,
  now: Date = new Date(),
): Promise<RespondentUpdatedDto> {
  assertDocId(respondentId);
  const patch: { teamCode?: TeamCode | null; isExcluded?: boolean } = {};
  if (input.teamCode !== undefined) patch.teamCode = input.teamCode as TeamCode | null;
  if (input.isExcluded !== undefined) patch.isExcluded = input.isExcluded;
  const { after } = await updateRespondentFlags({
    respondentId,
    viewer: ctx,
    patch,
    meta: ctx.request,
  });
  return {
    respondentId,
    teamCode: after.teamCode,
    isExcluded: after.isExcluded,
    updatedAt: now.toISOString(),
  };
}

/** 論理削除。既に削除済みは 404（D04-30） */
export async function deleteRespondent(ctx: AdminContext, respondentId: string): Promise<void> {
  assertDocId(respondentId);
  await softDeleteRespondent({ respondentId, viewer: ctx, meta: ctx.request });
}
