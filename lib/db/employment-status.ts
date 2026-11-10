// 受験のときの区分と、役職から決まる受検者区分（11-1 §3.5、11-2 §3.1・§3.2）。送信・読み取りの補い・
// scripts/backfill-m7.ts・役職の変更（updatePersonAttributes）が共有する純関数
import type { EmploymentStatus, RespondentKind, StaffRole } from "./types";

/** 受験のときの区分（K-28）。applicant（求職者用リンク）→ candidate、executive（既存スタッフ用リンク・再受験）→ employed */
export function initialEmploymentStatus(kind: RespondentKind): EmploymentStatus {
  return kind === "executive" ? "employed" : "candidate";
}

/**
 * 役職を変えたときの受検者区分（K-39 Q-02。11-2 §2.15・§3.2）。責任者（manager）・幹部（leader）→ executive（既存スタッフ）、
 * スタッフ（staff）→ applicant。受検者区分は閲覧範囲を決める（00 §5）
 */
export function respondentKindForStaffRole(role: StaffRole): RespondentKind {
  return role === "staff" ? "applicant" : "executive";
}
