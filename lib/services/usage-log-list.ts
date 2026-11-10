// 利用履歴（04 §5.8、11-2 §3.8）。送信済みの全件を回答日時（submittedAt）の新しい順に返す（ページングなし）。
// オーナー以外には既存スタッフの履歴を返さない（K-29）。論理削除された受検者の履歴も返す（00 §2.2）
import { writeAuditLog } from "./audit";
import type { UsageLogListDto } from "./dto/admin";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { listUsageLogs as listUsageLogDocs } from "@/lib/db/repositories/usage-logs-repository";

export async function listUsageLogs(ctx: AdminContext): Promise<UsageLogListDto> {
  const logs = await listUsageLogDocs({ viewer: ctx });
  const items = logs.map((u) => ({
    usageLogId: u.id,
    respondentId: u.respondentId,
    resultId: u.resultId,
    name: u.name,
    phoneNumber: u.phoneNumber,
    kind: u.respondentKind,
    diagnosisExperience: u.diagnosisExperience,
    registeredAt: u.registeredAt.toISOString(),
    submittedAt: u.submittedAt?.toISOString() ?? null,
  }));
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
  return { items, total: items.length };
}
