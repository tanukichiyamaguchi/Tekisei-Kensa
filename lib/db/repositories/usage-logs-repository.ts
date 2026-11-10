// 利用履歴（02 §3.7、§8.6、11-2 §3.3）
import type { Query } from "firebase-admin/firestore";

import { canViewExecutives } from "@/lib/auth/claims";
import type { Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, rawCollection } from "@/lib/db/collections";
import type { UsageLog } from "@/lib/db/domain";
import { toUsageLog } from "@/lib/db/mappers/documents";
import type { UsageLogDoc } from "@/lib/db/types";

/**
 * 利用履歴の全件。Q5（改。owner / super_admin）または Q6（改。admin: respondentKind == "applicant"。K-29）で
 * submittedAt の降順に読み、送信済み（submittedAt が null でない）だけを返す。M7 より前の登録で作られた、送信されていない
 * 履歴（submittedAt == null）は並びの最後に来るので、読んだあとに除く（!= null の条件を付けず、インデックスの形を変えない）。
 * usageLogs は deletedAt を持たないので、論理削除した受験の履歴も返す（10 K-04）
 */
export async function listUsageLogs(input: {
  readonly viewer: Viewer;
}): Promise<readonly UsageLog[]> {
  let query: Query = rawCollection(COLLECTIONS.usageLogs).where(
    "organizationId",
    "==",
    input.viewer.organizationId,
  );
  if (!canViewExecutives(input.viewer.role)) {
    query = query.where("respondentKind", "==", "applicant");
  }
  const snapshot = await query.orderBy("submittedAt", "desc").get();
  return snapshot.docs
    .map((d) => toUsageLog(d.id, d.data() as UsageLogDoc))
    .filter((u) => u.submittedAt !== null);
}
