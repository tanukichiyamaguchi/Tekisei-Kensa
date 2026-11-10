// 回答一覧（04 §5.3、11-2 §3.5）。閲覧範囲の results を全件読み、同じ人の受験を 1 行にまとめ（buildPersonRows）、代表の受検者を
// 突き合わせて全行を返す。検索・絞り込み・並び替え・表示の上限は画面で行う（D04-55。Firestore は結合と部分一致検索ができない）
import { writeAuditLog } from "./audit";
import type {
  PagedDto,
  ResultListDto,
  ResultListExamDto,
  ResultListItemDto,
  ResultListRowDto,
} from "./dto/admin";
import { buildPersonRows } from "./person-chain";
import type { ListResultsQuery } from "./schemas/admin-results";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import type { Respondent } from "@/lib/db/domain";
import { getRespondentsByIds } from "@/lib/db/repositories/respondents-repository";
import {
  listResults as listVisibleResults,
  type ResultListRow,
} from "@/lib/db/repositories/results-repository";
import { logger } from "@/lib/utils/logger";

/**
 * 回答一覧の全行（11-2 §3.5。API の GET /api/v1/admin/results）。
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

// ---- 以下は PR-7.6 まで今の回答一覧の画面（旧レイアウト）の Server Component（app/(admin)/admin/page.tsx）が使う。
// 受験ごとの行と URL のクエリ（q・kind・teamCode・sort・order・page・pageSize）でサーバが絞り込み・並び替え・ページングを行う。
// API（GET /api/v1/admin/results）は使わない。PR-7.6 で画面を listResultRows に替えて消す（11-2 §4.3）

interface Row {
  readonly result: ResultListRow;
  readonly respondent: Respondent;
}

const collator = new Intl.Collator("ja");

function matchesFilters(row: ResultListRow, query: ListResultsQuery): boolean {
  if (query.kind !== undefined && row.respondentKind !== query.kind) return false;
  if (query.teamCode !== undefined) {
    const team = query.teamCode === "none" ? null : query.teamCode;
    if (row.teamCode !== team) return false;
  }
  if (query.excluded === "only" && !row.isExcluded) return false;
  if (query.excluded === "none" && row.isExcluded) return false;
  return true;
}

/** 並び替え。同値は submittedAt 降順（手順 4） */
function compareRows(query: ListResultsQuery): (a: Row, b: Row) => number {
  const order = query.order ?? (query.sort === "submittedAt" ? "desc" : "asc");
  const sign = order === "asc" ? 1 : -1;
  const bySubmittedDesc = (a: Row, b: Row) =>
    b.result.submittedAt.getTime() - a.result.submittedAt.getTime();
  return (a, b) => {
    let c = 0;
    switch (query.sort) {
      case "submittedAt":
        return sign * (a.result.submittedAt.getTime() - b.result.submittedAt.getTime());
      case "name":
        c = collator.compare(a.respondent.name, b.respondent.name);
        break;
      case "teamCode":
        // 未設定（null）はチームありの後ろに置く
        c =
          a.result.teamCode === b.result.teamCode
            ? 0
            : a.result.teamCode === null
              ? 1
              : b.result.teamCode === null
                ? -1
                : a.result.teamCode.localeCompare(b.result.teamCode);
        break;
      case "occupationCode":
        c = a.respondent.occupationCode - b.respondent.occupationCode;
        break;
    }
    return c !== 0 ? sign * c : bySubmittedDesc(a, b);
  };
}

/** 今の回答一覧の画面（旧レイアウト）の一覧。監査ログ result.list の details は { count, page }（PR-7.6 まで） */
export async function listResults(
  ctx: AdminContext,
  query: ListResultsQuery,
): Promise<PagedDto<ResultListItemDto>> {
  // 1. 組織の results を全件（admin は幹部を含まない）→ 区分・チーム・除外で絞る
  const filtered = (await listVisibleResults({ viewer: ctx })).filter((r) =>
    matchesFilters(r, query),
  );
  // 2. respondents を getAll() でまとめて取得して突き合わせる
  const respondents = await getRespondentsByIds({
    organizationId: ctx.organizationId,
    respondentIds: filtered.map((r) => r.respondentId),
  });
  const rows: Row[] = [];
  for (const result of filtered) {
    const respondent = respondents.get(result.respondentId);
    if (!respondent || respondent.deletedAt !== null) {
      // results と respondents の整合性の異常（論理削除は同一バッチのため通常は起きない）
      logger.warn("result_list.respondent_missing", {
        requestId: ctx.request.requestId,
        resultId: result.resultId,
      });
      continue;
    }
    rows.push({ result, respondent });
  }
  // 3. 氏名・電話番号の部分一致（大文字小文字を区別しない）
  const q = query.q?.toLocaleLowerCase();
  const searched = q
    ? rows.filter(
        (r) =>
          r.respondent.name.toLocaleLowerCase().includes(q) ||
          r.respondent.phoneNumber.toLocaleLowerCase().includes(q),
      )
    : rows;
  // 4〜5. 並び替えとページング
  const sorted = [...searched].sort(compareRows(query));
  const start = (query.page - 1) * query.pageSize;
  const items = sorted.slice(start, start + query.pageSize).map(({ result, respondent }) => ({
    resultId: result.resultId,
    respondentId: respondent.id,
    name: respondent.name,
    phoneNumber: respondent.phoneNumber,
    occupationCode: respondent.occupationCode,
    kind: result.respondentKind,
    teamCode: result.teamCode,
    isExcluded: result.isExcluded,
    submittedAt: result.submittedAt.toISOString(),
    aptitudeType: result.aptitudeType,
    socialStyle: result.socialStyle,
    aiGenerationStatus: result.aiGenerationStatus,
  }));
  // 6. 閲覧の監査ログ
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "result.list",
    targetCollection: COLLECTIONS.results,
    targetId: null,
    details: { count: items.length, page: query.page },
    request: ctx.request,
  });
  return { items, total: sorted.length, page: query.page, pageSize: query.pageSize };
}
