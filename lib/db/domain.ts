// ドメイン型（02 §5.4）: XxxDoc の Timestamp を Date に置き換え、文書 ID を id として加えたもの。
// Organization の inviteToken と AdminUser の dismissedAnnouncements は読み取りの形で上書きする（11-8 §3.14）
import type { Timestamp } from "firebase-admin/firestore";

import type {
  AdminUserDoc,
  AiAnalysisDoc,
  AnnouncementKey,
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

export type Organization = Omit<WithId<OrganizationDoc>, "inviteToken"> & {
  /** 招待トークンの平文（K-30）。M7 より前の文書と、形の違う値は null（11-8 §3.2） */
  readonly inviteToken: string | null;
};
export type AdminUser = Omit<WithId<AdminUserDoc>, "dismissedAnnouncements"> & {
  /** お知らせの既読（キー → 閉じた日時）。知らないキーと日時でない値は含まない（11-8 §3.3） */
  readonly dismissedAnnouncements: ReadonlyMap<AnnouncementKey, Date>;
};
export type Respondent = WithId<RespondentDoc>;
export type AssessmentSession = WithId<AssessmentSessionDoc>;
export type Result = WithId<ResultDoc>;
export type AiAnalysis = WithId<AiAnalysisDoc>;
export type UsageLog = WithId<UsageLogDoc>;
export type AuditLog = WithId<AuditLogDoc>;
