// 結果の取得・前回の候補・回答一覧の射影・母集団（02 §3.5、§8.5、11-1 §2.2.8、11-2 §3.11、11-5 §3.2）
import type { DocumentData, Query } from "firebase-admin/firestore";

import { canViewExecutives } from "@/lib/auth/claims";
import type { Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, db, rawCollection, resultsRef } from "@/lib/db/collections";
import type { Result } from "@/lib/db/domain";
import { initialEmploymentStatus } from "@/lib/db/employment-status";
import { fromSnapshot } from "@/lib/db/mappers/documents";
import { toPopulationSourceRow, toResult } from "@/lib/db/mappers/result";
import { toDate, toNullableDate } from "@/lib/db/mappers/timestamp";
import { selectPopulation, type PopulationRow } from "@/lib/db/population";
import { docIdSchema } from "@/lib/db/schemas/values";
import type {
  AiGenerationStatus,
  EmploymentStatus,
  RespondentKind,
  ResultDoc,
  StaffRole,
  TeamCode,
} from "@/lib/db/types";
import type { AptitudeTypeKey, ComparisonScope, SocialStyleKey } from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

export type { PopulationRow };

/** 組織一致・deletedAt == null・幹部の可視性（viewer.role）を満たす結果。満たさなければ null */
export async function getResult(input: {
  readonly resultId: string;
  readonly viewer: Viewer;
}): Promise<Result | null> {
  if (!docIdSchema.safeParse(input.resultId).success) return null;
  const r = fromSnapshot(await resultsRef().doc(input.resultId).get(), toResult);
  if (!r || r.organizationId !== input.viewer.organizationId || r.deletedAt !== null) return null;
  if (r.respondentKind === "executive" && !canViewExecutives(input.viewer.role)) return null;
  return r;
}

/**
 * Q-M7-1（11-1 §3.2.5）: 同じ組織で previousResultId == resultId かつ deletedAt == null の results（その結果の次の受験。
 * 11-7 §2.2.4）を limit 件まで。登録の canLinkAsPrevious() と送信のトランザクション（submitSession()）が使う
 * （11-7 の組み合わせは limit 2。つなぐ条件を 1 か所に置く。11-7 6 章の 9）。射影は付けない: 有無だけを見る
 * canLinkAsPrevious() と submitSession() は select() で文書名だけを読む（指標・氏名は読まない。11-1 §3.4.1、04 §4 の冒頭）
 */
export function nextResultsQuery(input: {
  readonly organizationId: string;
  readonly resultId: string;
  readonly limit: number;
}): Query {
  return rawCollection(COLLECTIONS.results)
    .where("organizationId", "==", input.organizationId)
    .where("previousResultId", "==", input.resultId)
    .where("deletedAt", "==", null)
    .limit(input.limit);
}

/**
 * 前回にできる文書か（有効な前回。11-7 §2.2.1）: 文書があり、organizationId が同じで、論理削除されていない
 * （11-1 §2.2.8 の手順 2・§2.7.3 の手順 3）。生の項目だけを見る（全項目の mapper は通さない）
 */
export function isValidPreviousDoc(
  data: DocumentData | undefined,
  organizationId: string,
): boolean {
  return data !== undefined && data.organizationId === organizationId && data.deletedAt === null;
}

/**
 * 前回の候補の文書を読むときの射影（getAll() の fieldMask）。isValidPreviousDoc() が見る 2 項目だけを読み、
 * 指標・氏名は読まない（11-1 §3.4.1、04 §4 の冒頭）。canLinkAsPrevious() と submitSession() が使う
 */
export const PREVIOUS_DOC_FIELD_MASK: readonly string[] = ["organizationId", "deletedAt"];

/**
 * 前回の候補の判定（11-1 §2.2.8 の手順 2・3）。つなげるなら true。
 * 文書が無い・別の組織・論理削除済みなら Q-M7-1 を読まずに false（ほかの組織の結果と存在しない ID が同じ読み取り 1 回で止まる）
 */
