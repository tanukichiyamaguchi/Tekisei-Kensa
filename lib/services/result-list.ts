// 回答一覧（04 §5.3、11-2 §3.5）。閲覧範囲の results を全件読み、同じ人の受験を 1 行にまとめ（buildPersonRows）、代表の受検者を
// 突き合わせて全行を返す。検索・絞り込み・並び替え・表示の上限は画面で行う（D04-55。Firestore は結合と部分一致検索ができない）
import { writeAuditLog } from "./audit";
import type { ResultListDto, ResultListExamDto, ResultListRowDto } from "./dto/admin";
import { buildPersonRows } from "./person-chain";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { getRespondentsByIds } from "@/lib/db/repositories/respondents-repository";
import {
  listResults as listVisibleResults,
  type ResultListRow,
} from "@/lib/db/repositories/results-repository";
import { logger } from "@/lib/utils/logger";

/**
 * 回答一覧の全行（11-2 §3.5）。API の GET /api/v1/admin/results と、回答一覧の画面の Server Component（app/(admin)/admin/page.tsx）が使う。
 * 1. 閲覧範囲の受験を全件読む（Q3・Q4。オーナー以外は受検者区分が applicant だけ）。
 * 2. buildPersonRows() で同じ人の受験を 1 行にまとめる（代表の submittedAt の降順）。
 * 3. 代表の受検者だけを読み、受検者が無い・組織が違う・論理削除済みの行は除く（warn に resultId だけを出す）。
 * 4. 受験ごとの「経年比較あり」: 経年比較の状態が completed で、前回が手順 1 の受験の中にある（K-39 Q-35、K-29）。
 * 5. 監査ログ result.list（details は行数と受験の件数）を書き、応答する。個人情報は代表の受検者の氏名・電話番号だけ
 */
export async function listResultRows(ctx: AdminContext): Promise<ResultListDto> {
  // 1.
  const results = await listVisibleResults({ viewer: ctx });
  const generatedAt = new Date(); // 基準時刻（一覧のデータをサーバで読んだ時刻）
  // 2.
  const personRows = buildPersonRows(results);
  // 3.
  const respondents = await getRespondentsByIds({
    organizationId: ctx.organizationId,
    respondentIds: personRows.map((row) => row.head.respondentId),
  });
  // 4.
  const visibleIds = new Set(results.map((r) => r.resultId));
  const toExam = (r: ResultListRow): ResultListExamDto => ({
    resultId: r.resultId,
    respondentId: r.respondentId,
    submittedAt: r.submittedAt.toISOString(),
    hasLongitudinalReport:
      r.longitudinalAiStatus === "completed" &&
      r.previousResultId !== null &&
      visibleIds.has(r.previousResultId),
  });
  const rows: ResultListRowDto[] = [];
  for (const { head, chain } of personRows) {
    const respondent = respondents.get(head.respondentId);
    if (!respondent || respondent.deletedAt !== null) {
      // results と respondents の整合性の異常（論理削除は同一バッチのため通常は起きない）
      logger.warn("result_list.respondent_missing", {
        requestId: ctx.request.requestId,
        resultId: head.resultId,
      });
      continue;
    }
    rows.push({
      resultId: head.resultId,
      respondentId: head.respondentId,
      name: respondent.name,
      phoneNumber: respondent.phoneNumber,
      occupationCode: respondent.occupationCode,
      teamCode: head.teamCode,
      isExcluded: head.isExcluded,
      employmentStatus: head.employmentStatus,
      hiredOn: head.hiredOn,
      leftOn: head.leftOn,
      staffRole: head.staffRole,
      aptitudeType: head.aptitudeType,
      submittedAt: head.submittedAt.toISOString(),
      exams: chain.map(toExam),
    });
  }
  // 5. 閲覧の監査ログ（失敗しても応答は変えない。D04-11）
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "result.list",
    targetCollection: COLLECTIONS.results,
    targetId: null,
    details: {
      rowCount: rows.length,
      examCount: rows.reduce((sum, row) => sum + row.exams.length, 0),
    },
    request: ctx.request,
  });
  return { generatedAt: generatedAt.toISOString(), rows };
}
