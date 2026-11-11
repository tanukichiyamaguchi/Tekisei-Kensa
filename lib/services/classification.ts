// 組織内分類（04 §5.7、11-3 §3.2）と在籍・退職（11-3 §3.3）。閲覧範囲の人（同じ人の受験は代表の受験で数え、除外した受験は
// 数えない。11-3 §2.2）を全件返す。2 つの画面は同じ人を使う（listOrganizationPeople）。分類ごと・タイプごとの集計、在籍・退職の
// タブの振り分け・勤続・分析と絞り込みは画面で行う（参照元どおり。lib/presentation/classification-view.ts・retention.ts）
import { writeAuditLog } from "./audit";
import type { ClassificationDto, EmploymentDto } from "./dto/admin";
import { listOrganizationPeople } from "./organization-people";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { todayInTokyo } from "@/lib/presentation/employment";

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

/**
 * 在籍・退職の人と基準日（11-3 §3.3）。API の GET /api/v1/admin/employment と、在籍・退職の画面の Server Component
 * （app/(admin)/admin/employment/page.tsx）が使う。now は基準日のテスト用（11-3 §3.6。省略時は今の時刻）。
 * 1. listOrganizationPeople() で閲覧範囲の人を読む（組織内分類と同じ人・同じ順。オーナー以外は既存スタッフを含まない。K-29）。
 * 2. 基準日 today を now の Asia/Tokyo の暦日にし（実行環境の時間帯（TZ）に左右されない）、人を応答の形に写す。
 *    電話番号は在籍・退職の画面に出さないので返さない。受検者 ID は区分・入社日・退職日の更新に使う（11-3 §3.4）。
 * 3. 監査ログ employment.view（details は人数だけ）を書き、応答する。受験の文書は書かない
 */
export async function getEmployment(
  ctx: AdminContext,
  now: Date = new Date(),
): Promise<EmploymentDto> {
  // 1.
  const people = await listOrganizationPeople(ctx);
  // 2.
  const dto: EmploymentDto = {
    today: todayInTokyo(now),
    people: people.map((person) => ({
      resultId: person.resultId,
      respondentId: person.respondentId,
      aptitudeType: person.aptitudeType,
      name: person.name,
      occupationLabel: person.occupationLabel,
      teamCode: person.teamCode,
      submittedAt: person.submittedAt.toISOString(),
      employmentStatus: person.employmentStatus,
      hiredOn: person.hiredOn,
      leftOn: person.leftOn,
    })),
  };
  // 3. 閲覧の監査ログ（失敗しても応答は変えない。D04-11）。count は人数（11-3 §3.5）。氏名・入社日・退職日・基準日を入れない
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "employment.view",
    targetCollection: COLLECTIONS.results,
    targetId: null,
    details: { count: people.length },
    request: ctx.request,
  });
  return dto;
}
