// 組織内分類（04 §5.7）。適性タイプごとに数え、タイプの所属分類（ソーシャルスタイル）で束ねる（D04-33）
import { writeAuditLog } from "./audit";
import type { ClassificationDto, ClassificationMemberDto } from "./dto/admin";
import type { ClassificationQuery } from "./schemas/admin-results";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { getRespondentsByIds } from "@/lib/db/repositories/respondents-repository";
import { listResultsForClassification } from "@/lib/db/repositories/results-repository";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { SOCIAL_STYLE_KEYS, type AptitudeTypeKey } from "@/lib/scoring/types";
import { logger } from "@/lib/utils/logger";

export async function getClassification(
  ctx: AdminContext,
  query: ClassificationQuery,
): Promise<ClassificationDto> {
  // 閲覧者の可視範囲で数える（admin は幹部を含まない。D04-31 改）
  const rows = (await listResultsForClassification({ viewer: ctx })).filter(
    (r) => query.includeExcluded || !r.isExcluded,
  );
  const respondents = await getRespondentsByIds({
    organizationId: ctx.organizationId,
    respondentIds: rows.map((r) => r.respondentId),
  });
  const byType = new Map<AptitudeTypeKey, ClassificationMemberDto[]>();
  for (const row of rows) {
    const respondent = respondents.get(row.respondentId);
    if (!respondent || respondent.deletedAt !== null) {
      logger.warn("classification.respondent_missing", {
        requestId: ctx.request.requestId,
        resultId: row.resultId,
      });
      continue;
    }
    const members = byType.get(row.aptitudeType) ?? [];
    members.push({
      resultId: row.resultId,
      respondentId: respondent.id,
      name: respondent.name,
      kind: row.respondentKind,
      isExcluded: row.isExcluded,
      submittedAt: row.submittedAt.toISOString(),
    });
    byType.set(row.aptitudeType, members);
  }
  // 16 タイプ × 4 分類の枠は人数 0 でも返す。types は sort_order 順、members は submittedAt 降順
  const types = [...APTITUDE_TYPE_DEFINITIONS].sort((a, b) => a.sortOrder - b.sortOrder);
  const styles = SOCIAL_STYLE_KEYS.map((socialStyle) => {
    const styleTypes = types
      .filter((t) => t.socialStyle === socialStyle)
      .map((t) => {
        const members = [...(byType.get(t.key) ?? [])].sort((a, b) =>
          b.submittedAt.localeCompare(a.submittedAt),
        );
        return { aptitudeType: t.key, count: members.length, members };
      });
    return {
      socialStyle,
      count: styleTypes.reduce((sum, t) => sum + t.count, 0),
      types: styleTypes,
    };
  });
  const total = styles.reduce((sum, s) => sum + s.count, 0);
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "classification.view",
    targetCollection: COLLECTIONS.results,
    targetId: null,
    details: { count: total },
    request: ctx.request,
  });
  return { total, styles };
}
