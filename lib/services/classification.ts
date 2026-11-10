// 組織内分類（04 §5.7、11-3 §3.2）。閲覧範囲の人（同じ人の受験は代表の受験で数え、除外した受験は数えない。11-3 §2.2）を
// 全件返す。分類ごと・タイプごとの集計と絞り込みは画面で行う（参照元どおり。lib/presentation/classification-view.ts）
import { writeAuditLog } from "./audit";
import type { ClassificationDto } from "./dto/admin";
import { listOrganizationPeople } from "./organization-people";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";

/**
 * 組織内分類の人（11-3 §3.2）。API の GET /api/v1/admin/classification と、組織内分類の画面の Server Component
 * （app/(admin)/admin/classification/page.tsx）が使う。
 * 1. listOrganizationPeople() で閲覧範囲の人を読む（代表の submittedAt の降順。オーナー以外は既存スタッフを含まない。K-29）。
 * 2. 応答の形に写す。受検者 ID・入社日・退職日は組織内分類で使わないので返さない。
 * 3. 監査ログ classification.view（details は人数だけ）を書き、応答する
 */
export async function getClassification(ctx: AdminContext): Promise<ClassificationDto> {
  // 1.
  const people = await listOrganizationPeople(ctx);
  // 2.
  const dto: ClassificationDto = {
    people: people.map((person) => ({
      resultId: person.resultId,
      aptitudeType: person.aptitudeType,
      name: person.name,
      phoneNumber: person.phoneNumber,
      occupationLabel: person.occupationLabel,
      teamCode: person.teamCode,
      submittedAt: person.submittedAt.toISOString(),
      employmentStatus: person.employmentStatus,
    })),
  };
  // 3. 閲覧の監査ログ（失敗しても応答は変えない。D04-11）。count は人数（前回は結果の件数。11-3 §3.5）
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "classification.view",
    targetCollection: COLLECTIONS.results,
    targetId: null,
    details: { count: people.length },
    request: ctx.request,
  });
  return dto;
}
