// 受検者の更新（チーム・除外・区分と日付・役職）と論理削除（04 §5.6、11-2 §3.6・§3.7）。更新はパスの受検者の受験を含む行の
// つながり全件（閲覧範囲の中）に書く。複製フィールド（results・usageLogs）と監査ログはリポジトリが同じバッチで書く
import type { PersonUpdatedDto } from "./dto/admin";
import { API_ERRORS, ApiError } from "./errors";
import { buildPersonRows, findPersonRow } from "./person-chain";
import { resultNotFound } from "./result-detail";
import type { UpdatePersonInput } from "./schemas/admin-respondents";
import type { AdminContext } from "@/lib/auth/admin-context";
import {
  getRespondent,
  softDeleteRespondent,
  updatePersonAttributes,
  type PersonAttributesPatch,
  type PersonMember,
} from "@/lib/db/repositories/respondents-repository";
import { listResults, type ResultListRow } from "@/lib/db/repositories/results-repository";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { TeamCode } from "@/lib/scoring/types";

function assertDocId(respondentId: string): void {
  if (!docIdSchema.safeParse(respondentId).success) throw API_ERRORS.notFound();
}

/** 見えない受検者（他組織・削除済み・オーナー以外に対する既存スタッフ）。文言はリポジトリの変換（04 §8.4）と同じ */
function respondentNotFound(): ApiError {
  return new ApiError(404, "RESPONDENT_NOT_FOUND", "受検者が見つかりません");
}

/**
 * 受検者の更新（11-2 §3.6。updateRespondent を置き換えた）。本文の検証は Route Handler（updatePersonInputSchema）。
 * 1. 文書 ID の形（404 NOT_FOUND）、退職日 < 入社日（422 LEFT_BEFORE_HIRED）。
 * 2. パスの受検者の可視性（404 RESPONDENT_NOT_FOUND）。
 * 3. 送信前の受検者（resultId が null）は、その受検者だけに teamCode・isExcluded を書く（employment・staffRole は 404 RESULT_NOT_FOUND）。
 * 4. 送信済みなら、閲覧範囲の受験から行を作り（buildPersonRows）、その受験を含む行のつながりを書く範囲にする（無ければ 404 RESULT_NOT_FOUND）。
 * 5. updatePersonAttributes() で 1 回のバッチに書く（変わらない値は書かない）。
 * 6. 応答の値は更新したあとの代表の受験の値。オーナー以外が責任者・幹部にした行は isVisibleAfterUpdate が false
 */
export async function updatePerson(
  ctx: AdminContext,
  respondentId: string,
  input: UpdatePersonInput,
  now: Date = new Date(),
): Promise<PersonUpdatedDto> {
  // 1.
  assertDocId(respondentId);
  const employment = input.employment;
  if (
    employment !== undefined &&
    employment.hiredOn !== null &&
    employment.leftOn !== null &&
    employment.leftOn < employment.hiredOn
  ) {
    throw API_ERRORS.leftBeforeHired();
  }
  // 2.
  const respondent = await getRespondent({ respondentId, viewer: ctx });
  if (!respondent) throw respondentNotFound();

  // 送られた項目だけを持つ
  const patch: PersonAttributesPatch = {
    ...(input.teamCode === undefined ? {} : { teamCode: input.teamCode as TeamCode | null }),
    ...(input.isExcluded === undefined ? {} : { isExcluded: input.isExcluded }),
    ...(employment === undefined ? {} : { employment }),
    ...(input.staffRole === undefined ? {} : { staffRole: input.staffRole }),
  };

  // 3〜4. 書く範囲と、代表の受験の今の値（送信前の受検者は受検者の値）
  let members: readonly PersonMember[];
  let head: ResultListRow | null = null;
  if (respondent.resultId === null) {
    if (employment !== undefined || input.staffRole !== undefined) throw resultNotFound();
    members = [{ respondentId, resultId: null }];
  } else {
    const row = findPersonRow(
      buildPersonRows(await listResults({ viewer: ctx })),
      respondent.resultId,
    );
    if (!row) throw resultNotFound();
    members = row.chain.map((exam) => ({
      respondentId: exam.respondentId,
      resultId: exam.resultId,
    }));
    head = row.head;
  }

  // 5.
  const { writtenResultIds, kindAfter } = await updatePersonAttributes({
    members,
    viewer: ctx,
    patch,
    meta: ctx.request,
  });

  // 6. 更新したあとの代表の受験の値（送った項目は送った値、ほかは今の値）
  const currentTeam = head === null ? respondent.teamCode : head.teamCode;
  const currentExcluded = head === null ? respondent.isExcluded : head.isExcluded;
  return {
    respondentId,
    resultIds: writtenResultIds,
    teamCode: patch.teamCode === undefined ? currentTeam : patch.teamCode,
    isExcluded: patch.isExcluded ?? currentExcluded,
    employment:
      head === null
        ? null
        : (patch.employment ?? {
            status: head.employmentStatus,
            hiredOn: head.hiredOn,
            leftOn: head.leftOn,
          }),
    staffRole: head === null ? null : (patch.staffRole ?? head.staffRole),
    isVisibleAfterUpdate: !(kindAfter === "executive" && !ctx.canViewExecutives),
    updatedAt: now.toISOString(),
  };
}

/** 論理削除（11-2 §3.7。変えない）。既に削除済みは 404（D04-30）。削除した受験を前回とする受験の previousResultId は書き換えない */
export async function deleteRespondent(ctx: AdminContext, respondentId: string): Promise<void> {
  assertDocId(respondentId);
  await softDeleteRespondent({ respondentId, viewer: ctx, meta: ctx.request });
}
