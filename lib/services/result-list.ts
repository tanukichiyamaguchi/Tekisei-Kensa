// 回答一覧（04 §5.3）。results を組織条件で全件読み、respondents を突き合わせて、絞り込み・並び替え・ページングは
// メモリ上で行う（D04-55。Firestore は結合と部分一致検索ができない）
import { writeAuditLog } from "./audit";
import type { PagedDto, ResultListItemDto } from "./dto/admin";
import type { ListResultsQuery } from "./schemas/admin-results";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import type { Respondent } from "@/lib/db/domain";
import { getRespondentsByIds } from "@/lib/db/repositories/respondents-repository";
import {
  listResults as listResultRows,
  type ResultListRow,
} from "@/lib/db/repositories/results-repository";
import { logger } from "@/lib/utils/logger";

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

export async function listResults(
  ctx: AdminContext,
  query: ListResultsQuery,
): Promise<PagedDto<ResultListItemDto>> {
  // 1. 組織の results を全件（admin は幹部を含まない）→ 区分・チーム・除外で絞る
  const filtered = (await listResultRows({ viewer: ctx })).filter((r) => matchesFilters(r, query));
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
