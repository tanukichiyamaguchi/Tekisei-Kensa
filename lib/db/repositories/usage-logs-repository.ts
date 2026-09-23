// 利用履歴（02 §3.7、§8.6）
import type { Query } from "firebase-admin/firestore";

import { canViewExecutives } from "@/lib/auth/claims";
import type { Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, rawCollection } from "@/lib/db/collections";
import type { UsageLog } from "@/lib/db/domain";
import { toUsageLog } from "@/lib/db/mappers/documents";
import type { UsageLogDoc } from "@/lib/db/types";

export interface ListUsageLogsInput {
  readonly viewer: Viewer;
  readonly order: "asc" | "desc"; // registeredAt の並び
  readonly offset: number; // (page − 1) × pageSize
  readonly limit: number; // pageSize（1〜200）
}

/** Q5（owner / super_admin）または Q6（admin）を limit + offset で読み、同じ等価条件の count()（Q13）で total を返す */
export async function listUsageLogs(
  input: ListUsageLogsInput,
): Promise<{ readonly items: readonly UsageLog[]; readonly total: number }> {
  let base: Query = rawCollection(COLLECTIONS.usageLogs).where(
    "organizationId",
    "==",
    input.viewer.organizationId,
  );
  if (!canViewExecutives(input.viewer.role)) base = base.where("respondentKind", "==", "applicant");
  const [page, count] = await Promise.all([
    base.orderBy("registeredAt", input.order).offset(input.offset).limit(input.limit).get(),
    base.count().get(),
  ]);
  return {
    items: page.docs.map((d) => toUsageLog(d.id, d.data() as UsageLogDoc)),
    total: count.data().count,
  };
}
