// ドメイン型（02 §5.4）: XxxDoc の Timestamp を Date に置き換え、文書 ID を id として加えたもの。
import type { Timestamp } from "firebase-admin/firestore";

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

/**
 * Timestamp を Date に、Timestamp | null を Date | null に置き換える。
 * [T[K]] と括って分配を止め、null を含む場合を先に判定する（02 §5.4 の実装時確認）。
 */
type DatedValue<V> = [V] extends [Timestamp]
  ? Date
  : [V] extends [Timestamp | null]
    ? Date | null
    : V;
type Dated<T> = { readonly [K in keyof T]: DatedValue<T[K]> };
type WithId<T> = { readonly id: string } & Dated<T>;

export type Organization = WithId<OrganizationDoc>;
export type AdminUser = WithId<AdminUserDoc>;
export type Respondent = WithId<RespondentDoc>;
export type AssessmentSession = WithId<AssessmentSessionDoc>;
export type Result = WithId<ResultDoc>;
export type AiAnalysis = WithId<AiAnalysisDoc>;
export type UsageLog = WithId<UsageLogDoc>;
export type AuditLog = WithId<AuditLogDoc>;
