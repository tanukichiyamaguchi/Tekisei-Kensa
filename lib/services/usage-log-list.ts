// 利用履歴（04 §5.8）。論理削除された受検者の履歴も返す（00 §2.2）
import { writeAuditLog } from "./audit";
import type { PagedDto, UsageLogItemDto } from "./dto/admin";
import type { ListUsageLogsQuery } from "./schemas/admin-results";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { listUsageLogs as listUsageLogDocs } from "@/lib/db/repositories/usage-logs-repository";

export async function listUsageLogs(
  ctx: AdminContext,
  query: ListUsageLogsQuery,
): Promise<PagedDto<UsageLogItemDto>> {
  const { items, total } = await listUsageLogDocs({
    viewer: ctx,
    order: query.order,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "usage_log.view",
    targetCollection: COLLECTIONS.usageLogs,
    targetId: null,
    details: { count: items.length },
    request: ctx.request,
  });
  return {
    items: items.map((u) => ({
      usageLogId: u.id,
      respondentId: u.respondentId,
      resultId: u.resultId,
      name: u.name,
      phoneNumber: u.phoneNumber,
      kind: u.respondentKind,
      diagnosisExperience: u.diagnosisExperience,
      registeredAt: u.registeredAt.toISOString(),
      submittedAt: u.submittedAt?.toISOString() ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
