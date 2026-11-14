// アプリ側のレート制限（04 §2.8）。件数は Firestore の count() 集計で数える。
// AI 解説の生成の日次上限は無くなった（K-25。費用は Anthropic Console の利用上限で管理する。11-6 §2.10）
import { API_ERRORS } from "./errors";
import { countRecentAuditLogs } from "@/lib/db/repositories/audit-logs-repository";

/** 受検者登録: 組織 × IP で 10 分 20 件（01 の仮置き） */
export const REGISTRATION_LIMIT = { count: 20, windowMs: 10 * 60 * 1000 } as const;

/** ipAddress が null のときは制限しない（Firewall に委ねる） */
export async function assertRegistrationAllowed(input: {
  readonly organizationId: string;
  readonly ipAddress: string | null;
  readonly now: Date;
}): Promise<void> {
  if (input.ipAddress === null) return;
  const count = await countRecentAuditLogs({
    organizationId: input.organizationId,
    action: "respondent.register",
    ipAddress: input.ipAddress,
    since: new Date(input.now.getTime() - REGISTRATION_LIMIT.windowMs),
  });
  if (count >= REGISTRATION_LIMIT.count) throw API_ERRORS.rateLimited(600);
}
