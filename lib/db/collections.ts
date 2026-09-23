// コレクション名の定数と型付き参照（02 §5.2）。コレクション名の文字列リテラルを他の場所に書かない。
import type {
  CollectionReference,
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type {
  AdminUserDoc,
  AiAnalysisDoc,
  AssessmentSessionDoc,
  AuditLogDoc,
  OrganizationDoc,
  RespondentDoc,
  ResultDoc,
  UsageLogDoc,
} from "./types";
import { adminFirestore } from "@/lib/firebase/admin";

export const COLLECTIONS = {
  organizations: "organizations",
  adminUsers: "adminUsers",
  respondents: "respondents",
  assessmentSessions: "assessmentSessions",
  results: "results",
  aiAnalyses: "aiAnalyses",
  usageLogs: "usageLogs",
  auditLogs: "auditLogs",
} as const;
export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** 保存形をそのまま型付けするコンバータ（変換は行わない。読み取り時の検証は mapper が行う） */
function docConverter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (doc: T) => doc,
    fromFirestore: (snapshot: QueryDocumentSnapshot) => snapshot.data() as T,
  };
}

function typed<T extends DocumentData>(name: CollectionName): CollectionReference<T> {
  return adminFirestore().collection(name).withConverter(docConverter<T>());
}

export const organizationsRef = () => typed<OrganizationDoc>(COLLECTIONS.organizations);
export const adminUsersRef = () => typed<AdminUserDoc>(COLLECTIONS.adminUsers);
export const respondentsRef = () => typed<RespondentDoc>(COLLECTIONS.respondents);
export const assessmentSessionsRef = () =>
  typed<AssessmentSessionDoc>(COLLECTIONS.assessmentSessions);
export const resultsRef = () => typed<ResultDoc>(COLLECTIONS.results);
export const aiAnalysesRef = () => typed<AiAnalysisDoc>(COLLECTIONS.aiAnalyses);
export const usageLogsRef = () => typed<UsageLogDoc>(COLLECTIONS.usageLogs);
export const auditLogsRef = () => typed<AuditLogDoc>(COLLECTIONS.auditLogs);

/** コンバータ無しの参照（フィールドパス指定の update など、型付き参照で扱いにくい書き込み用。02 §5.2） */
export function rawCollection(name: CollectionName) {
  return adminFirestore().collection(name);
}

/** 生の Firestore（バッチ・トランザクションの開始に使う。lib/db 内部専用） */
export function db() {
  return adminFirestore();
}
