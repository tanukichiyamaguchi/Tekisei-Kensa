// 受験のときの区分（11-1 §3.5、11-2 §3.1）。送信・読み取りの補い・scripts/backfill-m7.ts が共有する純関数
import type { EmploymentStatus, RespondentKind } from "./types";

/** 受験のときの区分（K-28）。applicant（求職者用リンク）→ candidate、executive（既存スタッフ用リンク・再受験）→ employed */
export function initialEmploymentStatus(kind: RespondentKind): EmploymentStatus {
  return kind === "executive" ? "employed" : "candidate";
}
