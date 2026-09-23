// 結果の取得・母集団（02 §3.5、§8.5）
import type { Query } from "firebase-admin/firestore";

import { canViewExecutives } from "@/lib/auth/claims";
import type { Viewer } from "@/lib/auth/claims";
import { COLLECTIONS, rawCollection, resultsRef } from "@/lib/db/collections";
import type { Result } from "@/lib/db/domain";
import { fromSnapshot } from "@/lib/db/mappers/documents";
import { toPopulationMember, toResult } from "@/lib/db/mappers/result";
import { toDate } from "@/lib/db/mappers/timestamp";
import { docIdSchema } from "@/lib/db/schemas/values";
import type { AiGenerationStatus, RespondentKind, ResultDoc, TeamCode } from "@/lib/db/types";
import type {
  AptitudeTypeKey,
  ComparisonScope,
  PopulationMember,
  SocialStyleKey,
} from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

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

/** 回答一覧の 1 行（04 §5.3 の一覧・検索・並び替えに必要な列だけ。指標 map は含まない） */
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
}

/** 回答一覧。組織の結果を全件読み、select() で上記の列に射影して submittedAt 降順で返す（D04-55） */
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
    )
    .get();
  return snapshot.docs.map((doc) => {
    const d = doc.data() as Partial<ResultDoc>;
    return {
      resultId: doc.id,
      respondentId: String(d.respondentId),
      respondentKind: d.respondentKind as RespondentKind,
      teamCode: (d.teamCode ?? null) as TeamCode | null,
      isExcluded: d.isExcluded === true,
      aptitudeType: d.aptitudeType as AptitudeTypeKey,
      socialStyle: d.socialStyle as SocialStyleKey,
      reliability: Number(d.reliability),
      aiGenerationStatus: d.aiGenerationStatus as AiGenerationStatus,
      scoringVersion: String(d.scoringVersion),
      submittedAt: toDate(d.submittedAt, "submittedAt"),
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

export interface PopulationRow extends PopulationMember {
  readonly resultId: string;
}

/**
 * 母集団の取得（00 §1.11 のクエリ。Q1 / Q2）。
 * 条件: organizationId ==, isExcluded == false, scoringVersion == SCORING_VERSION, deletedAt == null
 * （scope.kind == "team" なら teamCode == scope.teamCode）。幹部・閲覧対象本人も条件を満たせば含める（10 K-01）。
 * 個人情報は含まない。結果は保存しない（要件定義書 §11 の 6 番）
 */
export async function fetchPopulation(input: {
  readonly organizationId: string;
  readonly scope: ComparisonScope;
}): Promise<readonly PopulationRow[]> {
  let query: Query = rawCollection(COLLECTIONS.results)
    .where("organizationId", "==", input.organizationId)
    .where("isExcluded", "==", false)
    .where("scoringVersion", "==", SCORING_VERSION)
    .where("deletedAt", "==", null);
  if (input.scope.kind === "team") query = query.where("teamCode", "==", input.scope.teamCode);
  const snapshot = await query.select("traits", "compatibility").get();
  return snapshot.docs.map((doc) => ({
    resultId: doc.id,
    ...toPopulationMember(doc.data() as Pick<ResultDoc, "traits" | "compatibility">),
  }));
}
