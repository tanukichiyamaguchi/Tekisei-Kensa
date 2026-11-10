// 組織内分類と在籍・退職で数える「人」（11-3 §2.2・§3.6。zaiseki-08・09・10・M1）。2 つの画面の service が同じ関数を使う。
// 人は代表の受験 1 件で表す。受験の文書を書かず、監査ログは呼び出し側（lib/services/classification.ts）が書く
import { selectCountedHeads } from "./person-chain";
import type { AdminContext } from "@/lib/auth/admin-context";
import { getRespondentsByIds } from "@/lib/db/repositories/respondents-repository";
import { listResults } from "@/lib/db/repositories/results-repository";
import type { EmploymentStatus } from "@/lib/db/types";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { APTITUDE_TYPE_KEYS, type AptitudeTypeKey, type TeamCode } from "@/lib/scoring/types";
import { logger } from "@/lib/utils/logger";

/**
 * 人 1 人（11-3 §3.6）。タイプ・区分・入社日・退職日・受験日は代表の受験の値、氏名・電話番号・職業・チームは代表の受験の
 * 受検者の値（参照元: 最新の受験と、その受験者の値。同じ）
 */
export interface OrganizationPerson {
  readonly resultId: string; // 代表の受験
  readonly respondentId: string; // 代表の受検者
  readonly aptitudeType: AptitudeTypeKey;
  readonly name: string;
  readonly phoneNumber: string;
  readonly occupationLabel: string | null; // 職業の表示名（00 §1.10）。未知のコードは null
  readonly teamCode: TeamCode | null; // results.teamCode の複製と同じ値（02 §10 の I-3）
  readonly submittedAt: Date;
  readonly employmentStatus: EmploymentStatus;
  readonly hiredOn: string | null; // 入社日 YYYY-MM-DD
  readonly leftOn: string | null; // 退職日 YYYY-MM-DD
}

const APTITUDE_TYPES: ReadonlySet<string> = new Set(APTITUDE_TYPE_KEYS);

/**
 * 組織内分類と在籍・退職の人（11-3 §2.2 の手順 1〜6）。
 * 1. 閲覧範囲の受験を全件読む（Q3・Q4。オーナー以外は受検者区分が applicant だけ。論理削除された受験は入らない。K-29・K-39 Q-35）。
 * 2. selectCountedHeads() で、除外した受験を除いてから同じ人の受験をまとめ、代表の受験を取り出す（K-39 Q-24・Q-10）。
 * 3. 代表の受検者だけを読み、受検者が無い・組織が違う・論理削除済みの代表は除く（warn に resultId だけを出す）。
 * 4. タイプが 16 タイプに無い代表は除く（参照元も 16 タイプ以外の受験を捨てる。results では起きない）。
 * 5. 職業の表示名を引く。未知のコードは null（画面は「—」。旧コード 9 は「その他」で引ける）。
 * 6. 代表の submittedAt の降順（同じなら resultId の昇順）のまま返す。ログに氏名・電話番号を出さない
 */
export async function listOrganizationPeople(
  ctx: AdminContext,
): Promise<readonly OrganizationPerson[]> {
  // 1.
  const results = await listResults({ viewer: ctx });
  // 2.
  const heads = selectCountedHeads(results);
  // 3.
  const respondents = await getRespondentsByIds({
    organizationId: ctx.organizationId,
    respondentIds: heads.map((head) => head.respondentId),
  });
  const people: OrganizationPerson[] = [];
  for (const head of heads) {
    const respondent = respondents.get(head.respondentId);
    if (!respondent || respondent.deletedAt !== null) {
      // results と respondents の整合性の異常（論理削除は同一バッチのため通常は起きない）
      logger.warn("classification.respondent_missing", {
        requestId: ctx.request.requestId,
        resultId: head.resultId,
      });
      continue;
    }
    // 4.
    if (!APTITUDE_TYPES.has(head.aptitudeType)) {
      logger.warn("classification.unknown_type", {
        requestId: ctx.request.requestId,
        resultId: head.resultId,
      });
      continue;
    }
    // 5.
    let occupationLabel: string | null;
    try {
      occupationLabel = getOccupationLabel(respondent.occupationCode);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      occupationLabel = null;
      logger.warn("classification.unknown_occupation", {
        requestId: ctx.request.requestId,
        resultId: head.resultId,
      });
    }
    people.push({
      resultId: head.resultId,
      respondentId: head.respondentId,
      aptitudeType: head.aptitudeType,
      name: respondent.name,
      phoneNumber: respondent.phoneNumber,
      occupationLabel,
      teamCode: respondent.teamCode,
      submittedAt: head.submittedAt,
      employmentStatus: head.employmentStatus,
      hiredOn: head.hiredOn,
      leftOn: head.leftOn,
    });
  }
  // 6.
  return people;
}