export async function canLinkAsPrevious(input: {
  readonly organizationId: string;
  readonly resultId: string;
}): Promise<boolean> {
  if (!docIdSchema.safeParse(input.resultId).success) return false;
  const [snapshot] = await db().getAll(rawCollection(COLLECTIONS.results).doc(input.resultId), {
    fieldMask: [...PREVIOUS_DOC_FIELD_MASK],
  });
  if (!isValidPreviousDoc(snapshot?.data(), input.organizationId)) return false;
  // すでにほかの論理削除されていない結果の前回になっていれば候補にしない（I-M7-2）。有無だけを見るので、次の受験は
  // select() で文書名だけを読む（指標・氏名は読まない）
  const next = await nextResultsQuery({
    organizationId: input.organizationId,
    resultId: input.resultId,
    limit: 1,
  })
    .select()
    .get();
  return next.empty;
}

/** Q3（owner / super_admin）または Q4（admin: respondentKind == "applicant"） */
function visibleResultsQuery(viewer: Viewer): Query {
  let query: Query = rawCollection(COLLECTIONS.results).where(
    "organizationId",
    "==",
    viewer.organizationId,
  );
  if (!canViewExecutives(viewer.role)) query = query.where("respondentKind", "==", "applicant");
  return query.where("deletedAt", "==", null).orderBy("submittedAt", "desc");
}

/**
 * 回答一覧の 1 行（受験 1 件。指標 map は含まない）。回答一覧（listResultRows）・受検者の更新（updatePerson）・
 * PR-7.6 までの今の回答一覧の画面の旧サービス（listResults）・11-7 の組み合わせの候補が使う。
 * M7 で足した 8 項目（11-2 §3.5 の手順 1・§3.11、11-6 §3.1、11-7 §4.5 の (5)）は、M7 より前の文書に無ければ toResult と
 * 同じ規則で補う（02 §5.5）
 */
export interface ResultListRow {
  readonly resultId: string;
  readonly respondentId: string;
  readonly respondentKind: RespondentKind;
  readonly teamCode: TeamCode | null;
  readonly isExcluded: boolean;
  readonly aptitudeType: AptitudeTypeKey;
  readonly socialStyle: SocialStyleKey;
  readonly reliability: number;
  readonly aiGenerationStatus: AiGenerationStatus;
  readonly scoringVersion: string;
  readonly submittedAt: Date;
  readonly previousResultId: string | null; // 前回の結果（11-7 §3.1）
  readonly employmentStatus: EmploymentStatus; // 区分・入社日・退職日・役職（11-2 §3.1）
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
  readonly staffRole: StaffRole | null;
  readonly longitudinalAiStatus: AiGenerationStatus; // 経年比較の AI 解説の状態（11-6 §3.1）
  readonly longitudinalAiStartedAt: Date | null;
  readonly latestLongitudinalAiAnalysisId: string | null;
}

/**
 * 閲覧範囲の受験の全件（Q3 / Q4）。select() で上記の列に射影して submittedAt の降順で返す（D04-55）。
 * 検索・絞り込み・並び替え・表示の上限は画面で行う（11-2 §3.5。PR-7.6 までの今の画面は旧サービスがメモリ上で行う）
 */
