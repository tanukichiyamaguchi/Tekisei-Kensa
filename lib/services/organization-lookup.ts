// 受検リンクの検証（04 §4.1）。Route Handler と受検者登録画面（Server Component）が共有する
import type { AssessmentLinkDto } from "./dto/respondent";
import { ApiError } from "./errors";
import { findResumableSession } from "@/lib/auth/respondent-session";
import { getOrganization } from "@/lib/db/repositories/organizations-repository";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { RespondentKind } from "@/lib/db/types";

export function organizationNotFound(): ApiError {
  return new ApiError(
    404,
    "ORGANIZATION_NOT_FOUND",
    "受検リンクが無効です。管理者にお問い合わせください",
  );
}

/**
 * 組織が存在し論理削除されていなければ組織名と再開可能なセッションを返す。
 * 文書 ID の形式でなければ 404 NOT_FOUND、組織なし・削除済みは 404 ORGANIZATION_NOT_FOUND。
 * resumable は Cookie が無効・別組織・別区分・送信済み・期限切れのいずれでも null（例外にしない）
 */
export async function getOrganizationForAssessment(
  organizationId: string,
  kind: RespondentKind,
  cookieToken: string | null,
  now: Date = new Date(),
): Promise<AssessmentLinkDto> {
  if (!docIdSchema.safeParse(organizationId).success) {
    throw new ApiError(404, "NOT_FOUND", "指定されたリソースが見つかりません");
  }
  const org = await getOrganization(organizationId);
  if (!org) throw organizationNotFound();
  return {
    organizationId: org.id,
    organizationName: org.name,
    kind,
    resumable: await findResumableSession(cookieToken, org.id, kind, now),
  };
}