export async function listResults(input: {
  readonly viewer: Viewer;
}): Promise<readonly ResultListRow[]> {
  const snapshot = await visibleResultsQuery(input.viewer)
    .select(
      "respondentId",
      "respondentKind",
      "teamCode",
      "isExcluded",
      "aptitudeType",
      "socialStyle",
      "reliability",
      "aiGenerationStatus",
      "scoringVersion",
      "submittedAt",
      "previousResultId",
      "employmentStatus",
      "hiredOn",
      "leftOn",
      "staffRole",
      "longitudinalAiStatus",
      "longitudinalAiStartedAt",
      "latestLongitudinalAiAnalysisId",
    )
    .get();
  return snapshot.docs.map((doc) => {
    const d = doc.data() as Partial<ResultDoc>;
    const respondentKind = d.respondentKind as RespondentKind;
    return {
      resultId: doc.id,
      respondentId: String(d.respondentId),
      respondentKind,
      teamCode: (d.teamCode ?? null) as TeamCode | null,
      isExcluded: d.isExcluded === true,
      aptitudeType: d.aptitudeType as AptitudeTypeKey,
      socialStyle: d.socialStyle as SocialStyleKey,
      reliability: Number(d.reliability),
      aiGenerationStatus: d.aiGenerationStatus as AiGenerationStatus,
      scoringVersion: String(d.scoringVersion),
      submittedAt: toDate(d.submittedAt, "submittedAt"),
      // M7 で足した項目は、無ければ作成時の値で補い、ある値は検証しない（toResult と同じ。02 §5.5）
      previousResultId: d.previousResultId ?? null,
      employmentStatus: d.employmentStatus ?? initialEmploymentStatus(respondentKind),
      hiredOn: d.hiredOn ?? null,
      leftOn: d.leftOn ?? null,
      staffRole: d.staffRole ?? null,
      longitudinalAiStatus: d.longitudinalAiStatus ?? "not_generated",
      longitudinalAiStartedAt: toNullableDate(
        d.longitudinalAiStartedAt ?? null,
        "longitudinalAiStartedAt",
      ),
      latestLongitudinalAiAnalysisId: d.latestLongitudinalAiAnalysisId ?? null,
    };
  });
}

export interface ClassificationMember {
  readonly resultId: string;
  readonly respondentId: string;
  readonly respondentKind: RespondentKind;
  readonly isExcluded: boolean;
  readonly aptitudeType: AptitudeTypeKey;
  readonly socialStyle: SocialStyleKey;
  readonly submittedAt: Date;
}

/** 組織内分類用。Q3 / Q4 と同じ条件で全件を射影して読む。集計は呼び出し元（04）が行う */
export async function listResultsForClassification(input: {
  readonly viewer: Viewer;
}): Promise<readonly ClassificationMember[]> {
  const snapshot = await visibleResultsQuery(input.viewer)
    .select(
      "respondentId",
      "respondentKind",
      "isExcluded",
      "aptitudeType",
      "socialStyle",
      "submittedAt",
    )
    .get();
  return snapshot.docs.map((doc) => {
    const d = doc.data() as Partial<ResultDoc>;
    return {
      resultId: doc.id,
      respondentId: String(d.respondentId),
      respondentKind: d.respondentKind as RespondentKind,
      isExcluded: d.isExcluded === true,
      aptitudeType: d.aptitudeType as AptitudeTypeKey,
      socialStyle: d.socialStyle as SocialStyleKey,
      submittedAt: toDate(d.submittedAt, "submittedAt"),
    };
  });
}

/**
 * 母集団の取得（00 §1.11 の 3・10、11-5 §2.1.2・§3.2。Q1（改））。組織の論理削除されていない結果を全件、6 項目に射影して読み
 * （チームを選んでも組織の全件。置き換わったかの判定に全件が要る）、selectPopulation() で絞る:
 * 置き換わっていない（同じ組織の論理削除されていない結果のどれの previousResultId にも入っていない）、isExcluded == false、
 * scoringVersion == SCORING_VERSION（scope.kind == "team" なら teamCode == scope.teamCode）。
 * 幹部・閲覧対象本人も条件を満たせば含める（10 K-01）。個人情報は含まない。結果は保存しない（要件定義書 §11 の 6 番）
 */
export async function fetchPopulation(input: {
  readonly organizationId: string;
  readonly scope: ComparisonScope;
}): Promise<readonly PopulationRow[]> {
  const snapshot = await rawCollection(COLLECTIONS.results)
    .where("organizationId", "==", input.organizationId)
    .where("deletedAt", "==", null)
    .select(
      "traits",
      "compatibility",
      "isExcluded",
      "scoringVersion",
      "teamCode",
      "previousResultId",
    )
    .get();
  const rows = snapshot.docs.map((doc) => toPopulationSourceRow(doc.id, doc.data()));
  return selectPopulation(rows, input.scope, SCORING_VERSION);
}
